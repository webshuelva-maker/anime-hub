/**
 * Consulta "de ficha técnica" contra AniList: el estado real de una
 * serie según una base de datos que se actualiza en cuanto hay anuncio
 * oficial (estado de emisión, fecha de inicio, temporada, siguiente
 * episodio con fecha exacta, secuelas ya registradas...).
 *
 * Esto es el ANCLA de la investigación de Ren. La búsqueda web trae
 * titulares, opiniones y rumores; AniList trae el dato duro. Cuando
 * ambos se contradicen, manda AniList para lo que es "existe / está
 * anunciado / tiene fecha", y la web sirve para el matiz (rumores,
 * declaraciones, retrasos recién anunciados que la base aún no refleja).
 */

const ANILIST_URL = "https://graphql.anilist.co";

const FACTS_QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME) {
    id
    title { romaji english native }
    format
    status
    episodes
    season
    seasonYear
    startDate { year month day }
    endDate { year month day }
    nextAiringEpisode { episode airingAt }
    genres
    popularity
    averageScore
    siteUrl
    studios(isMain: true) { nodes { name } }
    relations {
      edges {
        relationType(version: 2)
        node {
          type
          format
          status
          season
          seasonYear
          startDate { year month day }
          title { romaji english }
        }
      }
    }
  }
}`;

export interface AnimeRelation {
  relationType: string;
  title: string;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  startDate: string | null;
}

export interface AnimeFacts {
  id: number;
  title: string;
  titleRomaji: string | null;
  titleNative: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  season: string | null;
  seasonYear: number | null;
  startDate: string | null;
  endDate: string | null;
  nextEpisode: { episode: number; date: string } | null;
  genres: string[];
  studios: string[];
  popularity: number | null;
  averageScore: number | null;
  siteUrl: string | null;
  relations: AnimeRelation[];
}

interface RawDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

function formatDate(d: RawDate | null | undefined): string | null {
  if (!d?.year) return null;
  const parts = [String(d.year)];
  if (d.month) parts.push(String(d.month).padStart(2, "0"));
  if (d.day) parts.push(String(d.day).padStart(2, "0"));
  return parts.join("-");
}

const STATUS_ES: Record<string, string> = {
  FINISHED: "terminado",
  RELEASING: "emitiéndose ahora mismo",
  NOT_YET_RELEASED: "anunciado, todavía sin emitir",
  CANCELLED: "cancelado",
  HIATUS: "en pausa",
};

const SEASON_ES: Record<string, string> = {
  WINTER: "invierno",
  SPRING: "primavera",
  SUMMER: "verano",
  FALL: "otoño",
};

interface RawRelationEdge {
  relationType?: string;
  node?: {
    type?: string;
    format?: string | null;
    status?: string | null;
    season?: string | null;
    seasonYear?: number | null;
    startDate?: RawDate | null;
    title?: { romaji?: string | null; english?: string | null };
  };
}

/** Busca la ficha completa de un anime. Devuelve null si no hay match. */
export async function getAnimeFacts(searchText: string): Promise<AnimeFacts | null> {
  const clean = searchText.trim();
  if (clean.length < 2) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0)",
      },
      body: JSON.stringify({ query: FACTS_QUERY, variables: { search: clean } }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const data = await res.json();
    const m = data?.data?.Media;
    if (!m) return null;

    const relations: AnimeRelation[] = (m.relations?.edges ?? [])
      .filter((e: RawRelationEdge) => e?.node?.type === "ANIME")
      .map((e: RawRelationEdge) => ({
        relationType: e.relationType ?? "",
        title: e.node?.title?.english || e.node?.title?.romaji || "",
        format: e.node?.format ?? null,
        status: e.node?.status ?? null,
        season: e.node?.season ?? null,
        seasonYear: e.node?.seasonYear ?? null,
        startDate: formatDate(e.node?.startDate),
      }))
      .filter((r: AnimeRelation) => r.title.length > 0);

    return {
      id: m.id,
      title: m.title?.english || m.title?.romaji || clean,
      titleRomaji: m.title?.romaji ?? null,
      titleNative: m.title?.native ?? null,
      format: m.format ?? null,
      status: m.status ?? null,
      episodes: m.episodes ?? null,
      season: m.season ?? null,
      seasonYear: m.seasonYear ?? null,
      startDate: formatDate(m.startDate),
      endDate: formatDate(m.endDate),
      nextEpisode: m.nextAiringEpisode
        ? {
            episode: m.nextAiringEpisode.episode,
            date: new Date(m.nextAiringEpisode.airingAt * 1000).toISOString(),
          }
        : null,
      genres: m.genres ?? [],
      studios: (m.studios?.nodes ?? []).map((s: { name: string }) => s.name),
      popularity: typeof m.popularity === "number" ? m.popularity : null,
      averageScore: typeof m.averageScore === "number" ? m.averageScore : null,
      siteUrl: m.siteUrl ?? null,
      relations,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convierte la ficha en texto plano para meterla en el prompt. Se
 * escribe en español y ya interpretado (no "NOT_YET_RELEASED" sino
 * "anunciado, todavía sin emitir") para que el modelo no tenga que
 * traducir jerga de la API y se equivoque al hacerlo.
 */
export function factsToPromptText(facts: AnimeFacts): string {
  const lines: string[] = [];
  lines.push(`Ficha oficial de AniList para "${facts.title}"${facts.titleRomaji && facts.titleRomaji !== facts.title ? ` (${facts.titleRomaji})` : ""}:`);
  if (facts.status) lines.push(`- Estado: ${STATUS_ES[facts.status] ?? facts.status}`);
  if (facts.format) lines.push(`- Formato: ${facts.format}`);
  if (facts.episodes) lines.push(`- Episodios registrados: ${facts.episodes}`);
  if (facts.season && facts.seasonYear) {
    lines.push(`- Temporada de emisión: ${SEASON_ES[facts.season] ?? facts.season} de ${facts.seasonYear}`);
  }
  if (facts.startDate) lines.push(`- Fecha de inicio registrada: ${facts.startDate}`);
  if (facts.endDate) lines.push(`- Fecha de fin registrada: ${facts.endDate}`);
  if (facts.nextEpisode) {
    lines.push(
      `- Próximo episodio: nº ${facts.nextEpisode.episode}, el ${facts.nextEpisode.date.slice(0, 10)} (dato exacto, de la base de datos)`
    );
  }
  if (facts.studios.length) lines.push(`- Estudio: ${facts.studios.join(", ")}`);
  if (facts.genres.length) lines.push(`- Géneros: ${facts.genres.join(", ")}`);

  const sequels = facts.relations.filter((r) => r.relationType === "SEQUEL");
  if (sequels.length) {
    lines.push(
      `- Secuelas registradas en la base de datos: ${sequels
        .map((s) => {
          const bits = [s.title];
          if (s.status) bits.push(STATUS_ES[s.status] ?? s.status);
          if (s.season && s.seasonYear) bits.push(`${SEASON_ES[s.season] ?? s.season} ${s.seasonYear}`);
          else if (s.startDate) bits.push(s.startDate);
          return bits.join(" — ");
        })
        .join(" | ")}`
    );
  } else {
    lines.push(
      "- No hay ninguna secuela registrada todavía en la base de datos (ojo: si la web dice que se ha anunciado una, puede ser un anuncio muy reciente que la base aún no recoge, o puede ser un rumor)."
    );
  }

  return lines.join("\n");
}
