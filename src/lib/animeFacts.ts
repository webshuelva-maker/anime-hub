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

/*
 * Se pregunta con Page(...) { media(...) } y NO con Media(...) directo,
 * por el mismo motivo que en popularity.ts y anilist.ts (ya nos ha
 * mordido tres veces): con Media, un título que AniList no reconoce hace
 * que responda 404 y aquí se devolvía null — Iris se quedaba SIN ficha,
 * sin fecha de emisión y sin saber por qué, y acababa diciendo que no lo
 * sabía aunque la fecha existiera.
 *
 * Se piden además VARIOS candidatos, no uno: al buscar "Re:Zero" AniList
 * devuelve la primera temporada de 2016, que obviamente no tiene fecha
 * futura. Con varios en la mano se puede elegir el que de verdad está en
 * emisión o por estrenarse (ver elegirMejorFicha más abajo).
 */
const FACTS_QUERY = `
query ($search: String) {
  Page(perPage: 6) {
   media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
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
    externalLinks { site url type language }
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
          nextAiringEpisode { episode airingAt }
          title { romaji english }
        }
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
  /** Fecha exacta del próximo episodio de esa entrada, si la hay. */
  nextEpisodeDate: string | null;
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
  /** Web oficial y plataformas donde se emite, según AniList. */
  externalLinks: { site: string; url: string; type: string | null; language: string | null }[];
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
    nextAiringEpisode?: { episode?: number; airingAt?: number } | null;
    title?: { romaji?: string | null; english?: string | null };
  };
}

/** Busca la ficha completa de un anime. Devuelve null si no hay match. */
/**
 * Consulta reducida, sin los campos "de lujo" (relaciones, enlaces
 * externos, próximo episodio). Existe como respaldo: si AniList rechaza
 * la consulta completa por cualquier motivo —un campo que cambia de
 * nombre, un permiso, una versión del esquema— la app se quedaba SIN
 * ficha para todo, y de golpe dejaban de funcionar cosas tan visibles
 * como añadir un favorito. Con esto, lo básico sigue en pie.
 */
const FACTS_QUERY_MINIMA = `
query ($search: String) {
  Page(perPage: 6) {
   media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    id
    title { romaji english native }
    format
    status
    episodes
    season
    seasonYear
    startDate { year month day }
    endDate { year month day }
    genres
    popularity
    averageScore
    siteUrl
    studios(isMain: true) { nodes { name } }
  }
  }
}`;


/*
 * Elige la ficha correcta entre las que devuelve AniList.
 *
 * Coger la primera no vale. Buscando "Re:Zero" AniList devuelve la
 * primera temporada, de 2016: sin fecha futura y sin próximo episodio.
 * Así que a la pregunta "¿cuándo sale la parte 2?" la app se quedaba sin
 * ningún dato de fecha y contestaba que no lo sabía, aunque la fecha
 * existiera en otra ficha de la misma búsqueda.
 *
 * Criterio: si alguna candidata está EN EMISIÓN o SIN ESTRENAR, esa
 * manda — es de la que se puede decir algo sobre fechas próximas. Si
 * ninguna lo está, se queda la primera, que es la que mejor coincide de
 * nombre.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function elegirMejorFicha(candidatas: any[]): any {
  if (candidatas.length === 0) return null;
  const conFechaFutura = candidatas.find(
    (c) => c?.nextAiringEpisode || c?.status === "NOT_YET_RELEASED" || c?.status === "RELEASING"
  );
  return conFechaFutura ?? candidatas[0];
}

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
    let data = await res.json();

    // Si la consulta completa falla, se reintenta con la reducida antes
    // de darse por vencido. Un solo campo problemático no debe tumbar
    // toda la búsqueda de fichas.
    if (data?.errors || !data?.data?.Page?.media?.length) {
      console.error(
        "[animeFacts] consulta completa rechazada:",
        JSON.stringify(data?.errors ?? "sin Media").slice(0, 300)
      );
      const resMin = await fetch(ANILIST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0)",
        },
        body: JSON.stringify({ query: FACTS_QUERY_MINIMA, variables: { search: clean } }),
      });
      if (!resMin.ok) return null;
      data = await resMin.json();
    }

    const m = elegirMejorFicha(data?.data?.Page?.media ?? []);
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
        nextEpisodeDate: e.node?.nextAiringEpisode?.airingAt
          ? new Date(e.node.nextAiringEpisode.airingAt * 1000).toISOString().slice(0, 10)
          : null,
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
      externalLinks: (m.externalLinks ?? [])
        .filter((l: { site?: string; url?: string }) => l?.site && l?.url)
        .map((l: { site: string; url: string; type?: string; language?: string }) => ({
          site: l.site,
          url: l.url,
          type: l.type ?? null,
          language: l.language ?? null,
        })),
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

  // La web oficial y las plataformas donde se emite: es lo más fiable que
  // hay para "¿dónde puedo verlo?" y para saber quién anuncia qué.
  const official = facts.externalLinks.filter((l) => l.type === "OFFICIAL" || /official/i.test(l.site));
  const streaming = facts.externalLinks.filter((l) => l.type === "STREAMING");
  if (official.length) lines.push(`- Web oficial: ${official.map((l) => l.url).join(", ")}`);
  if (streaming.length) {
    lines.push(`- Se puede ver en: ${streaming.map((l) => `${l.site}${l.language ? ` (${l.language})` : ""}`).join(", ")}`);
  }
  if (facts.genres.length) lines.push(`- Géneros: ${facts.genres.join(", ")}`);

  // Continuaciones, partes y temporadas que TODAVÍA no han terminado.
  // Antes solo se miraban las relaciones marcadas como "SEQUEL", y así se
  // perdía justo lo que más se pregunta: cuándo empieza la segunda parte
  // de la temporada que se está emitiendo, que en la base de datos suele
  // ser una entrada aparte con otro tipo de relación.
  const upcoming = facts.relations.filter(
    (r) => r.status === "NOT_YET_RELEASED" || r.status === "RELEASING"
  );
  const sequels = facts.relations.filter((r) => r.relationType === "SEQUEL");
  const pending = [...upcoming];
  for (const s of sequels) if (!pending.some((p) => p.title === s.title)) pending.push(s);

  if (pending.length) {
    lines.push(
      `- Continuaciones y partes registradas en la base de datos: ${pending
        .map((s) => {
          const bits = [s.title];
          if (s.relationType) bits.push(`(${s.relationType.toLowerCase()})`);
          if (s.status) bits.push(STATUS_ES[s.status] ?? s.status);
          if (s.nextEpisodeDate) bits.push(`próximo episodio el ${s.nextEpisodeDate}`);
          else if (s.season && s.seasonYear) bits.push(`${SEASON_ES[s.season] ?? s.season} ${s.seasonYear}`);
          else if (s.startDate) bits.push(`empieza ${s.startDate}`);
          return bits.join(" — ");
        })
        .join(" | ")}`
    );
  } else {
    lines.push(
      "- No hay ninguna continuación ni parte pendiente registrada todavía en la base de datos (ojo: si la web dice que se ha anunciado una, puede ser un anuncio muy reciente que la base aún no recoge, o puede ser un rumor)."
    );
  }

  return lines.join("\n");
}
