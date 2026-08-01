const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface TranslationOutcome {
  result: { title: string; summary: string; body: string } | null;
  debug: string;
}

// Groq usa un formato de API compatible con OpenAI (igual que NVIDIA),
// así que la forma de llamar es casi idéntica — solo cambia la URL, la
// clave y los nombres de los modelos. Groq está construido con hardware
// propio (LPU) pensado específicamente para respuestas rápidas, que es
// justo lo que faltaba con el tier gratuito de NVIDIA.
const PRIMARY_MODEL = "llama-3.3-70b-versatile";
// Modelo más pequeño y rápido para el segundo intento si el principal falla.
const FALLBACK_MODEL = "llama-3.1-8b-instant";

async function callOnce(
  title: string,
  summary: string,
  body: string,
  apiKey: string,
  model: string,
  maxTokens: number
): Promise<{ ok: true; text: string } | { ok: false; debug: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(GROQ_URL, {
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
      const debug = `Groq respondió ${res.status}: ${errBody.slice(0, 200)}`;
      console.error(`[translate-detail] ${debug}`);
      return { ok: false, debug };
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[translate-detail] excepción: ${message}`);
    return { ok: false, debug: `excepción: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Traduce título + resumen + cuerpo de una noticia al español con Groq.
 * Usa el modelo principal salvo que preferFallback sea true, en cuyo
 * caso usa directamente el de respaldo (más pequeño y rápido).
 */
export async function translateNewsFields(
  title: string,
  summary: string,
  body: string,
  maxTokens = 2000,
  preferFallback = false
): Promise<TranslationOutcome> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { result: null, debug: "sin GROQ_API_KEY configurada" };

  const model = preferFallback ? FALLBACK_MODEL : PRIMARY_MODEL;
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
