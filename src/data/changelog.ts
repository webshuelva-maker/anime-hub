/**
 * Registro de novedades.
 *
 * Escrito PARA QUIEN USA LA APP, no para quien la programa. Nada de
 * "refactor del extractor de artículos": lo que se cuenta es qué nota la
 * persona al abrirla. Si un cambio no se nota, no aparece aquí.
 *
 * Para añadir una entrada nueva: se pone arriba del todo, con su fecha y
 * su versión. El punto de "hay novedades" del menú lo calcula solo
 * comparando la versión más reciente de esta lista con la última que el
 * usuario ha visto (se guarda en sus preferencias).
 */

export interface EntradaNovedades {
  version: string;
  fecha: string; // AAAA-MM-DD
  titulo: string;
  /** Lo que cambia, contado en una línea cada cosa. */
  puntos: string[];
  /** Opcional: una frase de contexto antes de la lista. */
  intro?: string;
}

export const NOVEDADES: EntradaNovedades[] = [
  {
    version: "v109",
    fecha: "2026-08-02",
    titulo: "Entrada nueva y esta misma pantalla",
    intro: "La app ahora se presenta al abrirse, y por fin puedes ver qué ha ido cambiando.",
    puntos: [
      "Animación de entrada al abrir la app, con el emblema y el nombre.",
      "Mientras se ve esa entrada, las noticias ya se están descargando por detrás: no es tiempo perdido.",
      "Esta pantalla de novedades, con un punto en el menú cuando hay algo sin leer.",
    ],
  },
  {
    version: "v107 – v108",
    fecha: "2026-08-02",
    titulo: "Gestos de móvil",
    puntos: [
      "Tira hacia abajo en las noticias para actualizar, con el emblema girando y vibración al soltar.",
      "El móvil vibra suavemente al cambiar de sección, al dar ♡ y al cerrar una noticia.",
      "Arreglado un fallo por el que algunas noticias mostraban una lista de comentarios en vez del artículo.",
      "Quitado el parpadeo blanco que se veía al abrir la app.",
    ],
  },
  {
    version: "v105 – v106",
    fecha: "2026-08-02",
    titulo: "La app, pensada para el móvil",
    intro: "Todo lo importante ha bajado a donde llega el pulgar.",
    puntos: [
      "Barra de navegación abajo, translúcida, con las secciones y tu perfil.",
      "Las noticias se abren como una hoja que sube desde abajo y se cierra arrastrándola.",
      "Botones más grandes para no fallar al pulsar.",
      "Ren se ha recolocado para no taparse con la barra.",
    ],
  },
  {
    version: "v91 – v94",
    fecha: "2026-08-01",
    titulo: "Tu cuenta te sigue a todas partes",
    puntos: [
      "Lo que la app aprende de ti y lo que Ren recuerda se sincronizan entre tus dispositivos.",
      "Nueva sección Conectar, para conocer gente con gustos parecidos (solo mayores de 18).",
      "Términos de uso, privacidad y normas de convivencia, accesibles desde cualquier página.",
      "Ren puede llevarte a cualquier sección con un botón.",
    ],
  },
  {
    version: "v88 – v90",
    fecha: "2026-08-01",
    titulo: "Ren, más rápido y más claro",
    puntos: [
      "Ren responde mucho antes: ya no espera a que termine lo que la app esté haciendo por detrás.",
      "Sus respuestas van ordenadas: primero la respuesta, luego lo confirmado y lo que solo se rumorea.",
      "Arriba puedes ver qué está haciendo en cada momento mientras busca.",
      "Nueva imagen para Ren y sonidos mucho más suaves.",
      "Ren sabe decir que no a lo que no toca, sin ponerse pesado.",
    ],
  },
  {
    version: "v81 – v87",
    fecha: "2026-07-31",
    titulo: "Ren busca de verdad en internet",
    intro:
      "El cambio más grande hasta ahora: si le preguntas por una fecha o por un rumor, sale a mirarlo.",
    puntos: [
      "Busca en medios, en las bases de datos de AniList y MyAnimeList, y también en foros y redes.",
      "Separa siempre lo confirmado oficialmente de lo que solo se rumorea.",
      "Si no encuentra nada fiable, lo dice, en vez de inventárselo.",
      "Preguntar por una serie hace que sus noticias te salgan antes en el feed.",
    ],
  },
  {
    version: "Antes de v81",
    fecha: "2026-07-28",
    titulo: "Lo que ya había",
    puntos: [
      "Noticias reales de varias fuentes, traducidas al español y ordenadas según lo que te gusta.",
      "Cuenta propia, perfil con avatar y lista de favoritos.",
      "Ren, el asistente, con memoria de vuestras conversaciones.",
    ],
  },
];

/** La versión más reciente publicada, para saber si hay algo sin leer. */
export const ULTIMA_VERSION = NOVEDADES[0]?.version ?? "";
