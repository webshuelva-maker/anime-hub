/**
 * Jikan es la API pública y gratuita de MyAnimeList (sin clave, sin
 * registro). Aporta dos cosas que AniList sola no daba:
 *
 * 1. Un SEGUNDO testigo para los datos duros. Si AniList y MAL dicen lo
 *    mismo, el dato es sólido; si discrepan, casi siempre significa que
 *    hay un anuncio muy reciente que una de las dos todavía no ha
 *    recogido — y eso también es información útil que decir.
 * 2. Las noticias de MAL para ESE anime concreto, con fecha real. Es una
 *    fuente de noticias dirigida al título exacto, no una búsqueda
 *    genérica en la web que puede volver vacía.
 */

const JIKAN_BASE = "https://api.jikan.moe/v4";

export interface JikanFacts {
  malId: number;
  title: string;
  status: string | null; // "Currently Airing", "Finished Airing", "Not yet aired"
  airing: boolean;
  from: string | null;
  to: string | null;
  season: string | null;
  year: number | null;
  episodes: number | null;
  studios: string[];
  genres: string[];
  url: string | null;
  /*
   * Día y hora de emisión ("Fridays at 23:00 (JST)") y plataformas donde
   * verlo. Son las dos preguntas más frecuentes ("¿qué día sale?",
   * "¿dónde lo veo?") y MyAnimeList ya las trae en la misma respuesta,
   * así que no cuesta ninguna petición extra: solo había que leerlas.
   */
  emision: string | null;
  plataformas: { nombre: string; url: string }[];
}

export interface JikanNewsItem {
  title: string;
  url: string;
  date: string | null;
  excerpt: string;
}

/*
 * Jikan permite 3 peticiones por segundo, y una búsqueda de la app puede
 * hacer tres seguidas: la de la ficha (dentro de /api/anime-search) y las
 * dos del archivo de noticias. Justo en el límite, así que de vez en
 * cuando devuelve un 429 "vas muy rápido" y la respuesta se perdía en
 * silencio: la app concluía que ese anime no tenía noticias.
 *
 * Ahora, ante un 429, se espera y se reintenta una vez. Y se distingue
 * "no hay nada" de "no se ha podido preguntar", que hasta ahora era el
 * mismo null y llevaba a guardar el fallo como si fuera una respuesta.
 */
interface Respuesta {
  ok: boolean;
  datos: unknown | null;
  /*
   * Qué ha pasado exactamente, en corto.
   *
   * Existe porque diagnosticar esto a ciegas ya ha costado dos intentos
   * fallidos. Un "no se ha podido" sin motivo obliga a adivinar: 429 (vas
   * muy rápido), 403 (te está bloqueando), tiempo agotado (va lento o no
   * hay salida a internet) y error de red son cuatro problemas distintos
   * con cuatro soluciones distintas, y se arreglan en un intento si se
   * sabe cuál es.
   */
  motivo: string | null;
}

