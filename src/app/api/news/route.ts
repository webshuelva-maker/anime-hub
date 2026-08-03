import { NextResponse } from "next/server";
import { datosDeTitulos, ultimoIntentoAniList } from "@/lib/popularity";
import { NewsCategory, NewsItem, Reliability } from "@/types/news";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

// No dependemos de una sola fuente: si una falla o está caída, la otra
// puede seguir dando noticias. "language" marca las fuentes que YA
// vienen en español (no hace falta traducirlas, y no hay que dejar que
// la IA las "retraduzca" sin necesidad).
/*
 * FUENTES.
 *
 * El cambio de fondo aquí es de COSTE. Casi todo el gasto de la API de
 * IA se iba en traducir titulares y artículos del inglés. Una fuente que
 * ya publica en español no se traduce: cuesta cero. Por eso el grueso de
 * la lista es prensa española, y las de fuera se reservan para lo que no
 * cubren (rumores y filtraciones que tardan en llegar aquí).
 *
 * Cada fuente lleva:
 * - "language": "es" salta la traducción por completo.
 * - "tier": "oficial" son medios que publican cuando hay anuncio;
 *   "rumor" son agregadores y filtradores. Se refleja en la etiqueta de
 *   fiabilidad de la tarjeta, sin depender de que el titular diga
 *   "rumor".
 * - "soloAnime": para medios generalistas de videojuegos, donde el anime
 *   es una sección pequeña. Sin este filtro, el feed se llenaría de
 *   análisis de consolas.
 *
 * Si una fuente no responde o cambia de dirección, no pasa nada: se
 * ignora y las demás siguen. El campo "diagnostico" de la respuesta dice
 * cuáles han contestado.
 */
/*
 * FUENTES.
 *
 * Cada una lleva VARIAS direcciones candidatas y se usa la primera que
 * responda con noticias. No es capricho: la comprobación real dio 11 de
 * 22 caídas, y casi todas por lo mismo — una ruta de RSS que el medio ha
 * cambiado, o Cloudflare rechazando la petición. Con alternativas, que
 * un medio mueva su feed deja de romper la fuente.
 *
 * Campos:
 * - "language": "es" salta la traducción por completo (es donde está el
 *   ahorro de verdad).
 * - "tier": "rumor" marca la fiabilidad por ORIGEN, no por el titular.
 * - "soloAnime": para medios generalistas, filtra a anime y manga.
 * - "maximo": tope de noticias por fuente. Anime News Network publica
 *   145 de golpe; sin tope, se comía el feed entero y todo llegaba en
 *   inglés por mucho medio español que hubiera.
 */
export interface Fuente {
  urls: string[];
  platform: string;
  label: string;
  language: "en" | "es";
  tier?: "oficial" | "rumor";
  soloAnime?: boolean;
}

/*
 * ¿Se incluyen las fuentes en inglés?
 *
 * Puesto a false a petición del usuario: con ellas dentro, Anime News
 * Network sola aportaba 145 noticias y arrasaba con las españolas, así
 * que el feed seguía saliendo casi entero en inglés — y traducirlo era
 * justo lo que se quería dejar de pagar.
 *
 * Se dejan escritas y no borradas: volver a activarlas es cambiar este
 * valor a true. Ten en cuenta lo que implica: TODAS las fuentes de
 * rumores y filtraciones están en inglés, así que con esto en false el
 * feed solo trae noticias confirmadas.
 */
const INCLUIR_INGLES = false;

