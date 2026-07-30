const ANILIST_URL = "https://graphql.anilist.co";

const QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME) {
    coverImage {
      extraLarge
      large
    }
  }
}`;

/**
 * Busca en AniList (API pública y gratuita, pensada precisamente para que
 * apps de terceros muestren carátulas oficiales) la portada real de un
 * anime a partir de un texto de búsqueda. Devuelve null si no hay
 * coincidencia o si la API no responde a tiempo — nunca bloquea el resto
 * del feed por esto.
 */
export async function findCoverImage(searchText: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { search: searchText } }),
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
