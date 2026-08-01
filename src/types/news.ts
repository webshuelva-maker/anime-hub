export type Reliability = "official" | "confirmed" | "rumor";

export type Platform =
  | "Crunchyroll"
  | "Netflix"
  | "Prime Video"
  | "HBO Max"
  | "Disney+"
  | "AnimeBox"
  | "Anime Onegai"
  | "Wakanim"
  | "Bilibili"
  | "Muse Asia"
  | "Laftel";

export type NewsCategory =
  | "estreno"
  | "temporada-nueva"
  | "pelicula"
  | "doblaje"
  | "evento"
  | "adaptacion";

export type Prominence = "mainstream" | "indie"; // gran franquicia vs. producción pequeña/independiente

export interface NewsSource {
  platform: string;
  url: string;
  label: string; // ej: "Ver en Crunchyroll Newsroom"
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  body: string; // texto completo para leer la noticia en detalle dentro de la app
  imageQuery: string; // usado para generar/seleccionar imagen de portada
  coverImageUrl?: string; // carátula oficial real (vía API de AniList), si se encontró
  reliability: Reliability;
  category: NewsCategory;
  genres: string[];
  studios: string[];
  publishedAt: string; // ISO date
  source: NewsSource;
  relatedTitle: string; // anime al que se refiere la noticia
  crossConfirmedBy?: Platform[]; // si varias fuentes confirman lo mismo
  prominence: Prominence;
  popularity?: number; // de AniList — cuánta gente tiene el título en su lista, usado para priorizar animes conocidos con usuarios nuevos
}

export interface UserPreferences {
  genres: string[];
  studios: string[];
  platforms: Platform[];
  customPlatforms: string[]; // plataformas escritas libremente por el usuario
  favoriteTitles: string[]; // animes favoritos, escritos libremente
  contentFormat: "sub" | "dub" | "ambos";
  onboardingCompleted: boolean;
  digestTime: string; // "08:00"
  spoilerFreeMode: boolean;
  displayName: string;
  avatarId: string;
  avatarPhotoDataUrl: string | null; // foto propia subida por el usuario, sustituye al emblema
  genreInteractionCounts: Record<string, number>; // aprendizaje implícito: clics por género
  studioInteractionCounts: Record<string, number>; // aprendizaje implícito: clics por estudio
  likedNewsIds: string[]; // noticias marcadas con "me gusta": la señal más fuerte de aprendizaje
  searchHistory: string[]; // términos buscados, para reforzar el feed sin que el usuario tenga que marcar nada
  soundEnabled: boolean; // sonidos de interfaz (clics, confirmaciones, etc.)
}