const FUENTES_ES: Fuente[] = [
  // ---------- Medios españoles de anime ----------
  {
    urls: [
      "https://cr-news-api-service.prd.crunchyrollsvc.com/v1/es-ES/rss",
      "https://cr-news-api-service.prd.crunchyrollsvc.com/v1/es-419/rss",
    ],
    platform: "Crunchyroll News",
    label: "Ver en Crunchyroll",
    language: "es",
    tier: "oficial",
  },
  { urls: ["https://somoskudasai.com/noticias/feed/", "https://somoskudasai.com/feed/"], platform: "Somos Kudasai", label: "Ver en Somos Kudasai", language: "es", tier: "oficial" },
  { urls: ["https://ramenparados.com/feed/", "https://ramenparados.com/feed/rss/"], platform: "Ramen Para Dos", label: "Ver en Ramen Para Dos", language: "es", tier: "oficial" },
  { urls: ["https://anmosugoi.com/feed/", "https://anmosugoi.com/?feed=rss2"], platform: "AnmoSugoi", label: "Ver en AnmoSugoi", language: "es", tier: "oficial" },
  { urls: ["https://koi-nya.net/feed/", "https://koi-nya.net/?feed=rss2"], platform: "Koi-Nya", label: "Ver en Koi-Nya", language: "es", tier: "oficial" },
  {
    urls: [
      "https://www.misiontokyo.com/feed/rss/",
      "https://www.misiontokyo.com/?feed=rss2",
      "https://misiontokyo.com/feed/",
    ],
    platform: "Misión Tokyo",
    label: "Ver en Misión Tokyo",
    language: "es",
    tier: "oficial",
  },

  // ---------- Más medios en español (anime y manga) ----------
  { urls: ["https://otakufreaks.com/feed/"], platform: "Otaku Freaks", label: "Ver en Otaku Freaks", language: "es", tier: "oficial" },
  { urls: ["https://www.deculture.es/feed/", "https://deculture.es/feed/"], platform: "Deculture", label: "Ver en Deculture", language: "es", tier: "oficial" },
  { urls: ["https://www.anmtv.xyz/feeds/posts/default?alt=rss"], platform: "ANMTV", label: "Ver en ANMTV", language: "es", tier: "oficial" },
  { urls: ["https://www.tarreo.com/rss/anime", "https://www.tarreo.com/rss"], platform: "Tarreo", label: "Ver en Tarreo", language: "es", tier: "oficial", soloAnime: true },
  { urls: ["https://codigoespagueti.com/feed/"], platform: "Código Espagueti", label: "Ver en Código Espagueti", language: "es", tier: "oficial", soloAnime: true },
  { urls: ["https://atomix.vg/feed/"], platform: "Atomix", label: "Ver en Atomix", language: "es", tier: "oficial", soloAnime: true },

  // ---------- Generalistas españoles, filtrados a anime ----------
  { urls: ["https://www.hobbyconsolas.com/rss"], platform: "Hobby Consolas", label: "Ver en Hobby Consolas", language: "es", tier: "oficial", soloAnime: true },
  { urls: ["https://as.com/rss/meristation/portada.xml"], platform: "Meristation", label: "Ver en Meristation", language: "es", tier: "oficial", soloAnime: true },
  { urls: ["https://es.ign.com/feed.xml"], platform: "IGN España", label: "Ver en IGN España", language: "es", tier: "oficial", soloAnime: true },
  { urls: ["https://vandal.elespanol.com/xml.cgi/noticias.xml"], platform: "Vandal", label: "Ver en Vandal", language: "es", tier: "oficial", soloAnime: true },
  { urls: ["https://www.vidaextra.com/feedburner.xml"], platform: "Vida Extra", label: "Ver en Vida Extra", language: "es", tier: "oficial", soloAnime: true },
  {
    urls: [
      "https://www.3djuegos.com/feeds/noticias/",
      "https://www.3djuegos.com/rss/",
      "https://www.3djuegos.com/noticias/rss/",
      "https://www.3djuegos.com/feed/",
    ],
    platform: "3DJuegos",
    label: "Ver en 3DJuegos",
    language: "es",
    tier: "oficial",
    soloAnime: true,
  },
];

