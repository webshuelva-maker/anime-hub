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
