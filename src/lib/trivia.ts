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
  "«Akira» (1988) tardó unos tres años en producirse y usó más de 160.000 fotogramas.",
  "El estudio Toei Animation, fundado en 1948, es uno de los más antiguos de Japón.",
  "«Pokémon» comenzó como videojuego en 1996 antes de convertirse en anime al año siguiente.",
  "Osamu Tezuka, creador de Astro Boy, es considerado el \"padre del manga\" moderno.",
  "«Sailor Moon» popularizó el género \"mahou shoujo\" (chica mágica) fuera de Japón.",
  "El anime «Naruto» dio nombre a toda una generación de fans del ninja ficticio.",
  "Studio Trigger fue fundado en 2011 por ex-animadores de Gainax.",
  "«Cowboy Bebop» mezcla jazz, western y ciencia ficción en un mismo universo.",
  "Muchos animes de los 80 y 90 se grababan directamente en celuloide pintado a mano.",
  "«Death Note» generó tanto debate que algunas escuelas japonesas lo prohibieron en sus bibliotecas.",
  "El estudio MAPPA fue fundado en 2011 por Masao Maruyama, cofundador también de Madhouse.",
  "«Attack on Titan» empezó como manga independiente antes de convertirse en fenómeno mundial.",
  "El anime «Doraemon» lleva emitiéndose, con distintas versiones, desde los años 70.",
  "«My Neighbor Totoro» es la mascota oficial del Studio Ghibli desde su estreno en 1988.",
  "En japonés, \"otaku\" originalmente no tenía connotación negativa relacionada con el anime.",
  "El festival Comiket de Tokio, dedicado al manga y fanzines, reúne a cientos de miles de personas.",
  "«Fullmetal Alchemist» tiene dos adaptaciones de anime con finales completamente distintos.",
  "Gainax, el estudio original de Evangelion, nació de un grupo de aficionados universitarios.",
  "«Spirited Away» fue la primera película de anime en ganar un Óscar.",
  "El character design de muchos animes clásicos se hacía primero en papel y luego se calcaba a mano.",
  "«JoJo's Bizarre Adventure» lleva publicándose desde 1987, con varias partes independientes.",
  "El anime «Slam Dunk» disparó la popularidad del baloncesto en Japón en los años 90.",
  "«Ghost in the Shell» influyó directamente en películas como Matrix.",
  "Muchas series de anime se basan en manga que siguen publicándose en paralelo.",
  "El estudio Kyoto Animation es conocido por su especial cuidado en la animación de fondos.",
  "«Pop Team Epic» es célebre por repetir cada episodio dos veces con doblajes distintos.",
  "«Steins;Gate» está parcialmente inspirado en teorías reales sobre viajes en el tiempo.",
  "El anime «Chibi Maruko-chan» se sigue emitiendo semanalmente en Japón desde 1990.",
  "«Violet Evergarden» usa cartas escritas a mano como hilo conductor de toda la serie.",
  "Muchos estudios japoneses producen varias series a la vez con equipos compartidos.",
  "«Cardcaptor Sakura» ayudó a definir el estándar del género mahou shoujo en los 90.",
  "El anime «Berserk» ha tenido varias adaptaciones debido a lo extenso del manga original.",
  "«Made in Abyss» combina estética infantil con una historia notablemente oscura.",
  "El estudio Bones fue fundado en 1998 por ex-empleados de Sunrise.",
  "«Demon Slayer» popularizó el uso de animación digital 3D combinada con dibujo tradicional.",
  "En Japón existen cafés temáticos dedicados a series de anime concretas.",
  "«Your Name» se convirtió en una de las películas de anime más taquilleras de la historia.",
  "El anime «Lupin III» lleva en emisión, con distintas series, desde 1971.",
  "Muchas voces de personajes icónicos las interpreta el mismo actor durante décadas.",
  "«Mob Psycho 100» y «One Punch Man» son obra del mismo autor, ONE.",
];

export function pickTrivia(seed: number): string {
  return ANIME_TRIVIA[seed % ANIME_TRIVIA.length];
}

/** Devuelve los índices de todas las curiosidades en un orden aleatorio distinto cada vez. */
export function shuffledTriviaOrder(): number[] {
  const order = ANIME_TRIVIA.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
