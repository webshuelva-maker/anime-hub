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
  // MyAnimeList: su cuerpo de noticia vive aquí. Sin este selector se
  // caía al plan B (todos los <p> de la página) y recogía el listado del
  // foro que hay debajo del artículo.
  ".news-container",
  ".content-left",
  '[itemprop="articleBody"]',
  ".article-body",
  ".article-content",
  ".entry-content",
  ".post-content",
  // Plantillas habituales en los medios españoles del feed (WordPress
  // con temas tipo Newspaper/Jannah, y los CMS propios de Weblogs SL y
  // Prisa). Sin estos, la extracción caía al plan B y devolvía cuatro
  // frases sueltas.
  ".td-post-content",
  ".tdb-block-inner",
  ".single-post-content",
  ".article__body",
  ".article-main",
  ".cuerpo-articulo",
  ".contenido-articulo",
  ".texto-articulo",
  ".m-detail--body",
  ".post-body",
  ".entry",
  ".story-body",
  "#content",
  "main",
];

// Se descartan contenedores que casi seguro son ruido, aunque coincidan
// con un selector de contenido (algunas plantillas anidan el menú de
// navegación dentro de <main>, por ejemplo).
const NOISE_SELECTOR =
  "nav, footer, header, aside, script, style, noscript, form, .related, .newsletter, .comments, .comment, .share, .social, .forum, .forum-topic, .topic-list, .sidebar, .widget, .pagination, .breadcrumb, " +
  // Bloques de comentarios y foro por nombre parcial: cada web los llama
  // de una forma (#comment_list, .comment-container, .forum_boardrow1...)
  // y acertar con el nombre exacto de cada una es imposible. Es lo que
  // se colaba en las noticias de MyAnimeList y acababa enseñándose como
  // si fuera el artículo.
  '[id*="comment" i], [class*="comment" i], [id*="forum" i], [class*="forum" i], [class*="disqus" i], [id*="disqus" i]';

/**
 * ¿Esta línea es una fila de un LISTADO en vez de una frase del artículo?
 *
 * Salió de un fallo real: en las noticias de MyAnimeList, el cuerpo que
 * se extraía era la lista del foro — "Jul 12, 5:03 PM by SyverenWaterlow
 * 0 Comments" repetido diez veces. Pasaba todos los filtros porque cada
 * fila supera los 40 caracteres y no parece código.
 *
 * Se reconocen por lo que tienen en común: fecha u hora, un "por
 * fulanito", y un recuento de comentarios, respuestas o visitas — y
 * ningún punto final, porque no son frases.
 */
function looksLikeListRow(text: string): boolean {
  const conRecuento = /\b\d+\s+(comment|comments|repl(y|ies)|view|views|comentarios?|respuestas?)\b/i.test(text);
  const conAutor = /\b(by|por)\s+[A-Za-z0-9_\-]{3,}/i.test(text);
  const conFecha = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s+(de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|jan|apr|aug|dec)/i.test(text);
  const sinFraseCompleta = !/[.!?]\s|[.!?]$/.test(text);

  const señales = [conRecuento, conAutor, conFecha].filter(Boolean).length;

  /*
   * Con las TRES señales a la vez da igual la puntuación.
   *
   * Antes se exigía además que la línea no terminara en punto, y por ahí
   * se colaban las filas de comentarios de MyAnimeList: llevan fecha,
   * autor y recuento, pero también puntuación, así que pasaban el filtro
   * y se enseñaban como si fueran el cuerpo de la noticia ("El 25 de
   * julio a las 8:50, DatRandomDude11 comentó."). Una frase de verdad no
   * junta fecha, "por fulanito" y un recuento de comentarios.
   */
  if (señales === 3) return true;

  // Con dos señales sí se pide que no parezca una frase, para no tirar
  // una línea legítima que mencione una fecha y a un autor.
  return señales >= 2 && sinFraseCompleta;
}

function looksLikeCode(text: string): boolean {
  const codeSignals = (text.match(/[{};]/g) || []).length;
  return codeSignals >= 3 || /^\.[a-zA-Z-]+\s*\{/.test(text) || /:\s*\d+px/.test(text);
}

function extractParagraphs($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): string[] {
  return root
    .find("p")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((text) => text.length > 40 && !looksLikeCode(text) && !looksLikeListRow(text));
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
export async function fetchArticlePage(
  url: string,
  /**
   * Cuántos caracteres del artículo se devuelven.
   *
   * El límite existía porque TODO el artículo pasaba por la IA para
   * traducirlo, y con textos largos la traducción agotaba el tiempo de
   * la función. Ahora que las fuentes son españolas no hay nada que
   * traducir, así que ese límite ya no protege de nada: solo cortaba la
   * noticia a media frase con unos puntos suspensivos y obligaba a
   * salir a la web original. Quien llama decide: mucho margen para el
   * español, moderado para lo que aún haya que traducir.
   */
  maxCaracteres = 1500
): Promise<{ text: string | null; image: string | null }> {
  if (!url) return { text: null, image: null };
  const controller = new AbortController();
  // 5s se quedaba corto para bastantes webs de noticias — 8s da más
  // margen sin disparar el tiempo total de la función serverless
  // (la traducción va en una llamada aparte, ver /api/translate-detail).
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      /*
       * Cabeceras de navegador real, las mismas que se usan para leer
       * los RSS.
       *
       * Es exactamente el mismo problema que tenían los feeds: los
       * medios españoles están detrás de Cloudflare y responden 403 a
       * cualquier petición que se declare robot. Por eso, con las
       * fuentes ya en español, al abrir una noticia salía "No se pudo
       * cargar el artículo": el RSS entraba pero la página del artículo
       * se rechazaba.
       */
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
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

    /*
     * Última comprobación antes de dar el texto por bueno.
     *
     * Si lo que queda son cuatro líneas sueltas y ninguna termina en
     * punto, no es un artículo: es un listado, un pie de página o los
     * restos de una plantilla que no hemos sabido leer. En ese caso vale
     * más devolver nada —y que la app enseñe el resumen del feed, que
     * siempre es correcto— que enseñar una lista de comentarios como si
     * fuera la noticia.
     */
    const conFrases = paragraphs.filter((p) => /[.!?]/.test(p)).length;
    const pareceArticulo = paragraphs.join(" ").length >= 200 && conFrases >= 2;

    const combined = paragraphs.length > 0 && pareceArticulo ? paragraphs.join("\n\n") : null;
    // Antes eran 4000 caracteres — para artículos largos (piezas de
    // análisis, no solo noticias breves) traducir eso necesitaba tanta
    // generación que solía agotar el tiempo de la función serverless
    // (ver /api/translate-detail) y se acababa mostrando en inglés. Con
    // ~1500 caracteres (un resumen extendido, no el artículo entero) la
    // traducción es mucho más fiable — para leer el artículo íntegro
    // siempre queda el enlace a la fuente original.
    const text =
      combined && combined.length > maxCaracteres
        ? `${combined.slice(0, maxCaracteres)}…`
        : combined;

    return { text, image: extractOgImage(html) };
  } catch {
    return { text: null, image: null };
  } finally {
    clearTimeout(timeout);
  }
}
