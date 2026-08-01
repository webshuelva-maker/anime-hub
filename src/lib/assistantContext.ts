import { UserPreferences } from "@/types/news";
import { getNewsItems } from "./newsStore";
import { getTopAffinities } from "./learning";
import { getRenMemory } from "./renMemory";

export function buildAssistantContext(prefs: UserPreferences): string {
  const newsItems = getNewsItems();
  const lines: string[] = [];

  lines.push(`Nombre del usuario: ${prefs.displayName || "no lo ha dicho todavía"}`);

  const memories = getRenMemory();
  if (memories.length > 0) {
    lines.push(`Cosas que recuerdas de conversaciones anteriores con este usuario (úsalas con naturalidad, sin repetirlas todas de golpe ni decir explícitamente "recuerdo que dijiste"):\n${memories.map((m) => `- ${m}`).join("\n")}`);
  }

  const topGenres = getTopAffinities(prefs.genreInteractionCounts, 4).map((g) => g.name);
  const topStudios = getTopAffinities(prefs.studioInteractionCounts, 3).map((s) => s.name);
  if (topGenres.length > 0) lines.push(`Géneros que más le enganchan: ${topGenres.join(", ")}`);
  if (topStudios.length > 0) lines.push(`Estudios que sigue de cerca: ${topStudios.join(", ")}`);
  if (prefs.favoriteTitles.length > 0) {
    lines.push(`Animes favoritos que ha marcado: ${prefs.favoriteTitles.join(", ")}`);
  }
  if (prefs.platforms.length > 0 || prefs.customPlatforms.length > 0) {
    lines.push(
      `Plataformas que usa: ${[...prefs.platforms, ...prefs.customPlatforms].join(", ")}`
    );
  }

  const likedTitles = newsItems.filter((n) => prefs.likedNewsIds.includes(n.id)).map(
    (n) => n.relatedTitle
  );
  if (likedTitles.length > 0) {
    lines.push(`Noticias a las que ha dado me gusta: ${likedTitles.join(", ")}`);
  }

  const recentHeadlines = newsItems.slice(0, 8).map(
    (n) => `- "${n.title}" (${n.relatedTitle}, fuente: ${n.source.platform}, fiabilidad: ${n.reliability})`
  );
  lines.push(`Titulares disponibles ahora mismo en el feed:\n${recentHeadlines.join("\n")}`);

  return lines.join("\n");
}
