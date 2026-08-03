import { NewsItem, UserPreferences } from "@/types/news";
import { getPreferences, savePreferences } from "./storage";

/**
 * Señal débil: el usuario pinchó en "ver fuente". Suma un poco a los
 * géneros/estudios de esa noticia.
 */
export function recordNewsInteraction(item: NewsItem): void {
  const prefs = getPreferences();
  applyBoost(prefs, item, 1);
}

/**
 * Señal fuerte: el usuario le dio a "me gusta". Cuenta mucho más que un
 * simple clic, y además marca la noticia como favorita para no perder el
 * estado si vuelve a entrar.
 */
export function toggleLike(item: NewsItem): boolean {
  const prefs = getPreferences();
  const isLiked = prefs.likedNewsIds.includes(item.id);

  const likedNewsIds = isLiked
    ? prefs.likedNewsIds.filter((id) => id !== item.id)
    : [...prefs.likedNewsIds, item.id];

  const next = { ...prefs, likedNewsIds };
  savePreferences(next);

  if (!isLiked) {
    applyBoost(next, item, 4);
  }

  return !isLiked;
}

/**
 * Añade un título a la lista de ejemplos de una categoría, sin repetir y
 * quedándose con los tres últimos. Sirve para poder explicar la afinidad
 * en cristiano: nadie sabe quién es "Bones", pero sí sabe que ha visto
 * Mob Psycho.
 */
function addExample(map: Record<string, string[]>, key: string, title: string): void {
  if (!title) return;
  const current = map[key] ?? [];
  if (current.some((t) => t.toLowerCase() === title.toLowerCase())) return;
  map[key] = [title, ...current].slice(0, 3);
}

function applyBoost(prefs: UserPreferences, item: NewsItem, weight: number): void {
  const genreCounts = { ...prefs.genreInteractionCounts };
  const studioCounts = { ...prefs.studioInteractionCounts };
  const genreExamples = { ...(prefs.genreExamples ?? {}) };
  const studioExamples = { ...(prefs.studioExamples ?? {}) };

  item.genres.forEach((g) => {
    genreCounts[g] = (genreCounts[g] ?? 0) + weight;
    addExample(genreExamples, g, item.relatedTitle);
  });
  item.studios.forEach((s) => {
    studioCounts[s] = (studioCounts[s] ?? 0) + weight;
    addExample(studioExamples, s, item.relatedTitle);
  });

  savePreferences({
    ...prefs,
    genreInteractionCounts: genreCounts,
    studioInteractionCounts: studioCounts,
    genreExamples,
    studioExamples,
  });
}

/**
 * Registra un término que el usuario ha buscado (con autocompletado o
 * pulsando Enter). No hace falta que dé "me gusta" a nada: buscar un anime
 * ya es una señal de que le interesa, así que refuerza el feed solo.
 */
export function recordSearch(term: string): void {
  const clean = term.trim();
  if (clean.length < 2) return;
  const prefs = getPreferences();
  const withoutDupe = prefs.searchHistory.filter((t) => t.toLowerCase() !== clean.toLowerCase());
  const searchHistory = [clean, ...withoutDupe].slice(0, 20);
  savePreferences({ ...prefs, searchHistory });
}

/**
 * Refuerza solo géneros y estudios, sin tocar títulos ni historial. Se
 * usa cuando el título ya se registró antes (al leer la etiqueta de Ren)
 * y AniList responde después con la ficha — así no se cuenta dos veces
 * el mismo título.
 */
export function boostCategories(
  genres: string[],
  studios: string[],
  weight = 2,
  fromTitle = ""
): void {
  if (genres.length === 0 && studios.length === 0) return;
  const prefs = getPreferences();

  const genreCounts = { ...prefs.genreInteractionCounts };
  const genreExamples = { ...(prefs.genreExamples ?? {}) };
  genres.forEach((g) => {
    genreCounts[g] = (genreCounts[g] ?? 0) + weight;
    addExample(genreExamples, g, fromTitle);
  });

  const studioCounts = { ...prefs.studioInteractionCounts };
  const studioExamples = { ...(prefs.studioExamples ?? {}) };
  studios.forEach((s) => {
    studioCounts[s] = (studioCounts[s] ?? 0) + weight;
    addExample(studioExamples, s, fromTitle);
  });

  savePreferences({
    ...prefs,
    genreInteractionCounts: genreCounts,
    studioInteractionCounts: studioCounts,
    genreExamples,
    studioExamples,
  });
}

