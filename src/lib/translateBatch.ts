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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SYSTEM_PROMPT = `Traduces titulares y resúmenes de noticias de anime del inglés al español de España, de forma natural.

MUY IMPORTANTE: los títulos oficiales de anime, manga, novelas ligeras, videojuegos y los nombres de estudios NUNCA se traducen — se dejan EXACTAMENTE como están en el texto original. Ejemplos que deben quedar igual: "Smoking Behind the Supermarket with You", "Jujutsu Kaisen", "Dandadan", "Chainsaw Man", "Kyoto Animation". Solo se traduce el texto descriptivo alrededor.

Te llega un array JSON con varias noticias, cada una con "id", "title" y "summary". Devuelve ÚNICAMENTE un array JSON con la MISMA estructura y el MISMO orden e "id" de cada una, con "title" y "summary" ya traducidos. No añadas ningún texto antes ni después del array, ni explicaciones, ni comentarios.`;

async function callBatch(
  items: BatchTranslateItem[],
  apiKey: string,
  model: string
): Promise<{ ok: true; results: BatchTranslateResult[] } | { ok: false; retryable: boolean; debug: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

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
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, retryable, debug: `NVIDIA respondió ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    // Por si el modelo envuelve el JSON en ```json ... ``` pese a que se le pide que no.
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return { ok: false, retryable: false, debug: `respuesta sin JSON: "${raw.slice(0, 150)}"` };

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return { ok: false, retryable: false, debug: "el JSON devuelto no es un array" };

    return { ok: true, results: parsed };
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, retryable: !isTimeout, debug: `excepción: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Traduce varias noticias EN UNA SOLA LLAMADA a NVIDIA, en vez de una
 * petición por noticia. Esto es lo que de verdad soluciona los límites de
 * peticiones simultáneas: 1-2 llamadas en vez de 12-16.
 */
export async function translateBatch(items: BatchTranslateItem[]): Promise<BatchTranslateResult[]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || items.length === 0) return [];

  const primaryModel = process.env.NVIDIA_MODEL || FALLBACK_MODEL;

  let attempt = await callBatch(items, apiKey, primaryModel);
  if (!attempt.ok && attempt.retryable) {
    await sleep(1000);
    attempt = await callBatch(items, apiKey, primaryModel);
  }
  if (!attempt.ok && attempt.retryable && primaryModel !== FALLBACK_MODEL) {
    attempt = await callBatch(items, apiKey, FALLBACK_MODEL);
  }

  return attempt.ok ? attempt.results : [];
}
