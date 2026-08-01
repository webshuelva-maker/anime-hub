/**
 * Clasifica cada fuente que aparece en una investigación de Ren según
 * lo fiable que es, para que en el chat se vea de un vistazo si un dato
 * viene de un anuncio oficial, de prensa especializada seria, o de un
 * agregador/filtración que hay que coger con pinzas.
 *
 * La clasificación es por dominio y deliberadamente conservadora: lo que
 * no reconocemos NO se marca como fiable, se marca como "sin verificar".
 * Es mejor que una fuente buena aparezca infravalorada a que un blog de
 * rumores se cuele con etiqueta de oficial.
 */

export type SourceTier = "oficial" | "prensa" | "sin-verificar";

export interface ResearchSource {
  title: string;
  url: string;
  domain: string;
  tier: SourceTier;
}

export const TIER_LABEL: Record<SourceTier, string> = {
  oficial: "Oficial",
  prensa: "Prensa",
  "sin-verificar": "Sin verificar",
};

/** Mismos colores que los badges de fiabilidad del feed, por coherencia. */
export const TIER_COLOR: Record<SourceTier, string> = {
  oficial: "#4d9b7a",
  prensa: "#6d93c4",
  "sin-verificar": "#b7965f",
};

/**
 * Prensa especializada seria. Se comprueba ANTES que la regla de
 * dominios japoneses, porque medios como Oricon o Natalie son .jp pero
 * son prensa, no la fuente oficial de la obra.
 */
const PRESS_DOMAINS = [
  "animenewsnetwork.com",
  "myanimelist.net",
  "otakuusamagazine.com",
  "animecorner.me",
  "ramenparados.com",
  "misiontokyo.com",
  "koi-nya.net",
  "natalie.mu",
  "oricon.co.jp",
  "animeanime.jp",
  "mantan-web.jp",
  "nikkei.com",
  "asahi.com",
  "variety.com",
  "hollywoodreporter.com",
  "polygon.com",
  "ign.com",
  "anitrendz.net",
  "honeysanime.com",
];

/**
 * Fuentes oficiales: la propia obra, su editorial, su estudio o la
 * plataforma que la emite. Un anuncio aquí es un anuncio de verdad.
 */
const OFFICIAL_DOMAINS = [
  "crunchyroll.com",
  "netflix.com",
  "primevideo.com",
  "amazon.com",
  "disneyplus.com",
  "max.com",
  "hidive.com",
  "animebox.es",
  "aniplex.co.jp",
  "aniplexusa.com",
  "toei-anim.co.jp",
  "kadokawa.co.jp",
  "shueisha.co.jp",
  "shonenjump.com",
  "viz.com",
  "kodansha.co.jp",
  "kodansha.us",
  "shogakukan.co.jp",
  "square-enix.com",
  "mappa.co.jp",
  "ufotable.com",
  "wit-studio.com",
  "bones.co.jp",
  "cloverworks.co.jp",
  "madhouse.co.jp",
  "a-1pictures.jp",
  "khara.co.jp",
  "sunrise-inc.co.jp",
  "kyotoanimation.co.jp",
  "trigger.co.jp",
  "pierrot.co.jp",
  "production-ig.co.jp",
  "davidproduction.jp",
  "anilist.co",
];

/**
 * Agregadores, foros y sitios que viven del rumor. Pueden acertar, pero
 * nunca son una confirmación por sí solos.
 */
const UNVERIFIED_DOMAINS = [
  "sportskeeda.com",
  "screenrant.com",
  "epicstream.com",
  "thecinemaholic.com",
  "gamerant.com",
  "cbr.com",
  "dexerto.com",
  "hitc.com",
  "reddit.com",
  "x.com",
  "twitter.com",
  "quora.com",
  "fandom.com",
  "wikipedia.org",
  "pinterest.com",
  "youtube.com",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
];

/**
 * Cuentas oficiales en redes sociales. Un anuncio en la cuenta oficial de
 * una plataforma o de un estudio ES oficial, aunque esté en X o en
 * YouTube — pero en la misma red conviven con filtradores anónimos, así
 * que la única forma honesta de distinguirlos es una lista explícita.
 * Lo que no esté aquí se queda en "sin verificar", que es lo correcto.
 */
const OFFICIAL_SOCIAL_HANDLES = [
  "crunchyroll",
  "crunchyroll_es",
  "crunchyrolles",
  "crunchyroll_pt",
  "netflix",
  "netflixanime",
  "netflixes",
  "primevideo",
  "primevideoes",
  "hbomax",
  "streamonmax",
  "animeboxes",
  "animebox_es",
  "disneyplus",
  "disneyplusesp",
  "aniplex_plus",
  "aniplexusa",
  "shonenjump",
  "jump_henshubu",
  "mangamo",
  "toei_anim",
  "mappa_info",
  "ufotable",
  "wit_studio",
  "cloverworks_inc",
  "anime_news",
  "animetv_jp",
];

/** Extrae el "handle" de una URL de red social, si lo tiene. */
function socialHandle(url: string, domain: string): string | null {
  const social = /^(x\.com|twitter\.com|youtube\.com|instagram\.com|tiktok\.com)$/.test(domain);
  if (!social) return null;
  try {
    const path = new URL(url).pathname.replace(/^\/+/, "");
    const first = path.split("/")[0].replace(/^@/, "").toLowerCase();
    return first || null;
  } catch {
    return null;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

function matches(domain: string, list: string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function classifySource(url: string, title: string): ResearchSource {
  const domain = domainOf(url);

  let tier: SourceTier = "sin-verificar";

  // Antes que nada: ¿es una cuenta oficial en una red social?
  const handle = socialHandle(url, domain);
  if (handle && OFFICIAL_SOCIAL_HANDLES.includes(handle)) {
    return { title: title.trim() || domain, url, domain: `${domain}/${handle}`, tier: "oficial" };
  }

  if (matches(domain, UNVERIFIED_DOMAINS)) {
    tier = "sin-verificar";
  } else if (matches(domain, PRESS_DOMAINS)) {
    tier = "prensa";
  } else if (matches(domain, OFFICIAL_DOMAINS)) {
    tier = "oficial";
  } else if (/\.jp$/.test(domain) || /\.co\.jp$/.test(domain)) {
    // Webs japonesas no reconocidas: casi siempre son la web oficial de
    // la obra, del estudio o de la editorial. Es la única suposición
    // "generosa" que hacemos, y solo después de descartar todo lo demás.
    tier = "oficial";
  }

  return { title: title.trim() || domain, url, domain, tier };
}