/**
 * Señal que viene de hablar con Ren: preguntar por una serie ya es
 * interés, aunque el usuario no diga en ningún momento que le gusta ni
 * marque nada. Pesa más que un clic suelto (1) y menos que un "me gusta"
 * explícito (4), porque preguntar no siempre es querer.
 *
 * Refuerza tres cosas a la vez, en una sola escritura para no pisarse a
 * sí misma: los géneros y estudios de esa serie (que es lo que de verdad
 * reordena el feed), el contador propio del título, y el historial de
 * búsqueda (que ya suma puntos a las noticias de ese título).
 */
export function recordAnimeInterest(
  title: string,
  genres: string[] = [],
  studios: string[] = []
): void {
  const clean = title.trim();
  if (clean.length < 2) return;

  const prefs = getPreferences();
  const WEIGHT = 2;

  const genreCounts = { ...prefs.genreInteractionCounts };
  const genreExamples = { ...(prefs.genreExamples ?? {}) };
  genres.forEach((g) => {
    genreCounts[g] = (genreCounts[g] ?? 0) + WEIGHT;
    addExample(genreExamples, g, clean);
  });

  const studioCounts = { ...prefs.studioInteractionCounts };
  const studioExamples = { ...(prefs.studioExamples ?? {}) };
  studios.forEach((s) => {
    studioCounts[s] = (studioCounts[s] ?? 0) + WEIGHT;
    addExample(studioExamples, s, clean);
  });

  const titleCounts = { ...prefs.titleInterestCounts };
  const existingKey = Object.keys(titleCounts).find(
    (k) => k.toLowerCase() === clean.toLowerCase()
  );
  const key = existingKey ?? clean;
  titleCounts[key] = (titleCounts[key] ?? 0) + 1;

  const withoutDupe = prefs.searchHistory.filter((t) => t.toLowerCase() !== clean.toLowerCase());
  const searchHistory = [clean, ...withoutDupe].slice(0, 20);

  savePreferences({
    ...prefs,
    genreInteractionCounts: genreCounts,
    studioInteractionCounts: studioCounts,
    genreExamples,
    studioExamples,
    titleInterestCounts: titleCounts,
    searchHistory,
  });
}

/** Quita una serie de la lista de seguidas (con la ✕ en Tus gustos). */
export function removeAnimeInterest(title: string): void {
  const prefs = getPreferences();
  const titleCounts = { ...prefs.titleInterestCounts };
  delete titleCounts[title];

  savePreferences({
    ...prefs,
    titleInterestCounts: titleCounts,
    searchHistory: prefs.searchHistory.filter((t) => t.toLowerCase() !== title.toLowerCase()),
  });
}

/**
 * Puntuación de afinidad de una noticia para el usuario. Ya no depende de
 * un cuestionario: se basa por completo en lo que ha dado "me gusta" o
 * clicado antes. Los animes favoritos escritos a mano (opcional, en el
 * perfil) siguen sumando el máximo peso si los ha rellenado.
 */
