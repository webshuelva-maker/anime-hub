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
}

export interface JikanNewsItem {
  title: string;
  url: string;
  date: string | null;
  excerpt: string;
}

async function getJson(path: string, timeoutMs = 6000): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${JIKAN_BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "AnimeHub/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface RawJikanAnime {
  mal_id?: number;
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
}

export async function searchJikanAnime(name: string): Promise<JikanFacts | null> {
  const clean = name.trim();
  if (clean.length < 2) return null;

  const data = (await getJson(`/anime?q=${encodeURIComponent(clean)}&limit=1&sfw=true`)) as
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
  };
}

interface RawJikanNews {
  title?: string;
  url?: string;
  date?: string;
  excerpt?: string;
}

/** Noticias que MyAnimeList tiene publicadas sobre ese anime concreto. */
export async function getJikanNews(malId: number, limit = 5): Promise<JikanNewsItem[]> {
  const data = (await getJson(`/anime/${malId}/news`)) as { data?: RawJikanNews[] } | null;
  const items = data?.data ?? [];

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
  return lines.join("\n");
}
