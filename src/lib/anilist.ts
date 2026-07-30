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
 * usarlo como término de búsqueda (los titulares suelen llevar contexto
 * extra alrededor del nombre real del anime).
 */
export function guessSeriesName(title: string): string {
  const cut = title.split(/[:\u2014-]| Season | Part | Episode /i)[0];
  return cut.trim().length > 3 ? cut.trim() : title.trim();
}
