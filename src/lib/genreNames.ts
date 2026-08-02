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