async function pedir(path: string, timeoutMs: number): Promise<Respuesta> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${JIKAN_BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "AnimeHub/1.0" },
    });
    if (res.status === 429) return { ok: false, datos: null, motivo: "429 demasiadas peticiones" };
    if (res.status === 404) {
      // Un 404 SÍ es una respuesta válida: significa que no hay nada.
      return { ok: true, datos: null, motivo: null };
    }
    if (!res.ok) return { ok: false, datos: null, motivo: `respuesta ${res.status}` };
    return { ok: true, datos: await res.json(), motivo: null };
  } catch (e) {
    const nombre = e instanceof Error ? e.name : "";
    const mensaje = e instanceof Error ? e.message : "";
    return {
      ok: false,
      datos: null,
      motivo:
        nombre === "AbortError"
          ? `sin respuesta en ${timeoutMs / 1000}s`
          : `no se pudo conectar (${mensaje.slice(0, 60) || nombre || "desconocido"})`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getJsonJikan(path: string, timeoutMs = 9000): Promise<Respuesta> {
  const primera = await pedir(path, timeoutMs);
  if (primera.ok) return primera;

  // Un solo reintento, y esperando de verdad: reintentar al instante
  // vuelve a chocar con el mismo límite.
  await new Promise((r) => setTimeout(r, 1200));
  const segunda = await pedir(path, timeoutMs);
  return segunda.ok ? segunda : { ...segunda, motivo: `${segunda.motivo} (2 intentos)` };
}

async function getJson(path: string, timeoutMs = 6000): Promise<unknown | null> {
  return (await getJsonJikan(path, timeoutMs)).datos;
}

interface RawJikanAnime {
  mal_id?: number;
  type?: string;
  title?: string;
  title_english?: string;
  status?: string;
  airing?: boolean;
  aired?: { from?: string | null; to?: string | null };
  season?: string | null;
  year?: number | null;
  episodes?: number | null;
  studios?: { name: string }[];
  genres?: { name: string }[];
  url?: string;
  broadcast?: { string?: string | null };
  streaming?: { name?: string; url?: string }[];
}

/**
 * Búsqueda de varios resultados en MyAnimeList, con el mismo formato que
 * devuelve el buscador de AniList.
 *
 * Es el plan B del buscador de animes de la app. AniList limita las
 * peticiones por minuto y la carga del feed hace unas cuantas, así que
 * justo después de abrir la app puede rechazar una búsqueda — y entonces
 * el usuario veía "no hay ningún anime con ese nombre" para títulos que
 * existen de sobra. Con dos bases distintas, que fallen las dos a la vez
 * es muy improbable.
 */
export async function searchJikanList(term: string): Promise<
  {
    id: number;
    title: string;
    coverImage: string | null;
    description: string | null;
    format: string | null;
    status: string | null;
    startYear: number | null;
    endYear: number | null;
    genres: string[];
    studios: string[];
    type: "ANIME";
  }[]
> {
  const clean = term.trim();
  if (clean.length < 2) return [];

  const data = (await getJson(// Sin el filtro "sfw": excluye todo lo clasificado para adultos, y ahí
  // caen series perfectamente normales como Mushoku Tensei. Con el filtro
  // puesto, buscar "mushoku" no devolvía NADA y la app concluía que no
  // existía.
  `/anime?q=${encodeURIComponent(clean)}&limit=8`)) as
    | { data?: (RawJikanAnime & { images?: { jpg?: { image_url?: string } }; synopsis?: string })[] }
    | null;

  return (data?.data ?? [])
    .filter((m) => m.mal_id && (m.title || m.title_english))
    .map((m) => ({
      id: m.mal_id as number,
      title: m.title_english || m.title || clean,
      coverImage: m.images?.jpg?.image_url ?? null,
      description: m.synopsis ? m.synopsis.replace(/\s+/g, " ").trim().slice(0, 300) : null,
      format: m.type ?? null,
      status: m.status ?? null,
      startYear: m.year ?? (m.aired?.from ? Number(m.aired.from.slice(0, 4)) : null),
      endYear: m.aired?.to ? Number(m.aired.to.slice(0, 4)) : null,
      genres: (m.genres ?? []).map((g) => g.name),
      studios: (m.studios ?? []).map((s) => s.name),
      type: "ANIME" as const,
    }));
}

export async function searchJikanAnime(name: string): Promise<JikanFacts | null> {
  const clean = name.trim();
  if (clean.length < 2) return null;

  const data = (await getJson(`/anime?q=${encodeURIComponent(clean)}&limit=1`)) as
    | { data?: RawJikanAnime[] }
    | null;
  const m = data?.data?.[0];
  if (!m?.mal_id) return null;

  return {
    malId: m.mal_id,
    title: m.title_english || m.title || clean,
    status: m.status ?? null,
    airing: m.airing === true,
    from: m.aired?.from ?? null,
    to: m.aired?.to ?? null,
    season: m.season ?? null,
    year: m.year ?? null,
    episodes: m.episodes ?? null,
    studios: (m.studios ?? []).map((s) => s.name),
    genres: (m.genres ?? []).map((g) => g.name),
    url: m.url ?? null,
    emision: m.broadcast?.string ?? null,
    plataformas: (m.streaming ?? [])
      .filter((s) => s?.name && s?.url)
      .map((s) => ({ nombre: s.name as string, url: s.url as string })),
  };
}

interface RawJikanNews {
  title?: string;
  url?: string;
  date?: string;
  excerpt?: string;
}

/**
 * Noticias que MyAnimeList tiene publicadas sobre ese anime concreto.
 * Devuelve también si la consulta llegó a hacerse, para poder distinguir
 * "esta serie no tiene noticias" de "no he podido preguntar".
 */
export async function getJikanNewsConEstado(
  malId: number,
  limit = 5
): Promise<{ ok: boolean; noticias: JikanNewsItem[]; motivo: string | null }> {
  const res = await getJsonJikan(`/anime/${malId}/news`);
  const data = res.datos as { data?: RawJikanNews[] } | null;
  return { ok: res.ok, noticias: mapearNoticias(data?.data ?? [], limit), motivo: res.motivo };
}

/** Noticias que MyAnimeList tiene publicadas sobre ese anime concreto. */
export async function getJikanNews(malId: number, limit = 5): Promise<JikanNewsItem[]> {
  const data = (await getJson(`/anime/${malId}/news`)) as { data?: RawJikanNews[] } | null;
  return mapearNoticias(data?.data ?? [], limit);
}

function mapearNoticias(items: RawJikanNews[], limit: number): JikanNewsItem[] {
  return items
    .filter((n) => n.title && n.url)
    .slice(0, limit)
    .map((n) => ({
      title: (n.title ?? "").trim(),
      url: n.url ?? "",
      date: n.date ?? null,
      excerpt: (n.excerpt ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
    }));
}

/** Ficha de MAL en texto, ya interpretada, para el prompt. */
export function jikanFactsToPromptText(f: JikanFacts): string {
  const lines = [`Ficha de MyAnimeList para "${f.title}":`];
  if (f.status) lines.push(`- Estado según MAL: ${f.status}${f.airing ? " (emitiéndose ahora)" : ""}`);
  if (f.episodes) lines.push(`- Episodios: ${f.episodes}`);
  if (f.season && f.year) lines.push(`- Temporada de emisión: ${f.season} ${f.year}`);
  if (f.from) lines.push(`- Empezó: ${f.from.slice(0, 10)}`);
  if (f.to) lines.push(`- Terminó: ${f.to.slice(0, 10)}`);
  if (f.studios.length) lines.push(`- Estudio: ${f.studios.join(", ")}`);
  // Las dos preguntas más frecuentes, y hasta ahora no se le pasaban a
  // Iris aunque MyAnimeList las devolvía en la misma respuesta.
  if (f.emision) lines.push(`- Día y hora de emisión: ${f.emision}`);
  if (f.plataformas.length) {
    lines.push(
      `- Dónde verlo (según MAL): ${f.plataformas.map((p) => `${p.nombre} (${p.url})`).join(", ")}`
    );
  }
  return lines.join("\n");
}
