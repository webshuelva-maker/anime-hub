/**
 * Comparar títulos de anime sin que la puntuación lo estropee todo.
 *
 * ---------------------------------------------------------------------
 * QUÉ ROMPÍA ESTO (v174)
 *
 * La búsqueda comparaba con `titulo.includes(consulta)`, la cadena entera
 * tal cual. Con una palabra suelta va bien. Con el título oficial de una
 * serie, no: buscando
 *
 *     Re:ZERO -Starting Life in Another World-
 *
 * ninguna noticia contiene esa cadena literal, porque los medios titulan
 * "Re:Zero confirma temporada 4". Resultado: "nada por aquí" para una
 * serie de la que sí hay noticias. Y peor, la búsqueda en las bases de
 * datos de anime devolvía lo que fuera que le sonara de lejos y se
 * enseñaba sin filtrar: por eso salía "How a Realist Hero Rebuilt the
 * Kingdom" al buscar Re:ZERO.
 *
 * Aquí se compara por partes:
 *
 *  - Se normaliza (minúsculas, sin tildes, la puntuación pasa a espacio),
 *    así "Re:ZERO" y "Re Zero" son lo mismo.
 *  - Se saca el NÚCLEO: lo que va antes del primer " -" o " (", que en los
 *    títulos oficiales de anime es casi siempre el nombre de la franquicia
 *    y lo de después el subtítulo. De "Re:ZERO -Starting Life in Another
 *    World-" queda "re zero".
 *  - Se puntúa. Sin puntos, no se enseña.
 * ---------------------------------------------------------------------
 */

