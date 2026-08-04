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
    version: "v146",
    fecha: "2026-08-03",
    titulo: "Iris a prueba de cambios",
    puntos: [
      "El motor de Iris se actualiza solo cuando salen modelos nuevos, en vez de romperse cuando retiran los viejos.",
    ],
  },
  {
    version: "v145",
    fecha: "2026-08-03",
    titulo: "Ajuste del motor de Iris",
    puntos: [
      "Iris ya funciona con Gemini sin fallos por modelos retirados.",
    ],
  },
  {
    version: "v144",
    fecha: "2026-08-03",
    titulo: "Iris cambia de motor",
    puntos: [
      "La app puede funcionar con Gemini o con Groq, y se cambia de uno a otro sin tocar el código.",
    ],
  },
  {
    version: "v143",
    fecha: "2026-08-03",
    titulo: "Iris contesta al momento",
    puntos: [
      "Saludar o charlar con Iris ya no tarda diez segundos: usa el modelo rápido y se salta el análisis cuando no hay nada que investigar.",
    ],
  },
  {
    version: "v142",
    fecha: "2026-08-03",
    titulo: "Iris te avisa, y responde al instante",
    intro: "Dos mejoras al asistente que se notan desde el primer día.",
    puntos: [
      "Si hay novedades de una serie que sigues, Iris se asoma solo al entrar y te lo cuenta.",
      "Preguntar dos veces por lo mismo es ahora instantáneo: guarda lo que ya investigó durante tres horas.",
    ],
  },
  {
    version: "v141",
    fecha: "2026-08-03",
    titulo: "Iris con vía libre",
    puntos: [
      "Iris puede buscar en más sitios y explicarse más largo: la cuota que se iba en traducir es ahora suya.",
      "Cuando una búsqueda no tiene noticias, se te explica por qué y puedes seguir la serie desde ahí.",
    ],
  },
  {
    version: "v140",
    fecha: "2026-08-03",
    titulo: "El artículo entero, al instante",
    intro: "La mayoría de los medios ya mandan la noticia completa en su feed: ahora se aprovecha.",
    puntos: [
      "Las noticias se abren con el texto completo, sin esperas y sin el aviso de \"no se pudo cargar\".",
      "Fuera el cartel de \"cargando noticias en directo\" nada más terminar la pantalla de carga.",
      "Mientras cargan, se ven tarjetas con la forma real del contenido en vez de un punto parpadeando.",
    ],
  },
  {
    version: "v139",
    fecha: "2026-08-03",
    titulo: "Las noticias se leen enteras",
    intro: "Se acabaron los artículos que terminaban en puntos suspensivos.",
    puntos: [
      "El artículo completo se lee dentro de la app, sin tener que ir a la web original.",
      "Mejor lectura de las plantillas que usan los medios españoles.",
    ],
  },
  {
    version: "v138",
    fecha: "2026-08-03",
    titulo: "Tus plataformas mandan en el feed",
    puntos: [
      "Las noticias de series que puedes ver en tus plataformas suben en el feed.",
      "Arreglados los títulos que salían cortados sobre la carátula (\"Suikoden: The\").",
      "Cinco medios en español más y fuera las fuentes que no respondían.",
    ],
  },
  {
    version: "v137",
    fecha: "2026-08-03",
    titulo: "Los artículos se leen enteros",
    puntos: [
      "Arreglado el fallo por el que al abrir una noticia solo salía el resumen.",
      "Se acabaron los avisos de traducción en noticias que ya vienen en español.",
      "Seis medios en español más: Otaku Freaks, Deculture, ANMTV, Tarreo, Código Espagueti y Atomix.",
    ],
  },
  {
    version: "v136",
    fecha: "2026-08-03",
    titulo: "Todas las noticias en español",
    intro: "Se acabaron las noticias en inglés esperando traducción.",
    puntos: [
      "El feed lo forman ahora solo medios en español: Crunchyroll, Somos Kudasai, Ramen Para Dos, AnmoSugoi, Koi-Nya y Misión Tokyo.",
      "Más Hobby Consolas, Meristation, IGN España, Vandal, Vida Extra y 3DJuegos, filtrados a lo que es anime y manga.",
      "Las noticias salen al momento, sin esperar a que se traduzcan.",
    ],
  },
  {
    version: "v135",
    fecha: "2026-08-03",
    titulo: "Muchas más noticias en español",
    puntos: [
      "Arregladas las direcciones de Crunchyroll, Ramen Para Dos, Koi-Nya, Somos Kudasai, Misión Tokyo, Hobby Consolas y 3DJuegos.",
      "Cada fuente prueba varias direcciones hasta dar con la buena, así que dejan de morirse en silencio cuando un medio cambia su feed.",
    ],
  },
  {
    version: "v134",
    fecha: "2026-08-03",
    titulo: "Comprobador de fuentes",
    puntos: [
      "Una página nueva dice de un vistazo qué fuentes de noticias funcionan y cuáles no.",
    ],
  },
  {
    version: "v133",
    fecha: "2026-08-03",
    titulo: "Noticias en español, de muchas más fuentes",
    intro: "El feed pasa de 5 fuentes a más de 20, y la mayoría publican ya en español.",
    puntos: [
      "Crunchyroll en español, Ramen Para Dos, Koi-Nya, Somos Kudasai, Misión Tokyo y AnimeCL.",
      "Vandal, Meristation, Hobby Consolas, 3DJuegos, Vida Extra e IGN España, filtrados para que solo entre lo de anime.",
      "Siete fuentes internacionales dedicadas a rumores y filtraciones, marcadas como tales.",
      "Las noticias en español no se traducen: salen antes y la app gasta muchísimo menos.",
    ],
  },
  {
    version: "v132",
    fecha: "2026-08-03",
    titulo: "Buscador con carátulas y moderación de verdad",
    puntos: [
      "El buscador de noticias enseña la carátula, el formato y el año, como el de animes favoritos.",
      "Las carátulas ya no desaparecen al refrescarse el feed.",
      "Panel de moderación: se puede suspender por 1, 7 o 30 días, o expulsar de forma permanente, siempre con motivo y con historial.",
      "Quien esté sancionado ve una pantalla explicando el motivo y hasta cuándo.",
    ],
  },
  {
    version: "v131",
    fecha: "2026-08-03",
    titulo: "El feed vuelve a tener sentido",
    intro: "Tres arreglos en cómo se ordenan las noticias.",
    puntos: [
      "Las series conocidas ya no quedan enterradas: antes un género con mucho uso se llevaba tantos puntos que aplastaba todo lo demás.",
      "Las noticias recientes suben: lo de hoy va por delante de lo de hace dos semanas.",
      "Una noticia que marcaste con ♡ ya no se queda clavada arriba para siempre.",
      "Los ♡ que das en el móvil aparecen en el ordenador al volver a la pestaña, sin recargar.",
    ],
  },
  {
    version: "v119",
    fecha: "2026-08-02",
    titulo: "El feed reconoce mejor de qué serie habla cada noticia",
    puntos: [
      "Antes se buscaba la serie usando el titular entero, así que casi ninguna noticia se identificaba bien. Ahora se extrae el nombre real de la obra.",
      "Los artículos ya guardados también se reparten en párrafos al abrirlos.",
    ],
  },
  {
    version: "v117",
    fecha: "2026-08-02",
    titulo: "Feed con más cabeza y artículos legibles",
    puntos: [
      "Si todavía no sabemos qué te gusta, ahora salen primero las series conocidas en vez de títulos que no reconoce nadie.",
      "Y cuando dos noticias te encajan igual, gana la de la serie que reconoces.",
      "Los artículos traducidos llegan repartidos en párrafos, no en un bloque de texto.",
    ],
  },
  {
    version: "v116",
    fecha: "2026-08-02",
    titulo: "Salida limpia de la pantalla de carga",
    puntos: [
      "Al pulsar Omitir o al llegar al 100%, la pantalla de carga se disuelve sobre la app en vez de cortar de golpe.",
    ],
  },
  {
    version: "v115",
    fecha: "2026-08-02",
    titulo: "Ajustes que se guardan solos",
    puntos: [
      "Las plataformas y el resto de ajustes se guardan al tocarlos: ya no hay botón de guardar.",
      "La lista de plataformas es fija: las que hay cubren lo que se ve en España.",
    ],
  },
  {
    version: "v114",
    fecha: "2026-08-02",
    titulo: "Tercera base de datos y diagnóstico",
    puntos: [
      "El buscador consulta ahora tres bases de datos a la vez: AniList, MyAnimeList y Kitsu.",
      "Si una búsqueda vuelve vacía, la app dice qué contestó cada una en vez de callárselo.",
      "Nueva sección de Diagnóstico en Ajustes.",
      "Las animaciones ya no se anulan del todo cuando el sistema pide reducir movimiento: se sustituyen por fundidos suaves.",
    ],
  },
  {
    version: "v113",
    fecha: "2026-08-02",
    titulo: "Una sola pantalla de entrada",
    puntos: [
      "La animación de entrada y la pantalla de carga son ahora la misma: la marca se encoge y aparece la barra, sin cortes.",
      "Se ve igual en ordenador y en móvil.",
      "El buscador de animes consulta dos bases de datos a la vez: encuentra muchos más títulos.",
      "En tu perfil ya no hay botón de guardar: todo se guarda solo.",
    ],
  },
  {
    version: "v112",
    fecha: "2026-08-02",
    titulo: "Buscador de animes más fiable",
    puntos: [
      "Si una base de datos no responde, se consulta la otra: ya no dice que un anime no existe cuando sí existe.",
      "La animación de entrada también se ve en ordenador, no solo en el móvil.",
      "Las barras de Tus gustos entran igual de bien en ordenador que en el móvil.",
    ],
  },
  {
    version: "v111",
    fecha: "2026-08-02",
    titulo: "Buscar tus favoritos y una entrada más fluida",
    puntos: [
      "Los animes favoritos se buscan y se eligen de una lista con carátulas: ya no hay que escribir el título exacto.",
      "La animación de entrada enlaza con la pantalla de carga en vez de cortar de golpe.",
    ],
  },
  {
    version: "v110",
    fecha: "2026-08-02",
    titulo: "Iris ya puede tocar tu feed",
    intro: "El asistente pasa a llamarse Iris, y ahora hace lo que dice que hace.",
    puntos: [
      "Cuéntale qué series te gustan y las añade a tus favoritos de verdad, comprobando antes que existen.",
      "Dile qué géneros te van y los prioriza en tus noticias.",
      "Tus favoritos mandan mucho más que antes al ordenar el feed.",
      "Los animes favoritos se guardan solos y avisan si el título no existe.",
    ],
  },
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
