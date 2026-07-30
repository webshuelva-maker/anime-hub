const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export interface TranslationOutcome {
  result: { title: string; summary: string; body: string } | null;
  debug: string;
}

/**
 * Traduce título + resumen + cuerpo de una noticia al español en una sola
 * llamada (para gastar solo una petición por noticia). Si no hay clave de
 * NVIDIA configurada, o la traducción falla o tarda demasiado, el texto se
 * queda en su idioma original — nunca rompe el feed. Devuelve también un
 * "debug" corto para poder diagnosticar sin adivinar.
 */
export async function translateNewsFields(
  title: string,
  summary: string,
  body: string
): Promise<TranslationOutcome> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { result: null, debug: "sin NVIDIA_API_KEY configurada" };

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
          {
            role: "user",
            content: `TITULO: ${title}\nRESUMEN: ${summary}\nCUERPO: ${body}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return { result: null, debug: `NVIDIA respondió ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();
    const rawText: string = data?.choices?.[0]?.message?.content ?? "";
    const text = rawText.replace(/\*\*/g, "").replace(/\*/g, "");

    const titleMatch = text.match(/T[IÍ]TULO:\s*([\s\S]*?)(?:\n\s*RESUMEN:|$)/i);
    const summaryMatch = text.match(/RESUMEN:\s*([\s\S]*?)(?:\n\s*CUERPO:|$)/i);
    const bodyMatch = text.match(/CUERPO:\s*([\s\S]*)/i);

    if (!titleMatch?.[1]?.trim() || !bodyMatch?.[1]?.trim()) {
      return { result: null, debug: `no se pudo interpretar la respuesta: "${rawText.slice(0, 150)}"` };
    }

    return {
      result: {
        title: titleMatch[1].trim(),
        summary: summaryMatch?.[1]?.trim() || titleMatch[1].trim(),
        body: bodyMatch[1].trim(),
      },
      debug: "ok",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { result: null, debug: `excepción: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}
