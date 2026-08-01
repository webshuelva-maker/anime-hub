/**
 * Decide si un mensaje del usuario merece una investigación REAL en
 * internet antes de que Ren conteste, o si basta con su propio
 * conocimiento.
 *
 * Es una heurística deliberadamente barata (regex, sin llamadas a la
 * IA): añadir un modelo solo para clasificar la intención costaría otra
 * petición a Groq por cada mensaje, y el límite de peticiones/minuto del
 * plan gratuito ya es el cuello de botella histórico de esta app.
 *
 * El criterio es asimétrico a propósito: preferimos investigar de más en
 * preguntas con pinta de "dato concreto y actual" (fechas, temporadas,
 * confirmaciones, rumores) y no investigar en charla normal o en
 * recomendaciones, donde el conocimiento propio de Ren ya es bueno y
 * buscar solo añadiría 10 segundos de espera para nada.
 */

export interface ResearchIntent {
  needed: boolean;
  /** Motivo legible, útil para depurar sin adivinar por qué buscó o no. */
  reason: string;
}

/** El usuario pide explícitamente que busque: siempre se investiga. */
const EXPLICIT =
  /\b(busca(?:lo|me)?|búsca(?:lo|me)?|investiga|averigua|infórmate|informate|verifica|comprueba|contrasta|mira\s+(?:en|por)\s+internet|busca\s+en\s+internet|fuentes?\s+oficiales?|última\s+hora|ultima\s+hora)\b/i;

/**
 * Palabras que por sí solas ya son una pregunta de actualidad: si alguien
 * escribe "fecha", "confirmado" o "rumores", está preguntando por el
 * estado de algo AHORA, no por conocimiento general.
 */
const STRONG =
  /\b(cu[áa]ndo|fecha|estren\w*|sale|saldr[áa]|sali[óo]|lanzamiento|anunci\w*|confirm\w*|cancel\w*|renov\w*|retras\w*|aplaz\w*|rumor(?:es)?|filtraci[óo]n|filtraciones|leaks?|tr[áa]iler|trailer|se\s+sabe|novedades)\b/i;

/**
 * Temas que solo son de actualidad si además hay tono de pregunta o de
 * duda. "Película" a secas puede ser charla; "¿hay película?" no.
 */
const TOPIC =
  /\b(temporada|season|parte\s*\d|cour|episodio|cap[íi]tulo|pel[íi]cula|film|ova|especial|secuela|continuaci[óo]n|adaptaci[óo]n|doblaje|reparto|arco)\b/i;

/**
 * Señales de que se está preguntando o dudando AUNQUE NO HAYA "?".
 *
 * Esto es lo que fallaba antes: se exigía interrogación escrita o un año,
 * y una pregunta perfectamente normal como "sabes si habrá una cuarta
 * temporada de X" se colaba como si fuera charla, así que Ren respondía
 * de memoria en vez de buscar. Casi nadie escribe los signos de
 * interrogación al chatear.
 */
const ASKING =
  /[?¿]|\b(sabes|sab[ée]is|se\s+sabe|habr[áa]|hay|va\s+a\s+haber|van\s+a|tendr[áa]|existe|existir[áa]|es\s+cierto|dime|cu[ée]ntame|alguna|alg[úu]n|qu[ée]|cu[áa]l|cu[áa]ndo|c[óo]mo|si)\b/i;

/** "cuarta temporada", "temporada 4", "season 3", "S2". */
const NUMBERED_SEASON =
  /\b(primera|segunda|tercera|cuarta|quinta|sexta|s[ée]ptima|octava|novena|d[ée]cima)\s+(temporada|parte)\b|\b(temporada|season|parte)\s*\d+\b/i;

/**
 * Frases que son claramente un comentario personal, no una consulta. Sin
 * esto, "me encanta la segunda temporada de X" dispararía una búsqueda de
 * diez segundos para nada.
 */
const OPINION =
  /\b(me\s+encant|me\s+gust|me\s+flip|estoy\s+viendo|acabo\s+de\s+ver|he\s+visto|termin[ée]|odio|no\s+me\s+gust|qu[ée]\s+tal\s+est|opinas|recomi[ée]nda|recomienda)\w*/i;

const YEAR = /\b20\d{2}\b/;

export function shouldResearch(text: string, previousTopic?: string): ResearchIntent {
  const clean = text.trim();

  if (clean.length < 6) {
    return { needed: false, reason: "mensaje demasiado corto" };
  }

  if (EXPLICIT.test(clean)) {
    return { needed: true, reason: "el usuario ha pedido buscar explícitamente" };
  }

  const asking = ASKING.test(clean) || YEAR.test(clean);
  const opinion = OPINION.test(clean);

  if (STRONG.test(clean) && !(opinion && !asking)) {
    return { needed: true, reason: "pregunta por un dato de actualidad" };
  }

  if (NUMBERED_SEASON.test(clean) && !(opinion && !asking)) {
    return { needed: true, reason: "menciona una temporada concreta por número" };
  }

  if (TOPIC.test(clean) && asking && !opinion) {
    return { needed: true, reason: "pregunta sobre el estado de una serie" };
  }

  // Preguntas de seguimiento: "¿y ha terminado ya?", "tercera ya hay no?".
  // Sueltas no parecen consultas de actualidad, pero encadenadas a una
  // investigación anterior lo son — y responderlas de memoria es
  // justo como se colaban datos inventados.
  if (previousTopic && clean.length <= 70 && !opinion) {
    if (asking || TOPIC.test(clean) || /\b(ya|todav[íi]a|entonces|sigue|acab[óo]|termin\w*)\b/i.test(clean)) {
      return { needed: true, reason: `seguimiento sobre ${previousTopic}` };
    }
  }

  return { needed: false, reason: "charla o consulta de conocimiento general" };
}

/**
 * Extrae un candidato a título de anime del mensaje, quitando las
 * palabras de pregunta. No pretende ser exacto: solo sirve como plan B
 * para consultar AniList cuando la investigación no ha conseguido
 * devolver un título canónico. La búsqueda de AniList tolera bastante
 * ruido, así que un término aproximado suele bastar.
 */
export function guessTopicFromQuestion(text: string): string {
  const STOPWORDS = new Set([
    "cuando", "cuándo", "sale", "saldra", "saldrá", "la", "el", "los", "las", "de", "del",
    "una", "un", "cuarta", "tercera", "segunda", "quinta", "primera", "temporada", "season",
    "parte", "que", "qué", "se", "sabe", "hay", "noticias", "sobre", "para", "por", "y",
    "en", "a", "al", "con", "es", "está", "esta", "va", "ser", "anime", "manga", "nueva",
    "nuevo", "fecha", "estreno", "pelicula", "película", "rumores", "rumor", "confirmado",
    "busca", "buscame", "búscame", "investiga", "dime", "me", "puedes", "podrias", "podrías",
    "si", "algo", "ya", "the", "of", "next",
  ]);

  return text
    .replace(/[¿?¡!.,;:"']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w.toLowerCase()) && !/^\d+$/.test(w))
    .slice(0, 6)
    .join(" ")
    .trim();
}
