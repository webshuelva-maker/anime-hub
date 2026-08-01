import { classifySource, ResearchSource } from "./sourceTiers";

/**
 * Toda la lógica de investigación real vive aquí, no en la ruta, porque
 * ahora la usan DOS rutas: la clásica (/api/assistant/research, que
 * devuelve un JSON de una vez) y la nueva en directo
 * (/api/assistant/stream, que va contando los pasos según ocurren). Si
 * estuviera duplicada, una de las dos se quedaría desactualizada tarde o
 * temprano.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * "Compound" es el sistema agéntico de Groq: mismo endpoint y misma
 * clave que el resto de la app, pero con búsqueda web REAL integrada del
 * lado del servidor. groq/compound permite varias búsquedas por petición
 * (lo que hace falta para contrastar oficial contra rumor);
 * groq/compound-mini solo permite una pero es unas 3 veces más rápido,
 * y se usa de respaldo.
 */
export const RESEARCH_MODEL = "groq/compound";
export const RESEARCH_FALLBACK_MODEL = "groq/compound-mini";

interface GroqSearchResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface GroqExecutedTool {
  search_results?: { results?: GroqSearchResult[] };
}

interface GroqCompoundResponse {
  choices?: {
    message?: {
      content?: string;
      reasoning?: string;
      executed_tools?: GroqExecutedTool[];
    };
  }[];
}

export interface ResearchOutcome {
  ok: boolean;
  /**
   * true solo si la búsqueda web devolvió fuentes REALES. Si es false, el
   * dossier se descarta entero: un texto sin fuentes detrás es el modelo
   * escribiendo de memoria, y eso es exactamente lo que produjo el fallo
   * de los "tuits del director" y el "documento filtrado de Studio Bind"
   * que no existen. Sin fuentes, no hay investigación.
   */
  grounded: boolean;
  /** Texto estructurado con OFICIAL / RUMORES / CONTEXTO. */
  dossier: string;
  sources: ResearchSource[];
  /** Búsquedas que el modelo ejecutó de verdad, tal cual las escribió. */
  queries: string[];
  debug: string;
}

function buildResearchPrompt(question: string): string {
  const today = new Date().toISOString().slice(0, 10);

  return `Eres un investigador de noticias de anime y manga. Hoy es ${today}.

PREGUNTA DEL USUARIO: "${question}"

Busca en internet información REAL y ACTUAL para responderla. Haz como máximo 3 búsquedas, en inglés y/o japonés si hace falta (así se encuentran los anuncios de verdad, no solo webs de rumores en español).

Lo más importante de tu trabajo es SEPARAR dos cosas que suelen mezclarse:
1. Lo CONFIRMADO oficialmente: anuncios del estudio, la editorial, la web o cuenta oficial de la obra, la plataforma que la emite, o una revista japonesa que publica el anuncio.
2. Lo que solo son RUMORES o filtraciones: filtradores, foros, agregadores de noticias, "se espera que", cuentas no oficiales.

Un rumor puede ser muy probable y aun así seguir siendo un rumor. Dilo tal cual, no lo asciendas a confirmado.

Responde EXACTAMENTE con este formato, sin añadir nada antes ni después:

TITULO_CANONICO: <título en romaji del anime principal del que trata la pregunta, o NINGUNO si no va de un anime concreto>
ESTADO: <uno de: confirmado-con-fecha | confirmado-sin-fecha | en-produccion | solo-rumores | sin-informacion | terminado | ya-emitido>
FECHA_MAS_RECIENTE: <fecha aproximada AAAA-MM de la noticia MÁS NUEVA que hayas encontrado sobre esto, o DESCONOCIDA>
OFICIAL:
- <dato confirmado — quién lo anunció y cuándo. Si no hay nada confirmado, escribe "nada confirmado todavía">
RUMORES:
- <rumor — de dónde sale, de cuándo es, y si es creíble o no y por qué. Si no hay rumores, escribe "sin rumores relevantes">
CONTEXTO:
- <cualquier dato útil para entender la situación: retrasos, declaraciones, ventas, estado del manga original, etc.>`;
}

/**
 * Saca del campo "reasoning" las búsquedas que el modelo ejecutó
 * realmente. Groq las escribe ahí con la forma <tool>search(...)</tool>,
 * así que se pueden enseñar al usuario tal cual: son las consultas de
 * verdad, no una reconstrucción inventada.
 */
