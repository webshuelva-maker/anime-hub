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
  popularity?: number;
  /** Id de la obra en AniList: sirve para detectar la misma noticia publicada con el título japonés y el internacional. */
  anilistId?: number;
  /** Título original en romaji: identifica la obra aunque el anime y el manga tengan fichas distintas. */
  tituloCanonico?: string; // de AniList — cuánta gente tiene el título en su lista, usado para priorizar animes conocidos con usuarios nuevos
  language?: "en" | "es"; // "es" = ya viene en español (fuentes españolas), no hace falta traducirlo
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
  titleInterestCounts: Record<string, number>; // series por las que ha preguntado a Ren: preguntar ya cuenta como interés
  genreExamples: Record<string, string[]>; // de qué series le viene cada género, para poder explicárselo
  studioExamples: Record<string, string[]>;
  updatedAt: string | null;
  lastSeenChangelog: string | null; // última versión de novedades que ha visto, para el punto del menú
  acceptedLegalAt: string | null; // cuándo aceptó los términos, normas y privacidad
  acceptedLegalVersion: string | null; // qué versión aceptó — es lo que sirve de prueba // último cambio del usuario, para sincronizar entre dispositivos // de qué series le viene cada estudio ("no sabes quién es MAPPA, pero has visto esto")
  searchHistory: string[]; // términos buscados, para reforzar el feed sin que el usuario tenga que marcar nada
  soundEnabled: boolean; // sonidos de interfaz (clics, confirmaciones, etc.)
}
