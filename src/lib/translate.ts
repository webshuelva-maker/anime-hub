const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export interface TranslationOutcome {
  result: { title: string; summary: string; body: string } | null;
  debug: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOnce(
  title: string,
  summary: string,
  body: string,
  apiKey: string
): Promise<{ ok: true; text: string } | { ok: false; retryable: boolean; debug: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "Traduces textos de noticias de anime del inglés al español de España, de forma natural, sin literalidades raras. No traduces nombres propios de personas, estudios ni títulos de obras si no tienen una traducción oficial conocida. Respondes ÚNICAMENTE con este formato exacto, sin nada más antes ni después:\nTITULO: <traducción>\nRESUMEN: <traducción>\nCUERPO: <traducción>",
          },
          { role: "user", content: `TITULO: ${title}\nRESUMEN: ${summary}\nCUERPO: ${body}` },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      // 429 (límite de peticiones) y 5xx (servidor saturado/caído) merecen
      // un segundo intento; el resto (clave mala, etc.) no tiene sentido
      // reintentarlo.
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, retryable, debug: `NVIDIA respondió ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, retryable: true, debug: `excepción: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Traduce título + resumen + cuerpo de una noticia al español en una sola
 * llamada. Si NVIDIA responde que está saturado (o hay un fallo de red),
 * reintenta una vez tras una breve espera antes de rendirse — esos fallos
 * suelen ser puntuales, no un problema real de configuración.
 */
export async function translateNewsFields(
  title: string,
  summary: string,
  body: string
): Promise<TranslationOutcome> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { result: null, debug: "sin NVIDIA_API_KEY configurada" };

  let attempt = await callOnce(title, summary, body, apiKey);
  if (!attempt.ok && attempt.retryable) {
    await sleep(1200);
    attempt = await callOnce(title, summary, body, apiKey);
  }

  if (!attempt.ok) {
    return { result: null, debug: attempt.debug };
  }

  const text = attempt.text.replace(/\*\*/g, "").replace(/\*/g, "");
  const titleMatch = text.match(/T[IÍ]TULO:\s*([\s\S]*?)(?:\n\s*RESUMEN:|$)/i);
  const summaryMatch = text.match(/RESUMEN:\s*([\s\S]*?)(?:\n\s*CUERPO:|$)/i);
  const bodyMatch = text.match(/CUERPO:\s*([\s\S]*)/i);

  if (!titleMatch?.[1]?.trim() || !bodyMatch?.[1]?.trim()) {
    return { result: null, debug: `no se pudo interpretar la respuesta: "${attempt.text.slice(0, 150)}"` };
  }

  return {
    result: {
      title: titleMatch[1].trim(),
      summary: summaryMatch?.[1]?.trim() || titleMatch[1].trim(),
      body: bodyMatch[1].trim(),
    },
    debug: "ok",
  };
}
