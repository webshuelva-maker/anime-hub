const ANILIST_URL = "https://graphql.anilist.co";

/*
 * Se pregunta con Page(...) { media(...) } y no con Media(...) directo,
 * por el mismo motivo que en popularity.ts: con Media, un título que no
 * existe hace que AniList responda 404 y no devuelva nada. Con Page, no
 * encontrar nada es una lista vacía, que es una respuesta normal.
 */
const QUERY = `
query ($search: String, $type: MediaType) {
  Page(perPage: 1) {
    media(search: $search, type: $type, sort: SEARCH_MATCH) {
      coverImage {
        extraLarge
        large
      }
      popularity
    }
  }
}`;

interface AniListMatch {
  cover: string | null;
  popularity: number | null;
}

async function searchAniList(searchText: string, type: "ANIME" | "MANGA"): Promise<AniListMatch> {
  const controller = new AbortController();
  // 3 segundos se quedaban cortos y muchas carátulas se perdían por
  // tiempo agotado; nadie está esperando esta imagen con un cronómetro.
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0)",
      },
      body: JSON.stringify({ query: QUERY, variables: { search: searchText, type } }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    const m = data?.data?.Page?.media?.[0];
    if (!m) return { cover: null, popularity: null };
    const cover = m.coverImage?.extraLarge || m.coverImage?.large;
    const popularity = typeof m.popularity === "number" ? m.popularity : null;
    return { cover: cover ?? null, popularity };
  } catch {
    return { cover: null, popularity: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Busca en AniList (API pública y gratuita, pensada precisamente para que
 * apps de terceros muestren carátulas oficiales) la portada real de un
 * anime o manga a partir de un texto de búsqueda. Prueba primero como
 * anime y, si no hay coincidencia (muchas noticias son de manga puro, sin
 * adaptación todavía), prueba como manga. Devuelve también "popularity"
 * (cuánta gente tiene ese título en su lista en AniList) — es la señal
 * que se usa para priorizar animes conocidos cuando la app todavía no
 * sabe qué le gusta al usuario (ver scoreNewsItem en learning.ts).
 */
export async function findCoverImage(searchText: string): Promise<{ coverImageUrl: string | null; popularity: number | null }> {
  const [anime, manga] = await Promise.all([
    searchAniList(searchText, "ANIME"),
    searchAniList(searchText, "MANGA"),
  ]);
  // Antes esto elegía carátula Y popularidad juntas del mismo resultado
  // (anime si tenía carátula, si no manga entero) — así que si el anime
  // encajaba pero por lo que fuera no tenía carátula, se perdía también
  // su popularidad (se cogía la del manga, o ninguna). Ahora cada dato
  // se elige por separado, prefiriendo siempre el anime si hay match.
  return {
    coverImageUrl: anime.cover || manga.cover,
    popularity: anime.popularity ?? manga.popularity,
  };
}

export interface AnimeSearchResult {
  id: number;
  title: string;
  coverImage: string | null;
  description: string | null;
  format: string | null;
  status: string | null;
  startYear: number | null;
  endYear: number | null;
  genres: string[];
  type: "ANIME" | "MANGA";
}

const SEARCH_QUERY = `
query ($search: String) {
  anime: Page(page: 1, perPage: 8) {
    media(search: $search, type: ANIME) {
      id
      title { romaji english }
      coverImage { large }
      description(asHtml: false)
      format
      status
      startDate { year }
      endDate { year }
      genres
    }
  }
}`;

export interface AnimeSearchOutcome {
  results: AnimeSearchResult[];
  debug: string;
}

/**
 * Búsqueda real contra toda la base de datos de AniList (no solo lo que
 * tengamos cargado en el feed). Se usa desde el buscador de la app y desde
 * Ren, para poder hablar de cualquier anime exista o no una noticia sobre
 * él ahora mismo. Devuelve también un "debug" corto explicando qué pasó,
 * para poder diagnosticar sin adivinar si algo falla.
 */
export async function searchAnimeDatabase(term: string): Promise<AnimeSearchOutcome> {
  const clean = term.trim();
  if (clean.length < 2) return { results: [], debug: "término demasiado corto" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0)",
      },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: clean } }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return { results: [], debug: `AniList respondió ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();
    if (data.errors) {
      return { results: [], debug: `AniList devolvió error: ${JSON.stringify(data.errors).slice(0, 200)}` };
    }

    const media = data?.data?.anime?.media ?? [];
    const results = media.map((m: {
      id: number;
      title: { romaji?: string; english?: string };
      coverImage?: { large?: string };
      description?: string;
      format?: string;
      status?: string;
      startDate?: { year?: number };
      endDate?: { year?: number };
      genres?: string[];
    }) => ({
      id: m.id,
      title: m.title.english || m.title.romaji || "Sin título",
      coverImage: m.coverImage?.large ?? null,
      description: m.description ? m.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) : null,
      format: m.format ?? null,
      status: m.status ?? null,
      startYear: m.startDate?.year ?? null,
      endYear: m.endDate?.year ?? null,
      genres: m.genres ?? [],
      type: "ANIME" as const,
    }));

    return { results, debug: `ok, ${results.length} resultado(s)` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { results: [], debug: `excepción: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extrae del título de una noticia el nombre de serie más probable, para
 * usarlo como término de búsqueda. Los titulares de ANN suelen tener el
 * nombre de la serie al principio, seguido de una palabra tipo "Manga",
 * "Anime", "Film"... o separado por dos puntos/guion.
 */
export function guessSeriesName(title: string): string {
  const colonSplit = title.split(/[:\u2014]/)[0].trim();
  if (colonSplit.length > 3 && colonSplit.length < title.length) return colonSplit;

  const keywordSplit = title.split(
    /\s+(?:Manga|Anime|Novel|Light Novel|Film|Movie|Live-Action|TV Anime|Video Game|Game|OVA|Series)\b/i
  )[0].trim();
  if (keywordSplit.length > 3 && keywordSplit.length < title.length) return keywordSplit;

  const dashSplit = title.split(/ - /)[0].trim();
  if (dashSplit.length > 3 && dashSplit.length < title.length) return dashSplit;

  return title.trim();
}