export function scoreNewsItem(item: NewsItem, prefs: UserPreferences): number {
  let score = 0;

  if (prefs.likedNewsIds.includes(item.id)) score += 100; // ya lo marcó, siempre arriba

  if (
    prefs.favoriteTitles.some((title) =>
      item.relatedTitle.toLowerCase().includes(title.toLowerCase())
    )
  ) {
    // Un favorito es una petición explícita ("quiero ver noticias de
    // esto"), así que tiene que ganar a cualquier afinidad acumulada por
    // el camino. Antes valía 6, lo mismo que tres visitas sueltas, y se
    // quedaba enterrado.
    score += 40;
  }

  if (
    prefs.searchHistory.some((term) =>
      item.relatedTitle.toLowerCase().includes(term.toLowerCase())
    )
  ) {
    score += 3;
  }

  // Series por las que ha preguntado a Ren: cuantas más veces vuelve a
  // ellas, más arriba salen sus noticias.
  Object.entries(prefs.titleInterestCounts ?? {}).forEach(([title, count]) => {
    if (item.relatedTitle.toLowerCase().includes(title.toLowerCase())) {
      score += count * 2;
    }
  });

  item.genres.forEach((g) => {
    score += prefs.genreInteractionCounts[g] ?? 0;
  });
  item.studios.forEach((s) => {
    score += prefs.studioInteractionCounts[s] ?? 0;
  });

  // Preferencias explícitas del cuestionario antiguo (si el usuario las
  // rellenó alguna vez en Preferencias) siguen contando, pero poco: son la
  // señal más débil frente a lo que de verdad haces en el feed.
  // Géneros y estudios que ha pedido expresamente (en el cuestionario o
  // diciéndoselo al asistente). Antes valían 0,5 — tan poco que decir "me
  // encanta el romance" no cambiaba nada en el feed.
  score += item.genres.filter((g) => prefs.genres.includes(g)).length * 3;
  score += item.studios.filter((s) => prefs.studios.includes(s)).length * 3;

  // Popularidad (de AniList) como desempate para usuarios nuevos: si
  // todavía no sabemos casi nada de sus gustos, se prioriza lo conocido
  // sobre lo desconocido — así la primera impresión no es una lista de
  // animes que nadie reconoce. En cuanto hay señales reales de afinidad
  // (géneros/estudios reforzados con el uso, "me gusta", favoritos), su
  // peso baja hasta casi desaparecer: lo que de verdad le gusta al
  // usuario manda por encima de lo famoso que sea.
  const totalAffinitySignal =
    Object.values(prefs.genreInteractionCounts).reduce((a, b) => a + b, 0) +
    Object.values(prefs.studioInteractionCounts).reduce((a, b) => a + b, 0) +
    prefs.likedNewsIds.length * 3 +
    prefs.favoriteTitles.length * 3;
  const COLD_START_THRESHOLD = 15; // a partir de aquí, la popularidad casi no pesa ya
  const popularityWeight = Math.max(0, 1 - totalAffinitySignal / COLD_START_THRESHOLD);
  if (typeof item.popularity === "number" && item.popularity > 0 && popularityWeight > 0) {
    /*
     * Se normaliza en una escala de 0 a 1 (400.000 seguidores en AniList
     * es aproximadamente el techo: One Piece, Attack on Titan) y se
     * multiplica por 25.
     *
     * Antes esto valía como mucho 8 puntos, y encima el dato casi nunca
     * llegaba a tiempo de ordenar. Con 25, sin ninguna preferencia
     * todavía, las series conocidas suben claramente por encima de las
     * desconocidas — que es lo que hace que el primer feed no sea una
     * lista de títulos que nadie reconoce.
     *
     * Sigue por debajo de un favorito (40) y muy por debajo de un "me
     * gusta" (100): en cuanto el usuario expresa un gusto, lo suyo manda
     * sobre lo famoso, aunque sea una serie que no conoce nadie.
     */
    // Raíz cuadrada y no logaritmo: el logaritmo aplasta tanto la escala
    // que una serie con 500 seguidores sacaba casi la mitad de puntos que
    // One Piece, y entonces el orden apenas cambiaba. Con la raíz, lo
    // desconocido saca migajas y lo muy conocido saca el máximo.
    const escala = Math.min(1, Math.sqrt(item.popularity / 150000));
    score += escala * popularityWeight * 25;
  }

  return score;
}

/** Los N géneros/estudios que más ha reforzado el usuario con su uso real. */
export function getTopAffinities(
  counts: Record<string, number>,
  limit = 5
): { name: string; count: number }[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}
