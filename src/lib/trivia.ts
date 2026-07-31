export const ANIME_TRIVIA: string[] = [
  "«Sazae-san» es el anime más longevo de la historia: se emite en Japón desde 1969.",
  "El estudio Ghibli debe su nombre a un avión italiano de la Segunda Guerra Mundial.",
  "«Astro Boy» (1963) fue la primera serie de anime semanal producida en Japón.",
  "La palabra \"anime\" en Japón se usa para cualquier animación, no solo la japonesa.",
  "«One Piece» lleva serializándose desde 1997 y todavía no ha terminado.",
  "Hayao Miyazaki ha anunciado su retirada varias veces a lo largo de su carrera.",
  "El opening de «Neon Genesis Evangelion» se grabó antes de que el guion estuviera terminado.",
  "«Dragon Ball» está inspirado libremente en la novela china Viaje al Oeste.",
  "Muchos estudios de animación japoneses subcontratan partes del proceso a otros países de Asia.",
  "El término \"seiyuu\" designa a los actores de doblaje japoneses, toda una profesión de prestigio.",
];

export function pickTrivia(seed: number): string {
  return ANIME_TRIVIA[seed % ANIME_TRIVIA.length];
}