/** Desactivadas. Ver INCLUIR_INGLES arriba. */
const FUENTES_EN: Fuente[] = [
  { urls: ["https://www.animenewsnetwork.com/all/rss.xml"], platform: "Anime News Network", label: "Ver en Anime News Network", language: "en", tier: "oficial" },
  { urls: ["https://myanimelist.net/rss/news.xml"], platform: "MyAnimeList", label: "Ver en MyAnimeList", language: "en", tier: "oficial" },
  { urls: ["https://animecorner.me/feed/"], platform: "Anime Corner", label: "Ver en Anime Corner", language: "en", tier: "rumor" },
  { urls: ["https://animesenpai.net/feed/"], platform: "Anime Senpai", label: "Ver en Anime Senpai", language: "en", tier: "rumor" },
  { urls: ["https://comicbook.com/category/anime/feed/"], platform: "ComicBook Anime", label: "Ver en ComicBook", language: "en", tier: "rumor" },
  { urls: ["https://screenrant.com/feed/anime/"], platform: "Screen Rant", label: "Ver en Screen Rant", language: "en", tier: "rumor", soloAnime: true },
  { urls: ["https://www.cbr.com/feed/category/anime-news/"], platform: "CBR", label: "Ver en CBR", language: "en", tier: "rumor" },
  { urls: ["https://gamerant.com/feed/anime/"], platform: "Game Rant", label: "Ver en Game Rant", language: "en", tier: "rumor", soloAnime: true },
  { urls: ["https://www.dexerto.com/anime/feed/"], platform: "Dexerto", label: "Ver en Dexerto", language: "en", tier: "rumor" },
];

export const FEEDS: Fuente[] = INCLUIR_INGLES ? [...FUENTES_ES, ...FUENTES_EN] : FUENTES_ES;

/*
 * Cabeceras de navegador normal.
 *
 * Varios medios devuelven 403 a cualquier petición que se identifique
 * como robot — Ramen Para Dos era exactamente ese caso. No se está
 * ocultando nada ni saltándose ninguna restricción: se lee un RSS
 * público, que existe justamente para ser leído por programas, pero hay
 * cortafuegos que filtran por la cadena de identificación sin más.
 */
const CABECERAS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
};

/*
 * Palabras que marcan que una noticia de un medio generalista va de
 * anime o manga. Se mira en el titular y en el resumen.
 */
const PALABRAS_ANIME =
  /\b(anime|animes|manga|mangas|manhwa|manhua|otaku|shonen|shōnen|shojo|sh[óo]jo|seinen|josei|isekai|mecha|waifu|cosplay|crunchyroll|netflix anime|studio ghibli|ghibli|jujutsu|dragon ball|one piece|naruto|boruto|bleach|demon slayer|kimetsu|chainsaw man|evangelion|shingeki|attack on titan|my hero academia|boku no hero|spy x family|solo leveling|frieren|oshi no ko|blue lock|tokyo revengers|hunter x hunter|fullmetal|death note|sailor moon|doraemon|shin chan|pok[ée]mon|digimon|gundam|sakura|jump|shueisha|kodansha|shogakukan|toei|mappa|ufotable|madhouse|bones|wit studio|cloverworks|kyoto animation|trigger|pierrot|sunrise|aniplex|vertical garden|panini manga|norma editorial|ivr[ée]a|planeta c[óo]mic|selecta visi[óo]n)\b/i;

function decodeEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Cualquier entidad numérica, decimal (&#39; &#039;) o hexadecimal
    // (&#x27;). Antes solo se contemplaba "&#39;" literal, y
    // MyAnimeList manda "&#039;" con cero delante: no coincidía y el
    // título se quedaba con la entidad dentro, que además luego se
    // mandaba tal cual a AniList y no encontraba nada.
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&"); // siempre el último, para no volver a decodificar entidades ya resueltas
}

function stripHtml(raw: string): string {
  const withoutCdata = raw.replace("<![CDATA[", "").replace("]]>", "");
  // Primero se "traducen" los símbolos (&lt;cite&gt; -> <cite>) y solo
  // DESPUÉS se quitan las etiquetas reales — al revés se quedan a medias.
  const decoded = decodeEntities(withoutCdata);
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmbeddedImage(block: string, rawDescription: string): string | null {
  const enclosure = block.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image[^"]*"/i)
    ?? block.match(/<enclosure[^>]+url="([^"]+)"/i);
  if (enclosure?.[1]) return enclosure[1];

  const mediaThumbnail = block.match(/<media:thumbnail[^>]+url="([^"]+)"/i)
    ?? block.match(/<media:content[^>]+url="([^"]+)"[^>]*medium="image"/i);
  if (mediaThumbnail?.[1]) return mediaThumbnail[1];

  const inlineImg = rawDescription.match(/<img[^>]+src="([^"]+)"/i);
  return inlineImg?.[1] ?? null;
}

