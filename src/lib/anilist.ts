const ANILIST_URL = "https://graphql.anilist.co";

const QUERY = `
query ($search: String, $type: MediaType) {
  Media(search: $search, type: $type) {
    coverImage {
      extraLarge
      large
    }
  }
}`;

async function searchAniList(searchText: string, type: "ANIME" | "MANGA"): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

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
    if (!res.ok) return null;
    const data = await res.json();
    const cover = data?.data?.Media?.coverImage?.extraLarge || data?.data?.Media?.coverImage?.large;
    return cover ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Busca en AniList (API pública y gratuita, pensada precisamente para que
 * apps de terceros muestren carátulas oficiales) la portada real de un
 * anime o manga a partir de un texto de búsqueda. Prueba primero como
 * anime y, si no hay coincidencia (muchas noticias son de manga puro, sin
 * adaptación todavía), prueba como manga. Devuelve null si no hay
 * coincidencia en ninguno o si la API no responde a tiempo.
 */
export async function findCoverImage(searchText: string): Promise<string | null> {
  const anime = await searchAniList(searchText, "ANIME");
  if (anime) return anime;
  return searchAniList(searchText, "MANGA");
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
  anime: Page(page: 1, perPage: 3) {
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
