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
): Promise<{ ok: true; text: string } | { ok: false; debug: string }> {
  const controller = new AbortController();
  // Confirmado: plan gratuito de Netlify → límite duro de 10s por
  // función. Con eso no caben ni siquiera DOS llamadas de 9s en la misma
  // invocación (18s > 10s) — así que cada invocación hace como mucho UNA
  // llamada a NVIDIA. 8s deja algo de margen (arranque en frío, overhead
  // de red) dentro de esos 10s. El reintento con el modelo de respaldo ya
  // NO pasa aquí dentro: lo dispara el propio cliente con una segunda
  // petición HTTP aparte (con su propio presupuesto de 10s), pasando
  // preferFallback=true — ver translateNewsFields más abajo y quien la
  // llama en /api/translate-detail.
  const timeout = setTimeout(() => controller.abort(), 8000);

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
      return { ok: false, debug: `NVIDIA respondió ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, debug: `excepción: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Traduce título + resumen + cuerpo de una noticia al español. Hace
 * UNA sola llamada a NVIDIA (ver por qué en el comentario de timeout de
 * callOnce) — usa el modelo principal salvo que preferFallback sea true,
 * en cuyo caso usa directamente el de respaldo. Quien llama a esta
 * función decide cuándo pasar preferFallback=true: normalmente en un
 * segundo intento, con una petición HTTP nueva, después de que el primero
 * fallara.
 */
export async function translateNewsFields(
  title: string,
  summary: string,
  body: string,
  maxTokens = 2000,
  preferFallback = false
): Promise<TranslationOutcome> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { result: null, debug: "sin NVIDIA_API_KEY configurada" };

  const primaryModel = process.env.NVIDIA_MODEL || FALLBACK_MODEL;
  const model = preferFallback && primaryModel !== FALLBACK_MODEL ? FALLBACK_MODEL : primaryModel;

  const attempt = await callOnce(title, summary, body, apiKey, model, maxTokens);

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
