const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

export interface BatchTranslateItem {
  id: string;
  title: string;
  summary: string;
}

export interface BatchTranslateResult {
  id: string;
  title: string;
  summary: string;
}

const SYSTEM_PROMPT = `Traduces titulares y resúmenes de noticias de anime del inglés al español de España, de forma natural.

MUY IMPORTANTE: los títulos oficiales de anime, manga, novelas ligeras, videojuegos y los nombres de estudios NUNCA se traducen — se dejan EXACTAMENTE como están en el texto original. Ejemplos que deben quedar igual: "Smoking Behind the Supermarket with You", "Jujutsu Kaisen", "Dandadan", "Chainsaw Man", "Kyoto Animation". Solo se traduce el texto descriptivo alrededor.

Te llega un array JSON con varias noticias, cada una con "id", "title" y "summary". Devuelve ÚNICAMENTE un array JSON con la MISMA estructura y el MISMO orden e "id" de cada una, con "title" y "summary" ya traducidos. No añadas ningún texto antes ni después del array, ni explicaciones, ni comentarios.`;

async function callBatch(
  items: BatchTranslateItem[],
  apiKey: string,
  model: string
): Promise<{ ok: true; results: BatchTranslateResult[] } | { ok: false; debug: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nComo tu respuesta debe ser JSON puro, envuelve el array bajo una clave "items": {"items": [...]}`,
          },
          { role: "user", content: JSON.stringify(items) },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const debug = `Groq respondió ${res.status}: ${errBody.slice(0, 200)}`;
      console.error(`[translate-batch] ${debug}`);
      return { ok: false, debug };
    }

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

    // Con response_format json_object, Groq devuelve un objeto — puede
    // venir como {"items": [...]} (lo que pedimos) o, si el modelo no lo
    // sigue al pie de la letra, como el array suelto. Se aceptan los dos.
    try {
      const parsedObj = JSON.parse(cleaned);
      if (Array.isArray(parsedObj)) return { ok: true, results: parsedObj };
      if (Array.isArray(parsedObj?.items)) return { ok: true, results: parsedObj.items };
    } catch {
      // sigue abajo al respaldo con regex
    }

    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error(`[translate-batch] respuesta sin JSON: "${raw.slice(0, 200)}"`);
      return { ok: false, debug: `respuesta sin JSON: "${raw.slice(0, 150)}"` };
    }
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return { ok: false, debug: "el JSON devuelto no es un array" };

    return { ok: true, results: parsed };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[translate-batch] excepción: ${message}`);
    return { ok: false, debug: `excepción: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Traduce varias noticias EN UNA SOLA LLAMADA a Groq, en vez de una
 * petición por noticia. Usa el modelo principal salvo que preferFallback
 * sea true, en cuyo caso usa directamente el de respaldo.
 */
export async function translateBatch(items: BatchTranslateItem[], preferFallback = false): Promise<BatchTranslateResult[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || items.length === 0) return [];

  const model = preferFallback ? FALLBACK_MODEL : PRIMARY_MODEL;
  const attempt = await callBatch(items, apiKey, model);
  return attempt.ok ? attempt.results : [];
}