function extractQueries(reasoning: string, sources: ResearchSource[]): string[] {
  const queries: string[] = [];
  const pattern = /<tool>\s*(?:search|web_search|visit|visit_website)\s*\(([^)]{2,120})\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(reasoning)) !== null) {
    const q = match[1].trim().replace(/^["']|["']$/g, "");
    if (q && !queries.includes(q)) queries.push(q);
  }

  // Plan B: si el formato del razonamiento cambia y el patrón falla, al
  // menos enseñamos los sitios que se leyeron, que también es real.
  if (queries.length === 0 && sources.length > 0) {
    for (const s of sources.slice(0, 3)) {
      if (!queries.includes(s.domain)) queries.push(s.domain);
    }
  }

  return queries.slice(0, 4);
}

/**
 * Plan B para recuperar las fuentes: cuando el campo estructurado
 * search_results viene vacío, las URLs siguen apareciendo dentro del
 * texto del razonamiento (bloques "Title: ... URL: <https://...>").
 * Rescatarlas de ahí evita quedarnos con cero fuentes y tirar una
 * investigación que sí se hizo.
 */
function extractSourcesFromReasoning(reasoning: string): ResearchSource[] {
  const found: ResearchSource[] = [];
  const seen = new Set<string>();
  const pattern = /(?:Title:\s*(.+?)\s*\n)?\s*URL:\s*<?(https?:\/\/[^\s>)]+)>?/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(reasoning)) !== null) {
    const url = match[2];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    found.push(classifySource(url, match[1] ?? ""));
  }
  return found;
}

async function callCompound(
  apiKey: string,
  model: string,
  question: string,
  timeoutMs: number
): Promise<ResearchOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        // Compound se documenta con mensajes de usuario, no de sistema —
        // todas las instrucciones van dentro del propio mensaje para no
        // depender de un comportamiento no documentado.
        messages: [{ role: "user", content: buildResearchPrompt(question) }],
        temperature: 0.2, // es una tarea de datos, no de creatividad
        max_tokens: 900,
        // Se habilitan explícitamente las herramientas: por defecto el
        // sistema decide si busca o no, y cuando decidía no buscar
        // devolvía un texto escrito de memoria con pinta de investigado.
        compound_custom: { tools: { enabled_tools: ["web_search", "visit_website"] } },
        search_settings: {
          exclude_domains: ["pinterest.com", "*.pinterest.com"],
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return {
        ok: false,
        grounded: false,
        dossier: "",
        sources: [],
        queries: [],
        debug: `Groq (investigación) respondió ${res.status}: ${errBody.slice(0, 300)}`,
      };
    }

    const data: GroqCompoundResponse = await res.json();
    const message = data?.choices?.[0]?.message;
    const content = message?.content ?? "";

    const reasoning = message?.reasoning ?? "";
    const seen = new Set<string>();
    let sources: ResearchSource[] = [];
    for (const tool of message?.executed_tools ?? []) {
      for (const r of tool.search_results?.results ?? []) {
        if (!r.url || seen.has(r.url)) continue;
        seen.add(r.url);
        sources.push(classifySource(r.url, r.title ?? ""));
      }
    }
    if (sources.length === 0) sources = extractSourcesFromReasoning(reasoning);

    if (!content.trim()) {
      return { ok: false, grounded: false, dossier: "", sources, queries: [], debug: "respuesta vacía de Groq" };
    }

    // Sin ninguna fuente, el dossier NO se devuelve: da igual lo
    // convincente que suene, no hay nada que lo respalde.
    const grounded = sources.length > 0;

    return {
      ok: true,
      grounded,
      dossier: grounded ? content : "",
      sources: sources.slice(0, 8),
      queries: extractQueries(reasoning, sources),
      debug: grounded ? "ok" : "el buscador no devolvió ninguna fuente: dossier descartado",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, grounded: false, dossier: "", sources: [], queries: [], debug: `excepción: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

/** Investiga con el sistema grande y, si falla, reintenta con el rápido. */
export async function runResearch(
  apiKey: string,
  question: string,
  timeoutMs = 22000
): Promise<ResearchOutcome> {
  const first = await callCompound(apiKey, RESEARCH_MODEL, question, timeoutMs);
  // Se reintenta no solo cuando falla, sino también cuando "funciona"
  // pero sin una sola fuente: eso significa que no llegó a buscar, y una
  // segunda pasada con el sistema rápido suele sí hacerlo.
  if (first.ok && first.grounded) return first;

  const second = await callCompound(
    apiKey,
    RESEARCH_FALLBACK_MODEL,
    question,
    Math.min(timeoutMs, 15000)
  );
  if (second.ok && second.grounded) return second;
  return first.ok ? first : second;
}

export function extractCanonicalTitle(dossier: string): string | null {
  const match = dossier.match(/TITULO_CANONICO:\s*(.+)/i);
  if (!match) return null;
  const value = match[1].trim().replace(/^["“]|["”]$/g, "");
  if (!value || /^ninguno$/i.test(value)) return null;
  return value;
}

export function extractStatus(dossier: string): string | null {
  const match = dossier.match(/ESTADO:\s*([a-zñáéíóú-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

export function extractLatestDate(dossier: string): string | null {
  const match = dossier.match(/FECHA_MAS_RECIENTE:\s*(\d{4}-\d{2})/i);
  return match ? match[1] : null;
}
