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
    version: "v202",
    fecha: "2026-08-07",
    titulo: "Ahora sí te avisamos",
    puntos: [
      "Puedes activar los avisos del móvil desde Conectar: sin ellos, los mensajes y las llamadas solo se notan con la app abierta.",
      "Las llamadas ya no entran encima de la pantalla de carga: esperan a que termine.",
    ],
  },
  {
    version: "v201",
    fecha: "2026-08-07",
    titulo: "Las llamadas te encuentran",
    puntos: [
      "Ahora te llega un aviso al móvil aunque tengas la app cerrada, y al abrirla la llamada sigue sonando esperándote.",
      "El timbre dura más, para dar tiempo a coger el teléfono.",
      "El botón de omitir vuelve a su esquina en el móvil.",
    ],
  },
  {
    version: "v200",
    fecha: "2026-08-06",
    titulo: "Detalles de llamadas y de la entrada",
    puntos: [
      "La pantalla de llamada ya no desaparece de un tirón: se va como llegó.",
      "El botón de omitir vuelve a verse en el móvil.",
    ],
  },
  {
    version: "v199",
    fecha: "2026-08-06",
    titulo: "Los mensajes no se iban a ninguna parte",
    puntos: [
      "Arreglado el chat que aparecía vacío al volver a entrar: los mensajes estaban ahí, solo que no se cargaban.",
      "En una llamada, las dos pantallas dicen lo mismo: si os estáis oyendo, las dos ponen que está en curso.",
    ],
  },
  {
    version: "v198",
    fecha: "2026-08-06",
    titulo: "Las llamadas conectan",
    puntos: [
      "Arreglado el «conectando…» que no terminaba nunca.",
      "Y si de verdad no se puede conectar, ahora te lo dice en vez de dejarte esperando.",
    ],
  },
  {
    version: "v197",
    fecha: "2026-08-06",
    titulo: "Llamadas de voz",
    intro: "Ya podéis hablar de verdad.",
    puntos: [
      "Llama a quien hayas coincidido desde la propia conversación, y recibe llamadas estés donde estés en la app.",
      "La voz va directa de un dispositivo a otro: no pasa por ningún servidor ni se graba.",
      "Silenciar el micrófono y colgar, siempre a la vista.",
    ],
  },
  {
    version: "v196",
    fecha: "2026-08-06",
    titulo: "Panel de denuncias para moderación",
    intro:
      "Antes las denuncias se podían crear desde Conectar pero nadie las leía desde la app. Ahora sí.",
    puntos: [
      "Nueva sección \"Denuncias\" en Moderación: motivo, quién denuncia y a quién, y la conversación de por medio si la hay (incluidas notas de voz, y los mensajes que se hayan borrado — para esto se guardaban).",
      "Se puede sancionar directamente desde la propia denuncia, sin ir a buscar a la persona aparte.",
      "Cada denuncia se puede marcar como resuelta o descartada, con una nota para el historial.",
      "Aviso en el momento cuando entra una denuncia nueva, aunque el panel esté plegado.",
    ],
  },
  {
    version: "v195",
    fecha: "2026-08-06",
    titulo: "Borrar mensajes en Conectar, y dos arreglos de sonido",
    puntos: [
      "En Conectar ya puedes eliminar un mensaje: para ti solo, o para todos si es tuyo (se enseña como \"Mensaje eliminado\", pero el contenido no desaparece de verdad de la base — sigue existiendo por si hace falta para una denuncia).",
      "Arreglado el choque de dos sonidos a la vez al entrar en Noticias desde cualquier otro apartado.",
      "El volumen máximo de la música de fondo suena más alto que antes.",
    ],
  },
  {
    version: "v194",
    fecha: "2026-08-06",
    titulo: "El sonido de desplegar en todas partes, y volumen para la música",
    puntos: [
      "El sonido de desplegar ya suena también al abrir Novedades, Ajustes y el menú de Privacidad, donde antes se quedaba mudo.",
      "En Ajustes hay un control para bajar o silenciar la música de fondo sin tener que apagarla del todo.",
      "Quitado el banco de pruebas de sonidos de Ajustes.",
      "Cuando Iris avisa de una novedad y le dices que sí, te lo cuenta directamente en vez de dejarte la pregunta escrita para que la mandes tú.",
    ],
  },
  {
    version: "v193",
    fecha: "2026-08-06",
    titulo: "El archivo entero, y sonidos con cuerpo",
    puntos: [
      "Buscando una serie ves el historial de noticias de todas sus temporadas juntas, entres por donde entres, de lo más reciente a lo más antiguo.",
      "Los sonidos de pasar el ratón y de abrir y cerrar a Iris están rehechos con otro material.",
      "En Ajustes puedes escuchar todos los sonidos seguidos para compararlos.",
      "La música de fondo suena algo más baja.",
    ],
  },
  {
    version: "v192",
    fecha: "2026-08-05",
    titulo: "Los sonidos, a la altura",
    puntos: [
      "Todos los sonidos de la app suenan ahora en el mismo espacio: clics, avisos de Iris y todo lo demás dejan de sonar planos.",
      "Al buscar en Noticias, las sugerencias entran una a una como en Tus favoritos.",
    ],
  },
  {
    version: "v191",
    fecha: "2026-08-06",
    titulo: "Sonido nuevo y el archivo de noticias, arreglado",
    intro:
      "Si acabas de actualizar y no notas ninguno de estos cambios, lo que se está ejecutando es una versión anterior: hay que volver a compilar la app.",
    puntos: [
      "Melodía al abrir la web, y un fondo sonoro con notas sueltas que empieza al primer clic. Se puede apagar en Ajustes.",
      "Todos los sonidos de la interfaz son ahora más suaves: menos volumen, sin filo y con más cuerpo.",
      "Abrir y cerrar a Iris suenan distinto entre sí.",
      "Los resultados de búsqueda ya no aparecen de golpe: entran con una transición.",
      "El archivo de noticias antiguas vuelve a funcionar aunque la API de MyAnimeList esté caída.",
      "Las noticias del archivo llegan traducidas, ordenadas de más reciente a más antigua y con su fecha real.",
      "Al buscar una serie con varias temporadas, el archivo trae las noticias de la temporada más reciente.",
      "Quitada la sección «Puede que tenga que ver».",
    ],
  },
  {
    version: "v183",
    fecha: "2026-08-05",
    titulo: "Cuando algo falla, ahora dice por qué",
    puntos: [
      "Si no se puede consultar el archivo de noticias, se indica el motivo concreto en vez de un aviso genérico.",
    ],
  },
  {
    version: "v181",
    fecha: "2026-08-05",
    titulo: "El archivo de noticias, ahora sí",
    puntos: [
      "Las noticias antiguas de una serie ya no desaparecen por un tropiezo pasajero.",
      "Y si de verdad no se puede consultar, te lo dice y puedes reintentarlo.",
    ],
  },
  {
    version: "v180",
    fecha: "2026-08-05",
    titulo: "Tú decides cuánta animación quieres",
    intro: "En Ajustes hay una opción nueva.",
    puntos: [
      "Si tienes «Reducir movimiento» activado en tu sistema, la app te lo respetaba y te enseñaba una versión casi sin animaciones. Ahora puedes pedirle que las ponga todas igualmente.",
      "Y al revés: puedes dejarlas al mínimo aunque tu sistema no pida nada.",
    ],
  },
  {
    version: "v179",
    fecha: "2026-08-05",
    titulo: "La búsqueda deja de dar saltos",
    puntos: [
      "La ficha de la serie ya no empuja las noticias hacia abajo al aparecer: su hueco está reservado desde el principio.",
      "Se acabó el «ya no se publicará nada nuevo» en series que sí tienen temporada en marcha.",
      "El botón de seguir una serie, rehecho.",
    ],
  },
  {
    version: "v178",
    fecha: "2026-08-05",
    titulo: "Detalles de la búsqueda",
    puntos: [
      "El desplegable de entregas se cierra con animación, y su flecha está donde tiene que estar.",
      "La ficha de la serie aparece antes al buscar desde una noticia.",
    ],
  },
  {
    version: "v177",
    fecha: "2026-08-05",
    titulo: "La ficha vuelve al pulsar una noticia",
    puntos: [
      "Al buscar desde el titular de una noticia vuelve a salir la ficha de la serie.",
    ],
  },
  {
    version: "v176",
    fecha: "2026-08-05",
    titulo: "Buscar deja de ser un lío",
    puntos: [
      "Al buscar una serie sale su ficha, una sola y grande, en vez de cuatro tarjetas mezcladas.",
      "Las películas y especiales de esa franquicia van recogidos debajo, y se abren si los quieres ver.",
      "Se acabaron las entradas repetidas de la misma obra.",
      "Ya no pone «FINISHED» ni «TV» en inglés: pone Serie, Película o Especial, con su año.",
    ],
  },
  {
    version: "v175",
    fecha: "2026-08-05",
    titulo: "Noticias antiguas de cualquier serie",
    puntos: [
      "Si buscas una serie y no hay nada reciente, ahora se va a buscar su historial de noticias con fechas reales.",
    ],
  },
  {
    version: "v174",
    fecha: "2026-08-05",
    titulo: "La búsqueda deja de confundirse",
    puntos: [
      "Buscar por el título completo de una serie ya encuentra sus noticias.",
      "Se acabaron las fichas de animes que no tienen nada que ver con lo que buscabas.",
      "El botón de seguir dice la verdad, y ahora también se puede dejar de seguir.",
      "Las fichas de serie entran con animación, como el resto.",
    ],
  },
  {
    version: "v173",
    fecha: "2026-08-05",
    titulo: "Buscador en Mensajes",
    puntos: [
      "Busca una conversación por nombre, o encuentra ese mensaje que recuerdas a medias.",
      "La onda de los audios avanza de verdad mientras escuchas, también en equipos justos.",
    ],
  },
  {
    version: "v165",
    fecha: "2026-08-05",
    titulo: "Notas de voz",
    puntos: [
      "Graba y manda notas de voz en el chat, de hasta dos minutos.",
      "Solo las podéis oír vosotros dos: se guardan en privado y el enlace caduca.",
    ],
  },
  {
    version: "v164",
    fecha: "2026-08-05",
    titulo: "Tus favoritos, donde tocaba",
    puntos: [
      "Tus animes favoritos aparecen por fin en Tus gustos, con su carátula, y se editan ahí mismo.",
      "La ficha de Conectar entra con animación en vez de aparecer a trozos.",
      "En tu perfil, «me da igual» pasa a leerse como una frase y no como una casilla.",
    ],
  },
  {
    version: "v163",
    fecha: "2026-08-05",
    titulo: "Un chat de verdad, y tu perfil como lo ven",
    puntos: [
      "Reacciona a un mensaje, respóndele citándolo y mete emojis sin salir del teclado.",
      "Sabes cuándo han leído tu último mensaje.",
      "Tu perfil deja de ser una lista de datos: ves exactamente la ficha que le sale a los demás, y puedes cambiar tu descripción ahí mismo.",
    ],
  },
  {
    version: "v162",
    fecha: "2026-08-05",
    titulo: "Conectar con cara",
    puntos: [
      "Los animes que compartís se ven con su carátula, y el fondo de cada ficha es un mosaico de ellas.",
      "En el chat sabes si la otra persona está en línea y cuándo está escribiendo.",
    ],
  },
  {
    version: "v161",
    fecha: "2026-08-05",
    titulo: "Conectar, ordenado",
    puntos: [
      "Descubrir, Mensajes y Tu perfil pasan a ser tres pestañas en vez de tres bloques apilados.",
      "Los mensajes sin leer se ven en la pestaña, estés donde estés.",
      "El chat ya se abre de verdad a pantalla completa, sin la página asomando por detrás.",
    ],
  },
  {
    version: "v160",
    fecha: "2026-08-05",
    titulo: "Conectar, con otra cara",
    puntos: [
      "El chat pasa a pantalla completa, con los mensajes agrupados por persona.",
      "Bloquear y denunciar dejan de estar en pantalla todo el rato: viven en el menú de la conversación y explican qué hacen al abrirlos.",
      "Las confirmaciones ya no se abren por detrás de lo que estás confirmando.",
    ],
  },
  {
    version: "v159",
    fecha: "2026-08-05",
    titulo: "Va suave",
    puntos: [
      "Si tienes activado «Reducir movimiento» en tu sistema, la app ahora lo respeta de verdad y va mucho más ligera.",
      "Los botones responden al pulsarlos, tengas o no las animaciones activadas.",
      "Bloquear y denunciar explican qué hacen antes de que los necesites.",
    ],
  },
  {
    version: "v158",
    fecha: "2026-08-05",
    titulo: "Ya podéis hablar",
    intro: "Conectar deja de acabarse en la coincidencia.",
    puntos: [
      "Chat con quien has coincidido, con los mensajes llegando al momento.",
      "Si alguien te marca, su ficha te sale la primera: ya no hay que esperar a que te toque.",
      "La descripción del perfil pasa a ser obligatoria, para que haya algo que leer.",
      "Bloquear y denunciar están siempre a la vista dentro de la conversación.",
    ],
  },
  {
    version: "v157",
    fecha: "2026-08-05",
    titulo: "Conectar se entiende, y tu nombre deja de perderse",
    puntos: [
      "Al cambiar de cuenta ya no se borra el nombre que tenías guardado.",
      "En Conectar, ahora sabes qué pasa al marcar a alguien y cuánta gente te queda por ver.",
      "Las fichas de perfil enseñan de un vistazo cuánto compartís.",
    ],
  },
  {
    version: "v156",
    fecha: "2026-08-05",
    titulo: "Arreglos de cuentas y sesión",
    puntos: [
      "Cerrar sesión en un dispositivo ya no te echa de los demás.",
      "Al cambiar de cuenta, el nombre y los gustos de la anterior ya no se quedan puestos.",
      "Los avisos al entrar o registrarte están en español y dicen qué hacer.",
      "El enlace de confirmación funciona abras el correo donde lo abras, y al pulsarlo te dice claramente que ha ido bien.",
    ],
  },
  {
    version: "v154",
    fecha: "2026-08-04",
    titulo: "Conectar empieza a funcionar",
    intro: "Ya se puede descubrir gente. El chat es lo siguiente.",
    puntos: [
      "Te aparecen personas ordenadas por lo que compartís: primero quien más gustos tiene en común contigo.",
      "Cada ficha te enseña lo que compartís antes que nada, para que sepas por qué te ha salido.",
      "Me interesa o Paso. Si los dos os marcáis, aparece la coincidencia.",
      "Bloquear y denunciar están a la vista desde el primer perfil, no escondidos en un menú.",
    ],
  },
  {
    version: "v153",
    fecha: "2026-08-04",
    titulo: "Ajustes del panel de moderación",
    puntos: [
      "Las animaciones del listado de miembros van finas: se acabaron los saltos al abrir y al buscar.",
    ],
  },
  {
    version: "v151",
    fecha: "2026-08-04",
    titulo: "Moderación de verdad y avisos de actualización",
    puntos: [
      "El equipo de moderación puede avisar, suspender o expulsar a cualquier miembro, no solo a quien tuviera una consulta abierta.",
      "Los avisos y las sanciones llegan al instante: aparecen en pantalla sin tener que recargar nada.",
      "Cuando el feed busca noticias nuevas, ahora te lo dice y te cuenta cuántas ha traído, en vez de cambiarte las tarjetas por sorpresa.",
    ],
  },
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
