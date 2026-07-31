const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export interface TranslationOutcome {
  result: { title: string; summary: string; body: string } | null;
  debug: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Si el modelo configurado está saturado incluso tras reintentar, se
// prueba con este como plan B — no siempre coinciden los picos de tráfico
// entre modelos distintos.
const FALLBACK_MODEL = "meta/llama-3.1-70b-instruct";

async function callOnce(
  title: string,
  summary: string,
  body: string,
  apiKey: string,
  model: string,
  maxTokens: number
): Promise<{ ok: true; text: string } | { ok: false; sameModelRetry: boolean; tryFallback: boolean; debug: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content:
              "Traduces textos de noticias de anime del inglés al español de España, de forma natural, sin literalidades raras. No traduces nombres propios de personas, estudios ni títulos de obras si no tienen una traducción oficial conocida. Respondes ÚNICAMENTE con este formato exacto, cada etiqueta en su PROPIA línea nueva, sin nada más antes ni después:\nTITULO: <traducción>\nRESUMEN: <traducción>\nCUERPO: <traducción>",
          },
          { role: "user", content: `TITULO: ${title}\nRESUMEN: ${summary}\nCUERPO: ${body}` },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      // 429/5xx suelen fallar rápido — merece la pena tanto reintentar el
      // mismo modelo como, si sigue sin ir, probar el de respaldo.
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, sameModelRetry: retryable, tryFallback: retryable, debug: `NVIDIA respondió ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    // Si se agotó el tiempo esperando (modelo lento), reintentar EL MISMO
    // modelo solo duplicaría la espera sin garantías — pero un modelo
    // DISTINTO puede ir a otra velocidad, así que ese sí merece probarse.
    const isTimeout = e instanceof Error && e.name === "AbortError";
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, sameModelRetry: !isTimeout, tryFallback: true, debug: `excepción: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Traduce título + resumen + cuerpo de una noticia al español. Si el
 * modelo configurado está saturado (error rápido, no por lentitud),
 * reintenta una vez, y si sigue sin ir, prueba con un modelo de respaldo
 * distinto antes de rendirse — casi nunca están los dos saturados a la vez.
 */
export async function translateNewsFields(
  title: string,
  summary: string,
  body: string,
  maxTokens = 2000
): Promise<TranslationOutcome> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { result: null, debug: "sin NVIDIA_API_KEY configurada" };

  const primaryModel = process.env.NVIDIA_MODEL || FALLBACK_MODEL;

  let attempt = await callOnce(title, summary, body, apiKey, primaryModel, maxTokens);
  if (!attempt.ok && attempt.sameModelRetry) {
    await sleep(800);
    attempt = await callOnce(title, summary, body, apiKey, primaryModel, maxTokens);
  }

  if (!attempt.ok && attempt.tryFallback && primaryModel !== FALLBACK_MODEL) {
    attempt = await callOnce(title, summary, body, apiKey, FALLBACK_MODEL, maxTokens);
  }

  if (!attempt.ok) {
    return { result: null, debug: attempt.debug };
  }

  const text = attempt.text.replace(/\*\*/g, "").replace(/\*/g, "");

  // Sin exigir que RESUMEN/CUERPO empiecen en su propia línea — algunos
  // modelos a veces los ponen seguidos en la misma línea pese a que se les
  // pide lo contrario, y exigir el salto de línea hacía que el título se
  // "tragara" las demás etiquetas enteras cuando eso pasaba.
  const titleMatch = text.match(/T[IÍ]TULO:\s*([\s\S]*?)\s*RESUMEN:/i);
  const summaryMatch = text.match(/RESUMEN:\s*([\s\S]*?)\s*CUERPO:/i);
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
