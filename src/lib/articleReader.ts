import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

function extractOgImage(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return og?.[1] ?? null;
}

// Selectores típicos del contenedor real del cuerpo de una noticia, de
// más a menos específico. Antes se buscaban solo etiquetas <p> sueltas
// en TODO el HTML, lo que también recogía menús, "artículos
// relacionados", pies de página, etc. — y en sitios que no usan <p>
// (bastante común) no encontraba nada.
const CONTENT_SELECTORS = [
  "article",
  '[itemprop="articleBody"]',
  ".article-body",
  ".article-content",
  ".entry-content",
  ".post-content",
  ".story-body",
  "#content",
  "main",
];

// Se descartan contenedores que casi seguro son ruido, aunque coincidan
// con un selector de contenido (algunas plantillas anidan el menú de
// navegación dentro de <main>, por ejemplo).
const NOISE_SELECTOR = "nav, footer, header, aside, script, style, noscript, form, .related, .newsletter, .comments, .share, .social";

function looksLikeCode(text: string): boolean {
  const codeSignals = (text.match(/[{};]/g) || []).length;
  return codeSignals >= 3 || /^\.[a-zA-Z-]+\s*\{/.test(text) || /:\s*\d+px/.test(text);
}

function extractParagraphs($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): string[] {
  return root
    .find("p")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((text) => text.length > 40 && !looksLikeCode(text));
}

/**
 * Descarga la página del artículo original y saca dos cosas: el texto
 * de su cuerpo y la imagen "og:image" que casi cualquier web moderna
 * incluye para cuando se comparte en redes.
 *
 * Usa cheerio (parser de HTML de verdad, no regex) para localizar el
 * contenedor real del artículo probando varios selectores típicos en
 * orden, quitando antes menús/pies/comentarios/etc. Si ninguno da
 * suficiente texto, cae a "todos los <p> de la página" como red de
 * seguridad. Si algo falla o tarda demasiado, ambos valores quedan en
 * null (y quien llame a esta función decide qué mostrar mientras tanto).
 */
export async function fetchArticlePage(url: string): Promise<{ text: string | null; image: string | null }> {
  if (!url) return { text: null, image: null };
  const controller = new AbortController();
  // 5s se quedaba corto para bastantes webs de noticias — 8s da más
  // margen sin disparar el tiempo total de la función serverless
  // (la traducción va en una llamada aparte, ver /api/translate-detail).
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) return { text: null, image: null };
    const html = await res.text();
    const $ = cheerio.load(html);
    $(NOISE_SELECTOR).remove();

    let paragraphs: string[] = [];
    for (const selector of CONTENT_SELECTORS) {
      const container = $(selector).first();
      if (container.length === 0) continue;
      const found = extractParagraphs($, container);
      if (found.join(" ").length > paragraphs.join(" ").length) {
        paragraphs = found;
      }
      if (paragraphs.join(" ").length > 300) break; // ya hay bastante, no hace falta seguir probando selectores
    }

    // Red de seguridad: ningún selector conocido dio contenido útil —
    // se prueba con todos los <p> del documento entero.
    if (paragraphs.join(" ").length < 300) {
      const fallback = extractParagraphs($, $.root());
      if (fallback.join(" ").length > paragraphs.join(" ").length) paragraphs = fallback;
    }

    const combined = paragraphs.length > 0 ? paragraphs.join("\n\n") : null;
    // Límite generoso para dejar sitio a un artículo real completo, pero
    // acotado para no disparar ni el tamaño de la petición a NVIDIA ni el
    // tiempo de traducción.
    const text = combined && combined.length > 4000 ? `${combined.slice(0, 4000)}…` : combined;

    return { text, image: extractOgImage(html) };
  } catch {
    return { text: null, image: null };
  } finally {
    clearTimeout(timeout);
  }
}
