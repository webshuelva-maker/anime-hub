/**
 * Los géneros vienen de AniList y MyAnimeList, que los publican siempre
 * en inglés. Enseñarle "Slice of Life" a alguien que abre una app en
 * español no aporta nada, así que se traducen para mostrarlos.
 *
 * Solo se traduce lo que se ENSEÑA. Por dentro se siguen guardando en
 * inglés, que es como llegan de las fuentes: si se tradujeran al
 * guardarlos, la afinidad acumulada hasta ahora dejaría de coincidir.
 */
const GENRE_ES: Record<string, string> = {
  Action: "Acción",
  Adventure: "Aventura",
  Comedy: "Comedia",
  Drama: "Drama",
  Ecchi: "Ecchi",
  Fantasy: "Fantasía",
  Hentai: "Hentai",
  Horror: "Terror",
  "Mahou Shoujo": "Chica mágica",
  Mecha: "Mecha",
  Music: "Música",
  Mystery: "Misterio",
  Psychological: "Psicológico",
  Romance: "Romance",
  "Sci-Fi": "Ciencia ficción",
  "Slice of Life": "Vida cotidiana",
  Sports: "Deportes",
  Supernatural: "Sobrenatural",
  Thriller: "Suspense",
  // Etiquetas que llegan de MyAnimeList y no están en AniList
  "Avant Garde": "Vanguardia",
  "Award Winning": "Premiado",
  "Boys Love": "Boys love",
  "Girls Love": "Girls love",
  Gourmet: "Gastronomía",
  Erotica: "Erótico",
  Suspense: "Suspense",
};

export function genreLabel(genre: string): string {
  return GENRE_ES[genre] ?? genre;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Camino inverso: de lo que escribe una persona ("romance", "ciencia
 * ficción", "terror") al nombre con el que ese género llega de AniList y
 * MyAnimeList, que es el que se guarda.
 *
 * Hace falta porque el asistente recibe los gustos en español y la
 * afinidad se acumula en inglés: sin esta traducción, decirle "me gusta
 * el romance" habría creado un género nuevo llamado "romance" que no
 * coincide con nada de lo que traen las noticias, y no habría servido de
 * nada. Devuelve null si no reconoce el género, para no inventarse uno.
 */
export function canonicalGenre(entrada: string): string | null {
  const objetivo = normalizar(entrada);
  if (!objetivo) return null;

  for (const [ingles, español] of Object.entries(GENRE_ES)) {
    if (normalizar(ingles) === objetivo || normalizar(español) === objetivo) return ingles;
  }

  // Formas sueltas que la gente usa y que no son el nombre exacto.
  const ALIAS: Record<string, string> = {
    cienciaficcion: "Sci-Fi",
    scifi: "Sci-Fi",
    romantico: "Romance",
    romanticos: "Romance",
    romances: "Romance",
    miedo: "Horror",
    terrorifico: "Horror",
    comico: "Comedy",
    comedias: "Comedy",
    accion: "Action",
    aventuras: "Adventure",
    deporte: "Sports",
    musical: "Music",
    magia: "Fantasy",
    fantastico: "Fantasy",
    psicologico: "Psychological",
    sobrenaturales: "Supernatural",
    slicelife: "Slice of Life",
    vidacotidiana: "Slice of Life",
    recuentosdelavida: "Slice of Life",
  };
  return ALIAS[objetivo] ?? null;
}
