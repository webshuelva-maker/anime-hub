import { getNewsItems } from "./newsStore";
import { getPreferences, savePreferences } from "./storage";
import { toggleLike } from "./learning";

export interface AssistantAction {
  type: "add_favorite" | "like_news";
  value: string;
  result: string; // texto corto de confirmación para mostrar en el chat
}

const ACTION_PATTERN = /\[\[ACTION:(add_favorite|like_news):([^\]]+)\]\]/g;

/**
 * Separa el texto visible de las etiquetas de acción que Ren puede incluir
 * al final de su respuesta (definidas en el prompt del sistema), y ejecuta
 * cada acción de verdad sobre las preferencias guardadas en localStorage.
 */
export function parseAndRunActions(rawText: string): {
  cleanText: string;
  actions: AssistantAction[];
} {
  const actions: AssistantAction[] = [];

  const cleanText = rawText
    .replace(ACTION_PATTERN, (_match, type: string, rawValue: string) => {
      const value = rawValue.trim();
      const result = runAction(type as AssistantAction["type"], value);
      if (result) actions.push({ type: type as AssistantAction["type"], value, result });
      return "";
    })
    .trim();

  return { cleanText, actions };
}

function runAction(type: AssistantAction["type"], value: string): string | null {
  if (!value) return null;
  const prefs = getPreferences();

  if (type === "add_favorite") {
    if (prefs.favoriteTitles.some((t) => t.toLowerCase() === value.toLowerCase())) {
      return `"${value}" ya estaba en tus favoritos.`;
    }
    savePreferences({ ...prefs, favoriteTitles: [...prefs.favoriteTitles, value] });
    return `Añadido a tus animes favoritos: ${value}`;
  }

  if (type === "like_news") {
    const item = getNewsItems().find((n) => n.relatedTitle.toLowerCase().includes(value.toLowerCase()));
    if (!item) return `No encontré ninguna noticia sobre "${value}" en el feed actual.`;
    const nowLiked = toggleLike(item);
    return nowLiked
      ? `Me gusta añadido a: ${item.title}`
      : `Me gusta quitado de: ${item.title}`;
  }

  return null;
}
