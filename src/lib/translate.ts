const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export interface TranslationOutcome {
  result: { title: string; summary: string; body: string } | null;
  debug: string;
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
): Promise<{ ok: true; text: string } | { ok: false; tryFallback: boolean; debug: string }> {
  const controller = new AbortController();
  // Netlify mata las funciones serverless estándar a los 10s (26s como
  // máximo en plan Pro). Con 18s por intento, dos intentos ya sumaban
  // hasta 54s — la función moría a medias sin que este código llegara a
  // enterarse ni a devolver nada útil. Con 9s, dos intentos (principal +
  // respaldo) caben en 18s, dentro del límite de 26s de Pro. En el plan
  // gratuito (10s) sigue pudiendo no dar tiempo con un solo intento lento;
  // si eso pasa a menudo conviene subir el timeout de la función en
  // Netlify (Project configuration → Functions) si el plan lo permite.
  const timeout = setTimeout(() => controller.abort(), 9000);

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
              "Traduces textos de noticias de anime del inglés al español de España, de forma natural, sin literalidades raras. MUY IMPORTANTE: los títulos de anime, manga, novelas ligeras, videojuegos o películas NUNCA se traducen, se dejan EXACTAMENTE como están en el texto original (en inglés o rōmaji), aunque el resto de la frase sí se traduzca. Por ejemplo, si el texto dice 'Smoking Behind the Supermarket with You Gets New Trailer', el título traducido debe ser algo como 'Smoking Behind the Supermarket with You revela nuevo tráiler' — el nombre de la obra no se toca. Tampoco traduces nombres propios de personas ni estudios. Respondes ÚNICAMENTE con este formato exacto, cada etiqueta en su PROPIA línea nueva, sin nada más antes ni después:\nTITULO: <traducción>\nRESUMEN: <traducción>\nCUERPO: <traducción>",
          },
          { role: "user", content: `TITULO: ${title}\nRESUMEN: ${summary}\nCUERPO: ${body}` },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      // 429/5xx suelen fallar rápido — merece la pena probar el modelo de
      // respaldo (reintentar el MISMO modelo ya no se hace: con el
      // presupuesto de tiempo tan ajustado de una función serverless, un
      // modelo distinto tiene más probabilidades de ir bien que esperar y
      // repetir la misma llamada que ya falló).
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, tryFallback: retryable, debug: `NVIDIA respondió ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, tryFallback: true, debug: `excepción: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Traduce título + resumen + cuerpo de una noticia al español. Si el
 * modelo configurado está saturado o tarda demasiado, prueba UNA vez con
 * un modelo de respaldo distinto antes de rendirse (casi nunca están los
 * dos saturados a la vez) — ya no reintenta el mismo modelo, para que el
 * tiempo total de las dos llamadas quepa dentro del límite de una
 * función serverless (ver comentario de timeout en callOnce).
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
