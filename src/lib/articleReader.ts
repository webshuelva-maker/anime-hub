function stripTags(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Descarga la página del artículo original y extrae el texto de sus
 * párrafos (<p>), como hacen los lectores tipo "modo lectura". No es
 * perfecto (cada web tiene su propia estructura), pero da mucho más
 * contenido que el resumen corto del RSS. Si algo falla o tarda demasiado,
 * devuelve null y el resumen corto se queda como estaba.
 */
export async function fetchFullArticle(url: string): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();

    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripTags(m[1]))
      .filter((text) => text.length > 40); // fuera migas de pan, avisos legales cortos, etc.

    if (paragraphs.length === 0) return null;

    const combined = paragraphs.join("\n\n");
    return combined.length > 4000 ? `${combined.slice(0, 4000)}…` : combined;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
