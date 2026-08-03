import { classifySource, ResearchSource } from "./sourceTiers";

/**
 * Búsqueda de noticias REAL, hecha por nosotros.
 *
 * Antes esto dependía por completo de que el sistema agéntico de Groq
 * decidiera buscar por su cuenta. Cuando decidía que no, volvía sin una
 * sola fuente y toda la investigación se quedaba en nada — que es
 * exactamente el fallo que se estaba viendo ("no he podido comprobarlo").
 *
 * Ahora la búsqueda la hacemos aquí, contra buscadores de noticias que
 * exponen RSS público y gratuito, sin clave ni registro:
 *   - Google News (español e inglés)
 *   - Bing News (como red de seguridad si Google no responde)
 *
 * Ventajas frente a delegarlo: siempre se busca, tarda ~1 segundo en vez
 * de veinte, cada resultado trae FECHA REAL de publicación (no una fecha
 * que el modelo cree recordar), y el medio viene identificado, así que la
 * clasificación en oficial / prensa / sin verificar se hace sobre datos y
 * no sobre lo que diga nadie.
 */

export interface NewsHit {
  title: string;
  url: string;
  domain: string;
  source: ResearchSource;
  /** ISO, o null si el buscador no la da. */
  publishedAt: string | null;
  snippet: string;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(raw: string): string {
  return decodeEntities(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? match[1] : null;
}

export function parseRssItems(xml: string): NewsHit[] {
  const hits: NewsHit[] = [];
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const item of items) {
    const rawTitle = tag(item, "title");
    const rawLink = tag(item, "link");
    if (!rawTitle || !rawLink) continue;

    const link = stripTags(rawLink);
    if (!/^https?:\/\//.test(link)) continue;

    // Google News mete el medio al final del titular ("Titular - ANN") y
    // además lo da aparte con su dominio real, que es lo que nos sirve
    // para clasificar: el enlace es un redirector de google.
    const sourceUrlMatch = item.match(/<source[^>]+url="([^"]+)"/i);
    const sourceName = stripTags(tag(item, "source") ?? "");
    const domainSeed = sourceUrlMatch?.[1] ?? link;

    const title = stripTags(rawTitle).replace(new RegExp(`\\s*-\\s*${sourceName}$`), "").trim();
    const pubDate = stripTags(tag(item, "pubDate") ?? "");
    const parsedDate = pubDate ? new Date(pubDate) : null;

    const source = classifySource(domainSeed, sourceName || title);

    hits.push({
      title,
      url: link,
      domain: source.domain,
      // El título que se enseña debe ser el del artículo (el medio ya va
      // aparte), y el enlace debe llevar AL ARTÍCULO, no a la portada del
      // medio: "url" en la etiqueta <source> es la home, solo sirve para
      // saber el dominio y clasificar la fiabilidad.
      source: { ...source, title, url: link },
      publishedAt: parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
      snippet: stripTags(tag(item, "description") ?? "").slice(0, 300),
    });
  }

  return hits;
}

async function fetchRss(url: string, timeoutMs: number): Promise<NewsHit[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Sin un user-agent de navegador, varios buscadores devuelven vacío.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return [];
    return parseRssItems(await res.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function googleNewsUrl(query: string, lang: "es" | "en"): string {
  const q = encodeURIComponent(query);
  return lang === "es"
    ? `https://news.google.com/rss/search?q=${q}&hl=es-419&gl=ES&ceid=ES:es`
    : `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

function bingNewsUrl(query: string): string {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`;
}

/**
 * Búsqueda WEB (no de noticias). Es la que llega a donde no llegan los
 * medios: publicaciones de X/Twitter, hilos de foro, blogs de fans,
 * páginas de YouTube y TikTok. Las cuentas oficiales de las plataformas
 * y de los estudios anuncian muchas veces ahí antes que en ningún medio,
 * y los rumores viven ahí casi en exclusiva.
 */
function bingWebUrl(query: string): string {
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`;
}

/**
 * Pasada de búsqueda abierta a toda la web. Se usa para lo que las webs
 * de noticias no publican hasta que está confirmado: filtraciones,
 * anuncios sueltos en cuentas oficiales, comentarios de staff.
 */
export async function searchWeb(
  queries: string[],
  limit = 8
): Promise<{ hits: NewsHit[]; debug: string }> {
  const jobs = queries
    .slice(0, 3)
    .filter((q) => q.trim())
    .map((q) => ({ label: "bing-web", url: bingWebUrl(q) }));

  const batches = await Promise.all(jobs.map((j) => fetchRss(j.url, 4500)));
  const debug = jobs.map((j, i) => `${j.label}:${batches[i].length}`).join(" ");

  const seen = new Set<string>();
  const merged: NewsHit[] = [];
  for (const batch of batches) {
    for (const hit of batch) {
      const key = hit.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(hit);
    }
  }

  return { hits: merged.slice(0, limit), debug };
}

/** Peso de fiabilidad para ordenar: lo oficial primero, el ruido al final. */
const TIER_WEIGHT = { oficial: 3, prensa: 2, "sin-verificar": 1 } as const;

/**
 * Lanza todas las búsquedas EN PARALELO y devuelve los resultados
 * ordenados por fiabilidad de la fuente y, dentro de eso, por fecha.
 */
export async function searchNews(
  queries: string[],
  limit = 10
): Promise<{ hits: NewsHit[]; debug: string }> {
  const jobs: { label: string; url: string }[] = [];
  // Tres consultas en vez de dos: al no haber traducción compitiendo por
  // la cuota, se puede buscar más y contrastar mejor.
  for (const q of queries.slice(0, 3)) {
    if (!q.trim()) continue;
    jobs.push({ label: "google-en", url: googleNewsUrl(q, "en") });
    jobs.push({ label: "google-es", url: googleNewsUrl(q, "es") });
    jobs.push({ label: "bing", url: bingNewsUrl(q) });
  }

  const batches = await Promise.all(jobs.map((j) => fetchRss(j.url, 4500)));

  // Diagnóstico por buscador: si algún día vuelve a salir "0 fuentes",
  // esto dice cuál falló en vez de dejarlo a la adivinación.
  const debug = jobs.map((j, i) => `${j.label}:${batches[i].length}`).join(" ");

  const seen = new Set<string>();
  const merged: NewsHit[] = [];
  for (const batch of batches) {
    for (const hit of batch) {
      // Dedupe por titular normalizado: el mismo artículo aparece en
      // Google y en Bing con URLs distintas.
      const key = hit.title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 60);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(hit);
    }
  }

  merged.sort((a, b) => {
    const tierDiff = TIER_WEIGHT[b.source.tier] - TIER_WEIGHT[a.source.tier];
    if (tierDiff !== 0) return tierDiff;
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bTime - aTime;
  });

  return { hits: merged.slice(0, limit), debug };
}

/** Fecha del resultado más reciente, para medir si el tema está parado. */
export function newestDate(hits: NewsHit[]): string | null {
  const dates = hits.map((h) => h.publishedAt).filter((d): d is string => Boolean(d)).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/** Convierte los resultados en texto para el prompt, con fecha y medio. */
export function hitsToPromptText(hits: NewsHit[]): string {
  if (hits.length === 0) return "";
  const TIER_ES = {
    oficial: "FUENTE OFICIAL",
    prensa: "PRENSA ESPECIALIZADA",
    "sin-verificar": "SIN VERIFICAR (agregador, foro o red social)",
  } as const;

  return hits
    .map((h, i) => {
      const date = h.publishedAt ? h.publishedAt.slice(0, 10) : "sin fecha";
      const body = h.snippet ? `\n  ${h.snippet}` : "";
      return `[${i + 1}] ${h.title}\n  ${TIER_ES[h.source.tier]} — ${h.domain} — publicado ${date}${body}`;
    })
    .join("\n\n");
}