function inferCategory(title: string): NewsCategory {
  const t = title.toLowerCase();
  if (/(película|movie|film)/.test(t)) return "pelicula";
  if (/(temporada|season \d|season two|season three|sequel)/.test(t)) return "temporada-nueva";
  if (/(dub|doblaje|english cast)/.test(t)) return "doblaje";
  if (/(manga|light novel|adapt)/.test(t)) return "adaptacion";
  if (/(event|festival|expo|panel|anniversary)/.test(t)) return "evento";
  return "estreno";
}

function guessReliability(title: string): Reliability {
  const t = title.toLowerCase();
  if (/(rumor|leak|reportedly|allegedly)/.test(t)) return "rumor";
  return "confirmed";
}

function hashId(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/*
 * Saca el NOMBRE DE LA SERIE de un titular de noticia.
 *
 * Antes esto se quedaba con el titular entero recortado a 64 caracteres,
 * y ese texto es el que se usa para buscar la serie en AniList y saber su
 * popularidad. Buscar "Chained Soldier TV Anime Gets 3rd Season" no
 * encuentra nada útil, así que la mayoría de noticias se quedaban sin
 * popularidad y sin géneros — y por eso la prioridad a lo conocido no se
 * notaba.
 *
 * Los titulares de este tipo de medios tienen todos la misma forma:
 * el nombre de la obra y luego qué le pasa ("... TV Anime Gets 3rd
 * Season", "... Reveals More Cast", "... revela nuevo tráiler"). Basta
 * con cortar en la primera de esas marcas.
 */
const MARCAS_TITULAR = [
  // Inglés
  "TV Anime", "Anime Film", "Anime Series", "Anime's", "Anime ", "Manga's", "Manga ",
  "Franchise", "Season", "Episode", "Gets", "Reveals", "Announces", "Unveils", "Debuts",
  "Premieres", "Launches", "Confirms", "Ends", "Returns", "Casts", "Adds", "Shares",
  "Drops", "Teases", "Delayed", "Postponed", "Listed", "Slated", "Headed", "Review",
  "Interview", "Trailer", "Visual", "Novel", "Game ", "Film ", "Movie ", "Live-Action",
  // Español
  "Serie de anime", "revela", "anuncia", "estrena", "confirma", "obtiene", "tendrá",
  "lanza", "presenta", "Reseña", "Entrevista", "tráiler", "temporada", "película",
];

/*
 * Palabras que por sí solas no son el nombre de ninguna obra. Si el
 * recorte deja solo esto, es que el titular no tenía la forma esperada y
 * el resultado no vale para buscar en AniList.
 *
 * Salieron del diagnóstico real: los titulares daban "North American",
 * "Web", "Light", "Third", "Your", "Visual", "Japan's Video"... y todos
 * ellos se mandaban a AniList, que como es lógico no encontraba nada.
 */
const RELLENO = new Set([
  "north american", "web", "light", "third", "your", "visual", "manga", "anime",
  "new", "the", "japan's video", "japanese animation tv ranking", "additional cast",
  "supporting cast pair", "toei animation produces new", "webtoon-based", "crunchyroll",
  "discotek to release", "sublime licenses robin at the break of dawn, cake dog caramel",
]);

function extractSeriesName(title: string): string {
  const limpio = title
    .replace(/\s+/g, " ")
    // Los titulares en español empiezan por "El anime X...", "El manga
    // X...". Ese "El anime" sobra para buscar la obra en la base de datos.
    .replace(/^(el|la|los|las)\s+(anime|manga|serie|pel[íi]cula|film|novela)\s+/i, "")
    .trim();

  /*
   * Muchos medios (MyAnimeList sobre todo) ponen el nombre de la obra
   * entre comillas: «'Mato Seihei no Slave' Gets Third Season», «Third
   * Season of New 'Ranma ½' Anime...». Cuando las hay, eso ES el título.
   *
   * Se descarta si el trozo acaba en coma o punto y coma: eso delata que
   * no es un título sino una cita suelta de dentro de la frase, como en
   * «Witch on the Holy Night Film Reveals 'Double Visual,' Game's...»,
   * que daba "Double Visual," en vez de la película.
   */
  const entrecomillado = limpio.match(/["'“«]([^"'“”«»]{3,64})["'”»]/);
  if (entrecomillado?.[1]) {
    const dentro = entrecomillado[1].trim();
    if (!/[,;:]$/.test(dentro) && !RELLENO.has(dentro.toLowerCase())) return dentro;
  }

  let corte = limpio.length;
  for (const marca of MARCAS_TITULAR) {
    const i = limpio.indexOf(marca);
    // Se exige que quede algo delante (al menos 3 caracteres): si el
    // titular EMPIEZA por la marca, cortar ahí dejaría el nombre vacío.
    if (i > 3 && i < corte) corte = i;
  }

  const nombre = limpio
    .slice(0, corte)
    .replace(/[\s,:;–—-]+$/, "")
    .replace(/^['"«]|['"»]$/g, "")
    .trim();

  // Si el recorte deja algo demasiado corto, o solo palabras de relleno,
  // no era un titular con esta forma: mejor el titular entero, que al
  // menos tiene alguna posibilidad de coincidir, que un fragmento suelto
  // que seguro que no.
  if (nombre.length < 3 || RELLENO.has(nombre.toLowerCase())) {
    return limpio.length > 64 ? `${limpio.slice(0, 61)}…` : limpio;
  }
  return nombre.length > 64 ? `${nombre.slice(0, 61)}…` : nombre;
}

/** Si el resumen empieza repitiendo el titular tal cual, quita esa repetición. */
function dedupeAgainstTitle(text: string, title: string): string {
  if (text.toLowerCase().startsWith(title.toLowerCase())) {
    return text.slice(title.length).replace(/^[\s.:—-]+/, "").trim();
  }
  return text;
}

/**
 * Descarga el RSS probando las direcciones de la fuente EN ORDEN hasta
 * que una funcione.
 *
 * Los medios cambian de ruta cada dos por tres (/feed, /rss,
 * /rss/portada.xml, ?feed=rss2) y sin este intento por candidatos una
 * fuente se quedaba muerta y en silencio: no daba error visible, solo
 * dejaba de aportar noticias. Devuelve también qué dirección funcionó,
 * para poder verlo en /api/fuentes.
 */
export async function descargarRss(
  urls: string[]
): Promise<{ xml: string | null; urlUsada: string | null; estado: string }> {
  let ultimoEstado = "sin direcciones";

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: CABECERAS_NAVEGADOR,
        next: { revalidate: 900 },
        // Seis segundos. Con doce, una fuente colgada (Koi-Nya tardaba
        // veinticuatro) retrasaba TODO el feed, porque el conjunto tarda
        // lo que la más lenta. Más vale perder una fuente lenta que
        // hacer esperar al usuario.
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) {
        ultimoEstado = `HTTP ${res.status}`;
        continue;
      }
      const xml = await res.text();
      // Se comprueba que sea un feed de verdad: varias webs devuelven su
      // portada en HTML con código 200 cuando la ruta no existe.
      if (!/<(item|entry)[\s>]/i.test(xml)) {
        ultimoEstado = "responde pero no es un feed";
        continue;
      }
      return { xml, urlUsada: url, estado: "ok" };
    } catch (e) {
      ultimoEstado = e instanceof Error ? e.message : String(e);
    }
  }

  return { xml: null, urlUsada: null, estado: ultimoEstado };
}

