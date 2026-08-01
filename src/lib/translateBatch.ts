const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const FALLBACK_MODEL = "meta/llama-3.1-70b-instruct";

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
  // Plan gratuito de Netlify → 10s duros por función. Esta función hace
  // como mucho UNA llamada a NVIDIA por invocación (8s de margen); el
  // reintento con el modelo de respaldo lo dispara el cliente con una
  // segunda petición HTTP aparte (ver NewsFeed.tsx).
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(items) },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const debug = `NVIDIA respondió ${res.status}: ${errBody.slice(0, 200)}`;
      console.error(`[translate-batch] ${debug}`);
      return { ok: false, debug };
    }

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    // Por si el modelo envuelve el JSON en ```json ... ``` pese a que se le pide que no.
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
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
 * Traduce varias noticias EN UNA SOLA LLAMADA a NVIDIA, en vez de una
 * petición por noticia. Hace UNA sola llamada por invocación — usa el
 * modelo principal salvo que preferFallback sea true, en cuyo caso usa
 * directamente el de respaldo.
 */
export async function translateBatch(items: BatchTranslateItem[], preferFallback = false): Promise<BatchTranslateResult[]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || items.length === 0) return [];

  const primaryModel = process.env.NVIDIA_MODEL || FALLBACK_MODEL;
  const model = preferFallback && primaryModel !== FALLBACK_MODEL ? FALLBACK_MODEL : primaryModel;

  const attempt = await callBatch(items, apiKey, model);
  return attempt.ok ? attempt.results : [];
}
