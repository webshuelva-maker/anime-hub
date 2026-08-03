import { urlIA } from "./ia";
import { ResearchSource, classifySource } from "./sourceTiers";
import { searchNews, searchWeb, hitsToPromptText, newestDate, NewsHit } from "./newsSearch";
import { searchReddit, redditToPromptText, RedditHit } from "./redditSearch";
import { getAnimeFacts, factsToPromptText, AnimeFacts } from "./animeFacts";
import { searchJikanAnime, getJikanNews, jikanFactsToPromptText, JikanFacts } from "./jikan";
import { shouldResearch, guessTopicFromQuestion } from "./researchIntent";

/**
 * La investigación de Ren, reconstruida.
 *
 * Antes tenía dos problemas de fondo:
 *
 * 1. Decidía si algo era una pregunta con una LISTA DE PALABRAS. Eso
 *    obliga al usuario a acertar con el vocabulario exacto y se rompe con
 *    sinónimos, con otro idioma o con palabras a medias. Ahora lo decide
 *    un modelo leyendo la conversación, que es justo para lo que sirve un
 *    modelo. La lista de palabras queda solo como red de seguridad por si
 *    esa llamada falla.
 *
 * 2. Delegaba la búsqueda en un sistema que decidía por su cuenta si
 *    buscaba, y cuando decidía que no, volvía sin nada — de ahí los
 *    "0 fuentes". Ahora buscamos nosotros, siempre, en varias fuentes a la
 *    vez y en paralelo: buscadores de noticias, ficha de AniList, ficha de
 *    MyAnimeList y las noticias que MAL tiene de ese anime concreto.
 */


const INTENT_MODEL = "llama-3.1-8b-instant"; // decidir esto no debe costar segundos

