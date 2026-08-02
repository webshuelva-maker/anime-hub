/**
 * Kitsu: tercera base de datos de anime, pública y sin clave.
 *
 * Se añade porque con dos fuentes seguía habiendo búsquedas que volvían
 * vacías, y la explicación más probable es el límite de peticiones por
 * minuto: AniList y MyAnimeList se consultan también desde la carga del
 * feed, así que justo después de abrir la app pueden estar al límite.
 * Kitsu tiene su propia infraestructura y sus propios límites, de modo
 * que las tres a la vez es muy difícil que fallen.
 *
 * No sustituye a las otras: se consulta EN PARALELO y sus resultados se
 * añaden a los que falten.
 */

export interface ResultadoBusqueda {
  id: number;
  title: string;
  coverImage: string | null;
  description: string | null;
  format: string | null;
  status: string | null;
  startYear: number | null;
  endYear: number | null;
  genres: string[];
  type: "ANIME";
}

interface KitsuItem {
  id?: string;
  attributes?: {
    canonicalTitle?: string;
    titles?: { en?: string; en_jp?: string };
    synopsis?: string;
    subtype?: string;
    status?: string;
    startDate?: string | null;
    endDate?: string | null;
    posterImage?: { small?: string; medium?: string };
  };
}

export async function searchKitsu(term: string): Promise<ResultadoBusqueda[]> {
  const clean = term.trim();
  if (clean.length < 2) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(
      `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(clean)}&page[limit]=8`,
      {
        signal: controller.signal,
        headers: { Accept: "application/vnd.api+json" },
      }
    );
    if (!res.ok) return [];

    const data = (await res.json()) as { data?: KitsuItem[] };
    return (data.data ?? [])
      .filter((m) => m.attributes?.canonicalTitle || m.attributes?.titles?.en)
      .map((m) => {
        const a = m.attributes!;
        return {
          id: Number(m.id) || 0,
          title: a.titles?.en || a.canonicalTitle || clean,
          coverImage: a.posterImage?.medium ?? a.posterImage?.small ?? null,
          description: a.synopsis ? a.synopsis.replace(/\s+/g, " ").trim().slice(0, 300) : null,
          format: a.subtype ? a.subtype.toUpperCase() : null,
          status: a.status ?? null,
          startYear: a.startDate ? Number(a.startDate.slice(0, 4)) : null,
          endYear: a.endDate ? Number(a.endDate.slice(0, 4)) : null,
          genres: [],
          type: "ANIME" as const,
        };
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