async function fetchFeed(feed: Fuente): Promise<NewsItem[]> {
  const { xml } = await descargarRss(feed.urls);
  if (!xml) return [];
  const blocks = xml.split("<item>").slice(1).map((b) => b.split("</item>")[0]);

  return blocks
    .slice(0, 20)
    .map((block) => {
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Sin título";
    const title = stripHtml(rawTitle);
    const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
    const pubDateRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]
      ?? block.match(/<dc:date>([\s\S]*?)<\/dc:date>/)?.[1])?.trim();
    const rawDescription = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";
    const description = dedupeAgainstTitle(stripHtml(rawDescription), title);
    const embeddedImage = extractEmbeddedImage(block, rawDescription);
    const publishedAt = pubDateRaw && !Number.isNaN(Date.parse(pubDateRaw))
      ? new Date(pubDateRaw).toISOString()
      : new Date().toISOString();

    const item: NewsItem = {
      id: `${feed.platform.slice(0, 3).toLowerCase()}-${hashId(link || title)}`,
      title,
      summary: description ? description.slice(0, 200) : title,
      body: description || title,
      imageQuery: title,
      // Las fuentes marcadas como "rumor" lo son por origen, no por lo
      // que diga el titular: un agregador puede publicar una filtración
      // sin usar la palabra "rumor" en ningún sitio.
      reliability: feed.tier === "rumor" ? ("rumor" as Reliability) : guessReliability(title),
      category: inferCategory(title),
      genres: [],
      studios: [],
      publishedAt,
      source: { platform: feed.platform, url: link || feed.urls[0], label: feed.label },
      relatedTitle: extractSeriesName(title),
      prominence: "mainstream",
      language: feed.language,
    };
    if (embeddedImage) item.coverImageUrl = embeddedImage;
    return item;
  })
    /*
     * Filtro para medios generalistas. Vandal, IGN o 3DJuegos publican
     * sobre todo videojuegos; sin esto, el feed se llenaría de análisis
     * de consolas y el anime quedaría enterrado. Se mira el titular y el
     * resumen, y en la duda se descarta: es preferible perder una
     * noticia de anime que colar veinte que no lo son.
     */
    .filter((item) => {
      if (!feed.soloAnime) return true;
      return PALABRAS_ANIME.test(`${item.title} ${item.summary}`);
    });
}

