const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/**
 * Traduce título + resumen + cuerpo de una noticia al español en una sola
 * llamada (para gastar solo una petición por noticia). Si no hay clave de
 * NVIDIA configurada, o la traducción falla o tarda demasiado, devuelve
 * null y el texto se queda en su idioma original — nunca rompe el feed.
 */
export async function translateNewsFields(
  title: string,
  summary: string,
  body: string
): Promise<{ title: string; summary: string; body: string } | null> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

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

    if (!res.ok) return null;
    const data = await res.json();
    const rawText: string = data?.choices?.[0]?.message?.content ?? "";
    // Algunos modelos añaden **negrita** markdown pese a que se les pide que no
    const text = rawText.replace(/\*\*/g, "").replace(/\*/g, "");

    const titleMatch = text.match(/T[IÍ]TULO:\s*([\s\S]*?)(?:\n\s*RESUMEN:|$)/i);
    const summaryMatch = text.match(/RESUMEN:\s*([\s\S]*?)(?:\n\s*CUERPO:|$)/i);
    const bodyMatch = text.match(/CUERPO:\s*([\s\S]*)/i);

    if (!titleMatch?.[1]?.trim() || !bodyMatch?.[1]?.trim()) return null;

    return {
      title: titleMatch[1].trim(),
      summary: summaryMatch?.[1]?.trim() || titleMatch[1].trim(),
      body: bodyMatch[1].trim(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
