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

function stripNonContentBlocks(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
}

/** Descarta "párrafos" que en realidad son CSS colado (llaves, dos puntos con ;, etc.) */
function looksLikeCode(text: string): boolean {
  const codeSignals = (text.match(/[{};]/g) || []).length;
  return codeSignals >= 3 || /^\.[a-zA-Z-]+\s*\{/.test(text) || /:\s*\d+px/.test(text);
}

function extractOgImage(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return og?.[1] ?? null;
}

/**
 * Descarga la página del artículo original y saca dos cosas: el texto de
 * sus párrafos (<p>), y la imagen "og:image" que casi cualquier web
 * moderna incluye para cuando se comparte en redes — es la misma imagen
 * que usa la propia web de origen, sea de un manga, un anime o lo que sea.
 * Si algo falla o tarda demasiado, ambos valores quedan en null.
 */
export async function fetchArticlePage(url: string): Promise<{ text: string | null; image: string | null }> {
  if (!url) return { text: null, image: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) return { text: null, image: null };
    const html = await res.text();
    const cleanHtml = stripNonContentBlocks(html);

    const paragraphs = [...cleanHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripTags(m[1]))
      .filter((text) => text.length > 40 && !looksLikeCode(text));

    const combined = paragraphs.length > 0 ? paragraphs.join("\n\n") : null;
    const text = combined && combined.length > 2400 ? `${combined.slice(0, 2400)}…` : combined;

    return { text, image: extractOgImage(html) };
  } catch {
    return { text: null, image: null };
  } finally {
    clearTimeout(timeout);
  }
}