/**
 * Quita noticias repetidas al juntar las fuentes.
 *
 * Antes no había ninguna comprobación: se juntaban los cinco feeds tal
 * cual. Como el id se calcula a partir del enlace, la MISMA noticia
 * publicada por dos medios daba dos ids distintos y aparecía dos veces —
 * con el mismo titular y la misma carátula, pero con descripciones
 * distintas (cada medio redacta la suya, y encima se traducen por
 * separado). Justo el efecto raro de ver la misma noticia dos veces con
 * texto diferente.
 *
 * Se comparan los titulares normalizados: sin tildes, sin signos, sin
 * mayúsculas y sin palabras de relleno. No vale comparar el enlace,
 * porque precisamente es lo único que sí es distinto.
 */
function normalizarTitular(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tildes
    .replace(/[^a-z0-9\s]/g, " ") // signos
    .replace(/\s+/g, " ")
    .trim();
}

function quitarRepetidas(items: NewsItem[]): NewsItem[] {
  const vistos = new Set<string>();
  const salida: NewsItem[] = [];

  for (const item of items) {
    const clave = normalizarTitular(item.title);
    // Titulares muy cortos podrían chocar por casualidad; por debajo de
    // 15 caracteres no se arriesga y se deja pasar.
    if (clave.length >= 15 && vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(item);
  }

  return salida;
}

export async function GET() {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));

  // Cuántas noticias ha aportado cada fuente. Con treinta orígenes, si
  // alguno cambia de dirección o deja de publicar hay que poder verlo de
  // un vistazo en vez de notarlo semanas después.
  const porFuente = FEEDS.map((f, i) => {
    const r = results[i];
    return `${f.platform}: ${r.status === "fulfilled" ? r.value.length : "error"}`;
  });
  const itemsBrutos = quitarRepetidas(
    results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      // Se ordena ANTES de quitar repetidas para que, de dos copias, se
      // quede la más reciente.
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  );

  if (itemsBrutos.length === 0) {
    return NextResponse.json({ items: [], error: "Ninguna fuente respondió." }, { status: 502 });
  }

  /*
   * Popularidad, géneros y estudios ANTES de mandar el feed.
   *
   * Estos datos ya se pedían, pero uno por uno y después de pintar la
   * lista, así que cuando el feed se ordenaba no los tenía. La regla de
   * "si todavía no sé qué te gusta, primero lo conocido" no se aplicaba
   * a nada, y por eso a alguien nuevo le salían puras series que no
   * reconoce. Ahora llegan con la primera respuesta, en una sola
   * consulta para todos los títulos y con caché de seis horas.
   *
   * Si AniList no responde, el feed sale igual: simplemente vuelve a
   * ordenarse solo por fecha, como antes.
   */
  let items = itemsBrutos;
  let quitadasPorObra = 0;
  try {
    const datos = await datosDeTitulos(items.map((i) => i.relatedTitle));
    for (const item of items) {
      const d = datos.get(item.relatedTitle.toLowerCase().trim());
      if (!d) continue;
      if (typeof d.popularity === "number") {
        item.popularity = d.popularity;
        item.prominence = d.popularity >= 20000 ? "mainstream" : "indie";
      }
      if (typeof d.anilistId === "number") item.anilistId = d.anilistId;
      if (d.tituloCanonico) item.tituloCanonico = d.tituloCanonico;
      // La carátula oficial manda sobre la imagen que traiga el feed:
      // los medios suelen poner un fotograma suelto o su propio logo, y
      // la portada de AniList es la de la obra.
      if (d.coverImageUrl) item.coverImageUrl = d.coverImageUrl;
      if (item.genres.length === 0 && d.genres.length > 0) item.genres = d.genres;
      if (item.studios.length === 0 && d.studios.length > 0) item.studios = d.studios;
    }

    /*
     * Segunda pasada de duplicados, ahora por obra y no por titular.
     *
     * La primera pasada (quitarRepetidas) compara titulares, y eso no
     * detecta la misma noticia publicada con el título japonés en un
     * medio y el internacional en otro: "Chained Soldier obtiene una 3ª
     * temporada" y "'Mato Seihei no Slave' obtiene una tercera
     * temporada" son la misma serie y la misma noticia, pero los textos
     * no se parecen en nada.
     *
     * El identificador de AniList sí lo sabe. Se comparan también las
     * fechas: dos noticias de la misma serie con días de diferencia son
     * noticias distintas y las dos deben salir; lo que se quita es la
     * misma historia contada por dos medios el mismo día.
     */
    const antesDeDeduplicar = items.length;
    const vistasPorObra = new Set<string>();
    items = items.filter((item) => {
      // Se compara el título original (romaji) y NO el id: AniList tiene
      // fichas separadas para el anime y el manga de la misma serie, con
      // ids distintos, así que comparar ids no detectaba nada. El romaji
      // sí coincide en las dos fichas.
      if (!item.tituloCanonico) return true;
      const dia = item.publishedAt.slice(0, 10);
      const clave = `${normalizarTitular(item.tituloCanonico)}-${dia}`;
      if (vistasPorObra.has(clave)) return false;
      vistasPorObra.add(clave);
      return true;
    });
    quitadasPorObra = antesDeDeduplicar - items.length;
  } catch {
    // Mejor esfuerzo: sin estos datos el feed sigue funcionando.
  }

  // Resumen para diagnóstico. Si la popularidad no ordena bien puede ser
  // por dos motivos muy distintos: que AniList no reconozca los títulos
  // sacados de los titulares (y entonces casi nadie tiene el dato), o que
  // sí lleguen y el problema esté en cómo se puntúa. Sin este número hay
  // que adivinar cuál de los dos es.
  const conPopularidad = items.filter((i) => typeof i.popularity === "number").length;

  return NextResponse.json({
    items,
    diagnostico: {
      total: items.length,
      conPopularidad,
      conCaratula: items.filter((i) => !!i.coverImageUrl).length,
      // Cuántas noticias repetidas se han quitado por ser la misma obra
      // publicada con el título japonés y el internacional.
      quitadasPorObra,
      // Los títulos que AniList no ha reconocido, para ver si el problema
      // está en cómo se recorta el titular.
      sinReconocer: items
        .filter((i) => typeof i.popularity !== "number")
        .slice(0, 12)
        .map((i) => i.relatedTitle),
      // Qué contestó AniList de verdad en el último lote: con esto se ve
      // si rechaza la petición, si devuelve vacío o si ni llega.
      aniList: ultimoIntentoAniList,
      fuentes: porFuente,
    },
  });
}
