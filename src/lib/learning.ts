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

function applyBoost(prefs: UserPreferences, item: NewsItem, weight: number): void {
  const genreCounts = { ...prefs.genreInteractionCounts };
  const studioCounts = { ...prefs.studioInteractionCounts };

  item.genres.forEach((g) => {
    genreCounts[g] = (genreCounts[g] ?? 0) + weight;
  });
  item.studios.forEach((s) => {
    studioCounts[s] = (studioCounts[s] ?? 0) + weight;
  });

  savePreferences({
    ...prefs,
    genreInteractionCounts: genreCounts,
    studioInteractionCounts: studioCounts,
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
    score += 6;
  }

  item.genres.forEach((g) => {
    score += prefs.genreInteractionCounts[g] ?? 0;
  });
  item.studios.forEach((s) => {
    score += prefs.studioInteractionCounts[s] ?? 0;
  });

  // Preferencias explícitas del cuestionario antiguo (si el usuario las
  // rellenó alguna vez en Preferencias) siguen contando, pero poco: son la
  // señal más débil frente a lo que de verdad haces en el feed.
  score += item.genres.filter((g) => prefs.genres.includes(g)).length * 0.5;
  score += item.studios.filter((s) => prefs.studios.includes(s)).length * 0.5;

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