/** Minúsculas, sin tildes, puntuación convertida en espacios. */
export function normalizarTitulo(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * El nombre de la franquicia, sin el subtítulo.
 *
 * Se corta por " -" y por " (" pero NO por ":", justo porque hay títulos
 * cuyo nombre lleva dos puntos dentro ("Re:ZERO", "Fate:..."): cortando
 * ahí quedaría "re", que coincide con media base de datos.
 */
export function nucleoDeTitulo(titulo: string): string {
  const cortado = titulo.split(/\s[-–—]|\s\(/)[0];
  return normalizarTitulo(cortado);
}

/**
 * Cuánto se parece un candidato a lo que se buscaba. 0 = nada que ver.
 *
 * Los números no significan nada por sí solos; solo sirven para ordenar
 * y para tener un listón por debajo del cual no se enseña.
 */
export function puntuarCoincidencia(consulta: string, candidato: string): number {
  const q = normalizarTitulo(consulta);
  const c = normalizarTitulo(candidato);
  if (!q || !c) return 0;

  if (c === q) return 100;

  const nucleo = nucleoDeTitulo(consulta);
  const nucleoCandidato = nucleoDeTitulo(candidato);

  // Mismo nombre de franquicia: "Re:ZERO -Starting Life-" contra
  // "Re:Zero Season 3".
  if (nucleo.length >= 3 && nucleo === nucleoCandidato) return 90;

  if (c.includes(q) || q.includes(c)) return 80;
  if (nucleo.length >= 3 && c.includes(nucleo)) return 70;

  // Palabras en común, sin contar las de relleno: sin quitarlas, "in",
  // "the" o "world" emparejarían casi cualquier cosa con casi cualquier
  // cosa.
  const relleno = new Set([
    "the", "a", "an", "of", "in", "no", "to", "and", "y", "de", "la", "el",
    "life", "world", "another", "season", "part", "movie", "tv",
  ]);
  const palabras = (t: string) =>
    new Set(t.split(" ").filter((p) => p.length >= 3 && !relleno.has(p)));

  const pq = palabras(q);
  const pc = palabras(c);
  if (pq.size === 0) return 0;

  let comunes = 0;
  for (const p of pq) if (pc.has(p)) comunes++;
  if (comunes === 0) return 0;

  // Proporción de lo buscado que aparece en el candidato. Todas las
  // palabras distintivas presentes = 60; la mitad = 30.
  return Math.round((comunes / pq.size) * 60);
}

/** Listón por debajo del cual un resultado es ruido y no se enseña. */
export const MINIMO_COINCIDENCIA = 30;

/**
 * Reduce un titular a algo con lo que se pueda buscar en una base de
 * datos de anime.
 *
 * ---------------------------------------------------------------------
 * PARA QUÉ (v177)
 *
 * En la app se puede acabar buscando el TITULAR entero, no el nombre de
 * la serie. Por ejemplo:
 *
 *     Re:ZERO -Starting Life in Another World- proseguirá con el arco
 *     The Recapture en su temporada 4
 *
 * Ninguna base de datos encuentra nada con eso: buscan por título de
 * obra, y esa frase no es el título de nada. El resultado era que no
 * salía la ficha de la serie, aunque la serie exista y sea famosa.
 *
 * Esto se queda con el nombre de la franquicia. Sirve como SEGUNDO
 * intento: primero se busca lo que la persona escribió tal cual, y solo
 * si eso no da nada se prueba con la versión corta. Así una búsqueda
 * normal no cambia de comportamiento ni gasta peticiones de más.
 * ---------------------------------------------------------------------
 */
export function consultaCorta(texto: string): string {
  const limpio = texto
    .replace(/\s+/g, " ")
    // "El anime de X...", "La serie X..." — sobra para buscar la obra.
    .replace(/^(el|la|los|las)\s+(anime|manga|serie|pel[íi]cula|film|novela)\s+(de\s+)?/i, "")
    .trim();

  // Si el título oficial va entre guiones al principio —el formato
  // habitual: "Re:ZERO -Starting Life in Another World-"— el nombre de la
  // franquicia es lo de delante.
  const nucleo = nucleoDeTitulo(limpio);
  const palabrasNucleo = nucleo.split(" ").filter(Boolean).length;
  if (nucleo.length >= 3 && palabrasNucleo <= 6 && nucleo.length < limpio.length * 0.7) {
    return nucleo;
  }

  /*
   * Sin guiones, se corta en el primer verbo de titular. Los titulares
   * tienen casi siempre la misma forma: NOMBRE DE LA OBRA + lo que ha
   * pasado con ella. "Frieren confirma su segunda temporada" → "Frieren".
   */
  const marcas = [
    " confirma", " anuncia", " revela", " estrena", " tendrá", " tendra",
    " proseguirá", " proseguira", " continuará", " continuara", " lanza",
    " presenta", " llega", " adapta", " se estrena", " gets ", " reveals ",
    " announces ", " confirms ", " launches ", " debuts ",
  ];
  const enMinusculas = ` ${limpio.toLowerCase()}`;
  let corte = limpio.length;
  for (const marca of marcas) {
    const i = enMinusculas.indexOf(marca);
    // Se exige que quede algo delante: si el titular EMPIEZA por la
    // marca, cortar ahí dejaría el nombre vacío.
    if (i > 3 && i < corte) corte = i;
  }
  const recortado = limpio.slice(0, corte).replace(/[\s,:;]+$/, "").trim();
  if (recortado.length >= 3) return recortado;

  // Último recurso: las primeras palabras.
  const palabras = limpio.split(" ").filter(Boolean);
  if (palabras.length <= 5) return limpio;
  return palabras.slice(0, 4).join(" ");
}

/**
 * Palabras que en un titular marcan dónde deja de estar el nombre de la
 * obra y empieza la noticia. Recortadas de la lista más larga que usa el
 * feed, quedándose con las que aparecen en español.
 */
const MARCAS_DE_NOTICIA = [
  "proseguirá", "continuará", "revela", "anuncia", "estrena", "confirma",
  "obtiene", "tendrá", "lanza", "presenta", "adelanta", "retrasa",
  "temporada", "película", "tráiler", "trailer", "reseña", "entrevista",
  "capítulo", "episodio", "arco", "reparto", "fecha",
  " gets ", " reveals ", " announces ", " season ", " confirms ", " debuts ",
];

/**
 * Convierte lo que se ha escrito en algo con lo que se pueda preguntar a
 * una base de datos de anime.
 *
 * ---------------------------------------------------------------------
 * PARA QUÉ (v177)
 *
 * En la app se busca de dos formas muy distintas y hasta ahora se
 * trataban igual:
 *
 *   - Se escribe "Re:Zero" a mano.
 *   - Se pulsa una noticia y el buscador se rellena con el TITULAR
 *     ENTERO: "Re:ZERO -Starting Life in Another World- proseguirá con
 *     el arco The Recapture en su temporada 4".
 *
 * A AniList o MyAnimeList se les puede preguntar por lo primero. Por lo
 * segundo no: buscan un título, no una frase, y devuelven cero. Por eso
 * al pulsar una noticia desaparecía el bloque de Contenido.
 *
 * Esto recorta la frase hasta dejar el nombre de la obra: quita el "El
 * anime" del principio, corta por el guion que separa título de
 * subtítulo y por la primera palabra que delata que ya se está contando
 * la noticia.
 * ---------------------------------------------------------------------
 */
export function acortarConsulta(texto: string): string {
  let t = texto.replace(/\s+/g, " ").trim();

  // "El anime Frieren confirma..." → "Frieren confirma..."
  t = t.replace(/^(el|la|los|las)\s+(anime|manga|serie|pel[íi]cula|film|novela)\s+/i, "");

  // Corte por el guion o el paréntesis que abre el subtítulo.
  const porGuion = t.split(/\s[-–—]|\s\(/)[0].trim();
  if (porGuion.length >= 3) t = porGuion;

  // Corte por la primera palabra de noticia.
  const minus = t.toLowerCase();
  let corte = t.length;
  for (const marca of MARCAS_DE_NOTICIA) {
    const i = minus.indexOf(marca);
    // Se exige que quede algo delante: si empieza por la marca, cortar
    // ahí dejaría la consulta vacía.
    if (i > 3 && i < corte) corte = i;
  }

  return t.slice(0, corte).replace(/[\s,:;–—-]+$/, "").trim();
}
