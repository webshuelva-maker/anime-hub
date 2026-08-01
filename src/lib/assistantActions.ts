import { getNewsItems } from "./newsStore";
import { getPreferences, savePreferences } from "./storage";
import { toggleLike, recordAnimeInterest } from "./learning";
import { addRenMemory } from "./renMemory";

export interface AssistantAction {
  type: "add_favorite" | "like_news" | "interes" | "remember";
  value: string;
  result: string; // texto corto de confirmación para mostrar en el chat
}

const ACTION_PATTERN = /\[\[ACTION:(add_favorite|like_news|interes|remember):([^\]]+)\]\]/g;

/**
 * Separa el texto visible de las etiquetas de acción que Ren puede incluir
 * al final de su respuesta (definidas en el prompt del sistema), y ejecuta
 * cada acción de verdad sobre las preferencias guardadas en localStorage.
 */
export function parseAndRunActions(rawText: string): {
  cleanText: string;
  actions: AssistantAction[];
  /** Series que Ren ha detectado como "le interesa": el cliente las
   *  completa después con géneros y estudio para reforzar la afinidad. */
  interests: string[];
} {
  const actions: AssistantAction[] = [];
  const interests: string[] = [];

  const cleanText = rawText
    .replace(ACTION_PATTERN, (_match, type: string, rawValue: string) => {
      const value = rawValue.trim();
      if (type === "interes" && value) interests.push(value);
      const result = runAction(type as AssistantAction["type"], value);
      if (result) actions.push({ type: type as AssistantAction["type"], value, result });
      return "";
    })
    .trim();

  // Red de seguridad: si el modelo escribe una etiqueta con un nombre de
  // acción que no conocemos, o se equivoca al escribirla, el patrón de
  // arriba no la reconoce y el usuario acabaría LEYENDO "[[ACTION:...]]"
  // en mitad de la respuesta. Aquí se borra cualquier cosa entre dobles
  // corchetes que haya sobrevivido, sea lo que sea.
  const safeText = cleanText
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleanText: safeText, actions, interests };
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

  if (type === "interes") {
    // Se aplica ya la parte que no necesita red (título + historial); los
    // géneros y el estudio los añade el cliente en cuanto AniList
    // responde. Sin confirmación visible: que la app aprenda de ti no
    // debería interrumpir la conversación con un aviso cada vez.
    recordAnimeInterest(value);
    return null;
  }

  if (type === "remember") {
    // Nunca se guarda un supuesto nombre del usuario. Si el modelo se
    // inventa uno una vez y se archiva, queda grabado para siempre y
    // vuelve en cada conversación como si fuera un dato real. El nombre
    // solo puede venir del perfil, que lo escribe el propio usuario.
    if (/\b(se\s+llama|su\s+nombre|el\s+usuario\s+es\s+[A-ZÁÉÍÓÚÑ])/i.test(value)) {
      return null;
    }

    addRenMemory(value);
    // Sin confirmación visible en el chat — recordar algo no debería
    // interrumpir la conversación con un mensaje de sistema cada vez,
    // se nota solo en que Ren lo tiene en cuenta más adelante.
    return null;
  }

  return null;
}
