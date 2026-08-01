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
 * Palabras que indican que se pregunta por un HECHO concreto y actual
 * (algo que cambia con el tiempo y que Ren no puede saber de memoria).
 */
const FACTUAL =
  /\b(cu[áa]ndo|qu[ée]\s+d[íi]a|fecha|estreno|estrena|se\s+estrena|sale|saldr[áa]|sali[óo]|lanzamiento|temporada|season|parte\s*\d|cour|episodio|cap[íi]tulo|pel[íi]cula|film|ova|especial|secuela|continuaci[óo]n|adaptaci[óo]n|anuncio|anunciad[oa]|confirmad[oa]|confirman|cancelad[oa]|renovad[oa]|retras[oa]|aplazad[oa]|rumor(?:es)?|filtraci[óo]n|filtraciones|leak|tr[áa]iler|trailer|reparto|doblaje|novedades|se\s+sabe|hay\s+noticias?)\b/i;

/** Señales de que se está preguntando algo, no solo comentando. */
const QUESTIONISH = /[?¿]/;
const YEAR = /\b20\d{2}\b/;

export function shouldResearch(text: string): ResearchIntent {
  const clean = text.trim();

  if (clean.length < 6) {
    return { needed: false, reason: "mensaje demasiado corto" };
  }

  if (EXPLICIT.test(clean)) {
    return { needed: true, reason: "el usuario ha pedido buscar explícitamente" };
  }

  if (FACTUAL.test(clean) && (QUESTIONISH.test(clean) || YEAR.test(clean))) {
    return { needed: true, reason: "pregunta por un dato concreto y actual" };
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