export interface Intent {
  needsResearch: boolean;
  /** false si la pregunta no va de anime/manga (un videojuego, cocina...). */
  isAnime: boolean;
  /** Serie de la que trata, resuelta aunque el usuario no la nombre aquí. */
  topic: string;
  /** Consultas listas para buscar, en inglés y en español. */
  queries: string[];
  debug: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Decide, con un modelo, si el último mensaje necesita datos actuales de
 * internet — y de qué serie habla, resolviendo referencias como "¿y ha
 * terminado ya?" a partir de lo hablado antes.
 */
export async function classifyIntent(
  apiKey: string,
  messages: ConversationMessage[]
): Promise<Intent> {
  const recent = messages.slice(-6);
  const lastUser = [...recent].reverse().find((m) => m.role === "user")?.content ?? "";

  const transcript = recent
    .map((m) => `${m.role === "user" ? "USUARIO" : "REN"}: ${m.content}`)
    .join("\n");

  const prompt = `Analiza esta conversación de una app de anime y decide si el ÚLTIMO mensaje del usuario necesita información actual de internet para responderse bien.

Necesita búsqueda si pregunta por algo que cambia con el tiempo: si existe o se ha confirmado una temporada, película u OVA; cuándo sale algo; si una serie sigue emitiéndose o ya terminó; cuántas temporadas o episodios hay; rumores, anuncios, retrasos, cancelaciones o novedades. Da igual cómo esté escrito, en qué idioma, con faltas, sin signos de interrogación o como una frase suelta ("3 temporada?", "y la peli", "is season 4 confirmed", "que se sabe").

NO necesita búsqueda si es un saludo, charla, una opinión, una recomendación general, o una pregunta sobre la trama, los personajes o el pasado lejano de una obra.

TAMPOCO necesita búsqueda si la pregunta va sobre la PROPIA APP y sus secciones: "qué es Conectar", "para qué sirve Tus gustos", "cómo borro lo que sabes de mí", "qué es esto". En ese caso needsResearch es false, isAnime es false y topic va vacío.

Si el último mensaje no nombra la serie pero se entiende por lo anterior, resuélvela tú.

Marca también si el tema ES de anime o manga. Si preguntan por un videojuego, una película occidental, una serie de imagen real, o cualquier otra cosa, isAnime es false (aunque siga necesitando búsqueda).

Responde SOLO con este JSON, sin texto alrededor ni markdown:
{"needsResearch": true|false, "isAnime": true|false, "topic": "nombre de la obra, o cadena vacía", "queryEn": "búsqueda en inglés", "queryEs": "búsqueda en español"}

Conversación:
${transcript}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(urlIA(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: INTENT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`intent ${res.status}`);

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(String(raw).replace(/```json|```/g, "").trim());

    const topic = String(parsed.topic ?? "").trim();
    const queries = [parsed.queryEn, parsed.queryEs]
      .map((q: unknown) => String(q ?? "").trim())
      .filter((q: string) => q.length > 1);

    return {
      needsResearch: parsed.needsResearch === true,
      isAnime: parsed.isAnime !== false,
      topic,
      queries: queries.length > 0 ? queries : topic ? [topic] : [],
      debug: "decidido por el modelo",
    };
  } catch (e) {
    // Red de seguridad: si el clasificador falla, se cae a la heurística
    // de palabras. Es peor, pero es mejor que no investigar nada.
    const fallback = shouldResearch(lastUser);
    const topic = guessTopicFromQuestion(lastUser);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      needsResearch: fallback.needed,
      isAnime: true,
      topic,
      queries: topic ? [topic] : [],
      debug: `clasificador caído (${msg}), usando heurística: ${fallback.reason}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface Evidence {
  /** Todo lo encontrado, ya en texto y listo para el prompt. */
  text: string;
  sources: ResearchSource[];
  anilist: AnimeFacts | null;
  jikan: JikanFacts | null;
  hits: NewsHit[];
  /** Resultados de la pasada de rumores (web abierta + Reddit). */
  rumorHits: NewsHit[];
  redditHits: RedditHit[];
  /** Fecha de la noticia más reciente encontrada (ISO) o null. */
  newest: string | null;
  /** true si no hay absolutamente nada en lo que apoyarse. */
  empty: boolean;
  debug: string;
}

/**
 * Reúne pruebas de todas las fuentes A LA VEZ. Ninguna es imprescindible:
 * si una falla, las demás siguen valiendo, y solo se da por vacía la
 * investigación cuando fallan todas.
 */
/**
 * Construye las consultas de la SEGUNDA pasada, la de rumores.
 *
 * Hace falta porque las fuentes de noticias serias no publican nada hasta
 * que está confirmado: buscando solo ahí, lo que "se dice" antes del
 * anuncio oficial no aparece nunca. Estas consultas van a la web abierta
 * y a Reddit, donde sí circulan filtraciones y comentarios de staff.
 */
function buildRumorQueries(topic: string, queries: string[]): string[] {
  const base = topic || queries[0] || "";
  if (!base) return [];
  return [
    `${base} leak OR rumor OR "not confirmed" new season`,
    `${base} filtración OR rumor nueva temporada`,
  ];
}

/**
 * Reúne pruebas de todas las fuentes A LA VEZ, en dos pasadas que se
 * lanzan juntas:
 *
 *   CONFIRMADO → buscadores de noticias, AniList, MyAnimeList y las
 *                noticias que MAL tiene de ese anime.
 *   RUMORES    → búsqueda web abierta (llega a X, foros, blogs de fans,
 *                donde anuncian las cuentas oficiales y donde viven las
 *                filtraciones) y Reddit.
 *
 * Las dos van etiquetadas por separado en el texto que recibe Ren, para
 * que no pueda mezclarlas aunque quiera. Ninguna fuente es
 * imprescindible: solo se da la investigación por vacía si fallan todas.
 */
/*
 * CACHÉ DE INVESTIGACIONES.
 *
 * Reunir las pruebas de un tema (buscadores, AniList, MyAnimeList,
 * Reddit) tarda entre tres y seis segundos, y la respuesta a "¿cuándo
 * sale la temporada 3 de X?" es exactamente la misma si se pregunta dos
 * veces en la misma tarde. Guardarla evita repetir todo ese trabajo.
 *
 * Se guarda por TEMA, no por pregunta: "cuándo sale la 3", "hay fecha
 * ya" y "se sabe algo de la tercera" dan las mismas pruebas, y con la
 * pregunta como clave no se aprovecharía ninguna.
 *
 * Tres horas: suficiente para que preguntar dos veces salga gratis, y
 * poco para no dar por buena una noticia de esta mañana cuando ya se ha
 * anunciado algo por la tarde. La respuesta que escribe Iris SÍ se
 * genera siempre de nuevo: las pruebas se reutilizan, el texto no, para
 * que siga adaptándose a la conversación.
 */
const TTL_INVESTIGACION = 3 * 60 * 60 * 1000;
const cacheEvidencias = new Map<string, { evidencia: Evidence; expira: number }>();

function claveEvidencia(topic: string, queries: string[]): string {
  const norm = (t: string) =>
    t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  return `${norm(topic)}|${queries.map(norm).sort().join("~")}`;
}

export async function gatherEvidence(
  topic: string,
  queries: string[],
  isAnime = true
): Promise<Evidence> {
  const clave = claveEvidencia(topic, queries);
  const guardada = cacheEvidencias.get(clave);
  if (guardada && guardada.expira > Date.now()) {
    return { ...guardada.evidencia, debug: `${guardada.evidencia.debug} | reutilizado de caché` };
  }

  const searchTerms = queries.length > 0 ? queries : topic ? [topic] : [];
  // Las fichas de AniList y MyAnimeList solo tienen sentido si el tema ES
  // anime. Buscar "Valorant" ahí devolvía cualquier cosa parecida de
  // nombre y Ren acababa mezclando un videojuego con un anime que no
  // tiene nada que ver — de ahí que "se liara" con preguntas de fuera.
  const rumorTerms = isAnime ? buildRumorQueries(topic, queries) : [];

  const [news, web, reddit, anilist, jikan] = await Promise.all([
    searchTerms.length > 0
      ? searchNews(searchTerms, 8)
      : Promise.resolve({ hits: [] as NewsHit[], debug: "sin consulta" }),
    rumorTerms.length > 0
      ? searchWeb(rumorTerms, 6)
      : Promise.resolve({ hits: [] as NewsHit[], debug: "sin consulta" }),
    rumorTerms.length > 0
      ? searchReddit(rumorTerms, 5)
      : Promise.resolve({ hits: [] as RedditHit[], debug: "sin consulta" }),
    topic && isAnime ? getAnimeFacts(topic) : Promise.resolve(null),
    topic && isAnime ? searchJikanAnime(topic) : Promise.resolve(null),
  ]);

  // Noticias que MyAnimeList tiene de ESE anime concreto: una fuente
  // dirigida al título exacto, que no depende de que un buscador
  // generalista acierte con la consulta.
  const malNews = jikan ? await getJikanNews(jikan.malId, 4) : [];

  const sources: ResearchSource[] = [];
  const pushSource = (src: ResearchSource) => {
    if (!sources.some((s) => s.url === src.url)) sources.push(src);
  };
  news.hits.forEach((h) => pushSource(h.source));
  for (const n of malNews) pushSource(classifySource(n.url, n.title));
  web.hits.forEach((h) => pushSource(h.source));
  reddit.hits.forEach((h) => pushSource(h.source));

  // La web oficial y las plataformas que da AniList son fuentes oficiales
  // de pleno derecho, y además responden al "¿dónde puedo verlo?".
  for (const link of anilist?.externalLinks ?? []) {
    if (link.type === "OFFICIAL" || link.type === "STREAMING") {
      pushSource(classifySource(link.url, `${link.site} — ${anilist?.title ?? ""}`.trim()));
    }
  }

  const blocks: string[] = [];
  if (anilist) blocks.push(factsToPromptText(anilist));
  if (jikan) blocks.push(jikanFactsToPromptText(jikan));
  if (news.hits.length > 0) {
    blocks.push(`NOTICIAS PUBLICADAS POR MEDIOS (lo verificable):\n\n${hitsToPromptText(news.hits)}`);
  }
  if (malNews.length > 0) {
    blocks.push(
      `NOTICIAS DE MYANIMELIST SOBRE ESTA SERIE:\n\n${malNews
        .map(
          (n) =>
            `- ${n.title} (${n.date ? n.date.slice(0, 10) : "sin fecha"})${n.excerpt ? `\n  ${n.excerpt}` : ""}`
        )
        .join("\n")}`
    );
  }
  if (web.hits.length > 0 || reddit.hits.length > 0) {
    const parts: string[] = [];
    if (web.hits.length > 0) parts.push(hitsToPromptText(web.hits));
    if (reddit.hits.length > 0) parts.push(`Comunidades:\n${redditToPromptText(reddit.hits)}`);
    blocks.push(
      `RUMORES Y FUENTES SIN VERIFICAR (búsqueda abierta en web, redes y foros — NADA de aquí está confirmado salvo que venga de una cuenta oficial, que va marcada como tal):\n\n${parts.join("\n\n")}`
    );
  }

  const malNewsDates = malNews.map((n) => n.date).filter((d): d is string => Boolean(d));
  const allDates = [newestDate(news.hits), ...malNewsDates]
    .filter((d): d is string => Boolean(d))
    .sort();

  const evidencia: Evidence = {
    text: blocks.join("\n\n"),
    sources: sources.slice(0, 10),
    anilist,
    jikan,
    hits: news.hits,
    rumorHits: web.hits,
    redditHits: reddit.hits,
    newest: allDates.length > 0 ? allDates[allDates.length - 1] : null,
    empty: blocks.length === 0,
    debug: `tema="${topic}" | noticias: ${news.debug} | web: ${web.debug} | reddit: ${reddit.debug} | anilist:${anilist ? "sí" : "no"} | mal:${jikan ? "sí" : "no"} | noticias-mal:${malNews.length}`,
  };

  // Solo se guarda lo que ha salido bien: si la búsqueda ha vuelto vacía,
  // guardarlo condenaría tres horas a repetir la misma nada.
  if (!evidencia.empty) {
    cacheEvidencias.set(clave, { evidencia, expira: Date.now() + TTL_INVESTIGACION });
  }

  return evidencia;
}
