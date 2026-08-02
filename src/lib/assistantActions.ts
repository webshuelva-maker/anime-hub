import { getNewsItems } from "./newsStore";
import { getPreferences, savePreferences } from "./storage";
import { toggleLike } from "./learning";
import { addRenMemory } from "./renMemory";

export interface AssistantAction {
  type: "add_favorite" | "like_news" | "interes" | "remember" | "ir_a";
  value: string;
  result: string; // texto corto de confirmación para mostrar en el chat
}

/** Un sitio de la app al que Ren puede ofrecer llevarte. */
export interface AssistantLink {
  label: string;
  href: string;
}

/**
 * Secciones a las que Ren puede mandar. La lista es cerrada a propósito:
 * si el modelo se inventa una ruta, el enlace no se crea y no pasa nada,
 * en vez de llevar al usuario a una página que no existe.
 */
const SECTIONS: Record<string, AssistantLink> = {
  noticias: { label: "Ir a Noticias", href: "/noticias" },
  conectar: { label: "Abrir Conectar", href: "/conectar" },
  gustos: { label: "Ver tus gustos", href: "/preferencias" },
  ajustes: { label: "Abrir Ajustes", href: "/ajustes" },
  perfil: { label: "Abrir tu perfil", href: "/perfil" },
  novedades: { label: "Ver las novedades", href: "/novedades" },
  terminos: { label: "Leer los términos de uso", href: "/legal/terminos" },
  privacidad: { label: "Leer la política de privacidad", href: "/legal/privacidad" },
  normas: { label: "Leer las normas de convivencia", href: "/legal/normas" },
};

const ACTION_PATTERN = /\[\[ACTION:(add_favorite|like_news|interes|remember|ir_a):([^\]]+)\]\]/g;

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
  /** Botones para ir a una sección, si Ren ha ofrecido llevarte. */
  links: AssistantLink[];
} {
  const actions: AssistantAction[] = [];
  const interests: string[] = [];
  const links: AssistantLink[] = [];

  const cleanText = rawText
    .replace(ACTION_PATTERN, (_match, type: string, rawValue: string) => {
      const value = rawValue.trim();
      if (type === "interes" && value) interests.push(value);

      if (type === "ir_a") {
        const section = SECTIONS[value.toLowerCase().trim()];
        if (section && !links.some((l) => l.href === section.href)) links.push(section);
        return "";
      }
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

  return { cleanText: safeText, actions, interests, links };
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
    // NO se registra nada aquí. Antes se guardaba el título tal cual y
    // bastaba con preguntar "¿qué es Valorant?" para que un videojuego
    // acabara en la lista de series que sigues. Ahora el cliente
    // comprueba primero contra AniList que eso existe y es un anime, y
    // solo entonces lo apunta (ver AssistantOrb).
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
