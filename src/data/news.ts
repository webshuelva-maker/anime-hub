import { NewsItem } from "@/types/news";

/**
 * Datos de ejemplo para la v1. En una versión futura esto vendrá de:
 * - RSS / APIs oficiales de cada plataforma
 * - Scraping controlado de newsrooms (Crunchyroll Newsroom, ANN, etc.)
 * - Un pipeline de IA (Groq) que clasifica, resume y detecta fiabilidad
 *
 * Incluye deliberadamente producciones grandes (mainstream) y pequeñas o
 * independientes (indie), porque el objetivo del feed es cubrir cualquier
 * anime, no solo las franquicias más conocidas.
 */
export const NEWS_ITEMS: NewsItem[] = [
  {
    id: "n1",
    title: "Segunda temporada confirmada para el próximo invierno",
    summary:
      "La cuenta oficial confirmó una nueva temporada tras el final de la primera, con el mismo estudio a cargo de la animación.",
    body:
      "El anuncio llegó sin previo aviso a través de la cuenta oficial de la producción, acompañado de una breve pieza de arte conceptual. Según el comunicado, el guion de la segunda temporada ya está cerrado y la animación arrancó hace varios meses, lo que explicaría la rapidez con la que se ha confirmado la fecha. El estudio ha mantenido el mismo equipo de dirección que en la primera entrega, algo que los seguidores llevaban meses pidiendo tras el cambio de rumbo argumental del último tramo. Todavía no hay tráiler, pero se espera un primer adelanto audiovisual en los próximos meses.",
    imageQuery: "anime dark fantasy sword protagonist",
    reliability: "official",
    category: "temporada-nueva",
    genres: ["Shonen", "Fantasía"],
    studios: ["MAPPA"],
    publishedAt: "2026-07-27T09:00:00.000Z",
    source: { platform: "Crunchyroll", url: "https://www.crunchyroll.com/news", label: "Ver en Crunchyroll Newsroom" },
    relatedTitle: "Espada del Ocaso",
    crossConfirmedBy: ["Netflix"],
    prominence: "mainstream",
  },
  {
    id: "n2",
    title: "Película anunciada para estreno en cines el próximo año",
    summary:
      "El estudio reveló un primer teaser durante un evento en Tokio, con estreno previsto en cines japoneses y fecha internacional aún sin confirmar.",
    body:
      "El teaser, de poco más de un minuto, no muestra diálogo alguno: solo un recorrido por una ciudad futurista bajo lluvia mientras suena una pieza orquestal. Es la primera vez que el estudio se aventura en un largometraje original sin partir de un manga o novela ligera previa, lo que ha generado bastante expectación sobre hacia dónde llevarán la historia. La productora ha confirmado que el proyecto lleva en desarrollo más de tres años y que el equipo de animación es en gran parte el mismo que trabajó en su anterior película, aclamada por la crítica.",
    imageQuery: "anime movie teaser cinematic city night",
    reliability: "official",
    category: "pelicula",
    genres: ["Seinen", "Ciencia ficción"],
    studios: ["Ufotable"],
    publishedAt: "2026-07-26T14:30:00.000Z",
    source: { platform: "HBO Max", url: "https://www.hbomax.com/", label: "Ver en HBO Max" },
    relatedTitle: "Neón Eclipse",
    prominence: "mainstream",
  },
  {
    id: "n3",
    title: "Rumor: posible crossover entre dos franquicias populares",
    summary:
      "Cuentas fan detectaron pistas en material promocional que apuntarían a un especial conjunto, aunque ninguna de las productoras lo ha confirmado.",
    body:
      "Todo empezó con una imagen borrosa compartida en redes por una cuenta dedicada al seguimiento de licencias de animación, en la que aparecían dos logotipos superpuestos que coincidían con las dos franquicias en cuestión. Desde entonces, la comunidad ha analizado cada detalle de los materiales promocionales recientes en busca de más pistas. Ninguna de las dos productoras ha querido hacer declaraciones, lo que en el pasado ha sido tanto señal de que algo se cocina como de que no hay nada que confirmar. Habrá que esperar a los próximos eventos del sector para salir de dudas.",
    imageQuery: "anime crossover mystery silhouette characters",
    reliability: "rumor",
    category: "evento",
    genres: ["Shonen", "Comedia"],
    studios: ["Bones", "Trigger"],
    publishedAt: "2026-07-25T18:00:00.000Z",
    source: { platform: "Prime Video", url: "https://www.primevideo.com/", label: "Ver hilo original" },
    relatedTitle: "Varios títulos",
    prominence: "mainstream",
  },
  {
    id: "n4",
    title: "Doblaje al español confirmado desde el episodio 1",
    summary:
      "La serie tendrá doblaje disponible simultáneo al estreno en Japón, algo poco habitual para producciones de este calibre.",
    body:
      "La decisión sorprende porque el doblaje simultáneo suele reservarse para producciones con presupuestos considerablemente mayores. Según fuentes cercanas a la distribuidora, la buena acogida de la novela ligera en la que se basa la serie fuera de Japón fue determinante para justificar la inversión. El reparto de voces en español se anunciará semanas antes del estreno, y la productora ha confirmado que se mantendrá fiel al tono pausado y contemplativo que caracteriza al material original.",
    imageQuery: "anime school life colorful characters",
    reliability: "official",
    category: "doblaje",
    genres: ["Slice of Life", "Romance"],
    studios: ["Kyoto Animation"],
    publishedAt: "2026-07-24T10:15:00.000Z",
    source: { platform: "Netflix", url: "https://www.netflix.com/", label: "Ver en Netflix" },
    relatedTitle: "Cerezos de Abril",
    prominence: "mainstream",
  },
  {
    id: "n5",
    title: "Adaptación de manga confirmada tras años de rumores",
    summary:
      "La editorial y un estudio de animación anunciaron conjuntamente el proyecto, con producción prevista para comenzar este año.",
    body:
      "Los rumores llevaban circulando desde que la editorial registró varias marcas relacionadas con el título hace más de un año, pero hasta ahora nadie se había atrevido a confirmar nada. El anuncio conjunto detalla que la producción está en fase de preproducción y que se ha optado por un estudio con experiencia en atmósferas de suspense, en línea con el tono de la obra original. Los autores del manga han declarado sentirse muy implicados en el proceso de adaptación, algo que no siempre ocurre y que ha sido bien recibido por los lectores más fieles.",
    imageQuery: "anime manga adaptation announcement dramatic",
    reliability: "confirmed",
    category: "adaptacion",
    genres: ["Misterio", "Seinen"],
    studios: ["Madhouse"],
    publishedAt: "2026-07-23T08:45:00.000Z",
    source: { platform: "Crunchyroll", url: "https://www.crunchyroll.com/news", label: "Ver en Crunchyroll Newsroom" },
    relatedTitle: "El Cuervo Silencioso",
    crossConfirmedBy: ["Disney+"],
    prominence: "mainstream",
  },
  {
    id: "n6",
    title: "Tercera temporada llegará antes de lo esperado",
    summary:
      "En un evento de fans, los productores adelantaron la ventana de estreno respecto a lo comunicado inicialmente.",
    body:
      "Durante una sesión de preguntas y respuestas con el público, uno de los productores dejó caer la nueva ventana de estreno casi de pasada, para sorpresa del resto del equipo en el escenario. La organización del evento confirmó después el dato por escrito. El adelanto en el calendario obligará a acelerar considerablemente el proceso de animación, algo que ya ha generado cierta preocupación entre parte de la comunidad, acostumbrada a que estos ajustes de última hora a veces afecten a la calidad final.",
    imageQuery: "anime mecha robot battle epic",
    reliability: "official",
    category: "temporada-nueva",
    genres: ["Mecha", "Ciencia ficción"],
    studios: ["Trigger"],
    publishedAt: "2026-07-22T12:00:00.000Z",
    source: { platform: "Disney+", url: "https://www.disneyplus.com/", label: "Ver en Disney+" },
    relatedTitle: "Guardianes de Acero",
    prominence: "mainstream",
  },
  {
    id: "n7",
    title: "Nuevo director confirmado para la próxima entrega",
    summary:
      "Tras la salida del director original, el estudio nombró a su reemplazo, quien ya trabajó como animador clave en la serie.",
    body:
      "El cambio de dirección llega en un momento delicado de la producción, con la mitad de la temporada ya en fase de animación. El nuevo responsable lleva años en la casa y ha trabajado como animador clave en varios de los episodios más recordados de la serie, lo que ha tranquilizado a buena parte de la audiencia. El estudio ha insistido en que no habrá cambios de rumbo argumental, solo un relevo natural tras la marcha del director original a un proyecto distinto.",
    imageQuery: "anime director studio announcement",
    reliability: "confirmed",
    category: "evento",
    genres: ["Drama", "Seinen"],
    studios: ["Wit Studio"],
    publishedAt: "2026-07-21T16:20:00.000Z",
    source: { platform: "HBO Max", url: "https://www.hbomax.com/", label: "Ver en HBO Max" },
    relatedTitle: "Horizonte Roto",
    prominence: "mainstream",
  },
  {
    id: "n8",
    title: "Rumor: posible cancelación tras bajas ventas del manga",
    summary:
      "Foros especializados especulan con un cierre anticipado, aunque la editorial no ha hecho declaraciones oficiales al respecto.",
    body:
      "El rumor arrancó en foros dedicados al seguimiento de ventas editoriales, donde varios usuarios señalaron una caída notable en las cifras de los últimos tres volúmenes publicados. Ni la editorial ni el estudio han hecho declaraciones, algo habitual incluso cuando no hay ningún cambio previsto. Conviene recordar que este tipo de rumores rara vez se confirman tal cual se plantean al principio, aunque no está de más seguir la pista por si hay novedades oficiales en las próximas semanas.",
    imageQuery: "anime sad ending dramatic scene",
    reliability: "rumor",
    category: "evento",
    genres: ["Drama"],
    studios: ["A-1 Pictures"],
    publishedAt: "2026-07-20T11:00:00.000Z",
    source: { platform: "Prime Video", url: "https://www.primevideo.com/", label: "Ver hilo original" },
    relatedTitle: "Últimos Días de Verano",
    prominence: "mainstream",
  },
  {
    id: "n9",
    title: "Estreno mundial simultáneo confirmado en cinco plataformas",
    summary:
      "Por primera vez, el estudio distribuirá el estreno el mismo día en varias plataformas a la vez para evitar filtraciones.",
    body:
      "Es la primera vez que una producción de este calibre se estrena el mismo día en cinco plataformas distintas, una estrategia pensada explícitamente para evitar las filtraciones que han perseguido a entregas anteriores de la saga. El anuncio ha venido acompañado de un calendario detallado con las horas exactas de publicación en cada región. La producción ha confirmado también que los tres primeros episodios se publicarán juntos, un formato poco habitual que ya han probado otras franquicias con buenos resultados de enganche inicial.",
    imageQuery: "anime worldwide premiere event lights",
    reliability: "official",
    category: "estreno",
    genres: ["Shonen", "Fantasía"],
    studios: ["MAPPA", "Bones"],
    publishedAt: "2026-07-19T09:30:00.000Z",
    source: { platform: "Crunchyroll", url: "https://www.crunchyroll.com/news", label: "Ver en Crunchyroll Newsroom" },
    relatedTitle: "Reino de Cenizas",
    crossConfirmedBy: ["Netflix", "Prime Video"],
    prominence: "mainstream",
  },
  {
    id: "n10",
    title: "Estudio Ghibli confirma nuevo largometraje original",
    summary:
      "Sin adaptar ninguna obra previa, el estudio trabaja en una historia completamente nueva con estreno estimado en dos años.",
    body:
      "A diferencia de sus últimos trabajos, este proyecto no parte de ninguna novela, cuento o encargo previo: es una historia completamente original, gestada internamente durante los últimos años. El estudio ha sido especialmente hermético con los detalles, limitándose a confirmar que la protagonista será, de nuevo, una niña, y que buena parte del equipo técnico histórico del estudio participa en el proyecto. No se espera más información hasta bien entrado el próximo año.",
    imageQuery: "ghibli style hand drawn nature scene",
    reliability: "official",
    category: "pelicula",
    genres: ["Fantasía", "Slice of Life"],
    studios: ["Studio Ghibli"],
    publishedAt: "2026-07-18T13:00:00.000Z",
    source: { platform: "HBO Max", url: "https://www.hbomax.com/", label: "Ver en HBO Max" },
    relatedTitle: "Proyecto sin título",
    prominence: "mainstream",
  },
  {
    id: "n11",
    title: "Evento sorpresa reunirá al elenco de voces original",
    summary:
      "Con motivo del décimo aniversario, se organizará una función especial con los actores de doblaje original en japonés.",
    body:
      "El evento, pensado como celebración del décimo aniversario de la serie, reunirá sobre el escenario a todo el reparto original de voces en japonés para una lectura dramatizada de uno de los arcos más queridos por el público. Las entradas se agotaron en cuestión de minutos, lo que ha llevado a la organización a estudiar una retransmisión en directo para quienes se quedaron sin sitio. Se espera además algún anuncio relacionado con nuevo material, aunque de momento no hay nada confirmado al respecto.",
    imageQuery: "anime voice actors event stage",
    reliability: "confirmed",
    category: "evento",
    genres: ["Comedia", "Slice of Life"],
    studios: ["CloverWorks"],
    publishedAt: "2026-07-17T15:45:00.000Z",
    source: { platform: "Netflix", url: "https://www.netflix.com/", label: "Ver en Netflix" },
    relatedTitle: "Melodía de Instituto",
    prominence: "mainstream",
  },
  {
    id: "n12",
    title: "Nueva temporada de deportes llega con animación renovada",
    summary:
      "El estudio confirmó un salto de calidad técnica notable respecto a temporadas anteriores, mostrado en un primer avance.",
    body:
      "El salto de calidad se aprecia ya en el primer avance publicado, con secuencias de movimiento mucho más fluidas que en temporadas anteriores y un uso más ambicioso de la cámara durante las escenas de competición. El estudio ha confirmado que ha ampliado el equipo de animadores especializados en secuencias deportivas, una decisión que llevaba tiempo reclamando parte de la afición tras algunas críticas a la temporada anterior.",
    imageQuery: "anime sports team running stadium",
    reliability: "official",
    category: "temporada-nueva",
    genres: ["Deportes"],
    studios: ["Madhouse"],
    publishedAt: "2026-07-16T07:30:00.000Z",
    source: { platform: "Disney+", url: "https://www.disneyplus.com/", label: "Ver en Disney+" },
    relatedTitle: "Saque Final",
    prominence: "mainstream",
  },
  {
    id: "n13",
    title: "Estudio independiente financia su propia serie por crowdfunding",
    summary:
      "Tras superar su objetivo en pocos días, un pequeño colectivo de animadores independientes confirmó luz verde para una miniserie de seis episodios.",
    body:
      "La campaña de financiación superó su objetivo en menos de una semana, algo poco habitual incluso dentro del panorama de animación independiente. El colectivo, formado por apenas ocho personas, ha confirmado que la miniserie constará de seis episodios de veinte minutos cada uno, con un estilo visual muy personal que combina técnicas tradicionales con animación digital. Los responsables han insistido en que mantendrán el control creativo total del proyecto, uno de los motivos que más ha calado entre quienes decidieron apoyar la financiación.",
    imageQuery: "small indie anime studio hand drawn",
    reliability: "confirmed",
    category: "estreno",
    genres: ["Psicológico", "Drama"],
    studios: ["Studio Kagerou"],
    publishedAt: "2026-07-27T07:00:00.000Z",
    source: { platform: "Crunchyroll", url: "https://www.crunchyroll.com/news", label: "Ver en Crunchyroll Newsroom" },
    relatedTitle: "El Peso de la Niebla",
    prominence: "indie",
  },
  {
    id: "n14",
    title: "Corto de animación independiente gana premio en festival internacional",
    summary:
      "El corto, dirigido por un único animador durante tres años, fue reconocido en un festival europeo y ya negocia distribución.",
    body:
      "Detrás del corto hay una sola persona, que compaginó su trabajo habitual con la animación del proyecto durante casi tres años en su tiempo libre. El jurado del festival destacó especialmente el uso del color y el silencio como recursos narrativos, en una pieza que apenas tiene diálogo. Tras el premio, varias distribuidoras se han puesto en contacto con el autor, aunque de momento no hay ningún acuerdo cerrado.",
    imageQuery: "experimental anime short film festival",
    reliability: "official",
    category: "evento",
    genres: ["Sobrenatural", "Drama"],
    studios: ["Tsukikage Films"],
    publishedAt: "2026-07-25T10:00:00.000Z",
    source: { platform: "Prime Video", url: "https://www.primevideo.com/", label: "Ver hilo original" },
    relatedTitle: "El Jardín que No Existe",
    prominence: "indie",
  },
  {
    id: "n15",
    title: "Serie de nicho sobre ajedrez confirma segunda temporada pese a bajo presupuesto",
    summary:
      "A pesar de una producción modesta, la comunidad de fans impulsó suficientes reproducciones como para justificar una continuación.",
    body:
      "Con un presupuesto muy por debajo de lo habitual en el sector, la serie logró hacerse un hueco gracias al boca a boca entre aficionados a los juegos de mesa y el ajedrez, un nicho poco explorado hasta ahora en la animación. La segunda temporada mantendrá al mismo equipo creativo, aunque con un ligero aumento de presupuesto gracias a las cifras de visionado obtenidas. Sus responsables han declarado que el objetivo sigue siendo contar una historia pequeña y honesta, sin perseguir a un público masivo.",
    imageQuery: "small anime studio chess niche series",
    reliability: "official",
    category: "temporada-nueva",
    genres: ["Slice of Life", "Drama"],
    studios: ["Studio Kagerou"],
    publishedAt: "2026-07-23T12:30:00.000Z",
    source: { platform: "Netflix", url: "https://www.netflix.com/", label: "Ver en Netflix" },
    relatedTitle: "Jaque en Silencio",
    prominence: "indie",
  },
  {
    id: "n16",
    title: "Estudio pequeño anuncia adaptación de webcómic de terror psicológico",
    summary:
      "El estudio, conocido por producciones de bajo presupuesto pero muy cuidadas visualmente, adaptará un webcómic de culto.",
    body:
      "El estudio, con solo tres producciones en su haber, se ha ganado una reputación sólida por su capacidad de generar atmósferas inquietantes con recursos limitados. La adaptación del webcómic, que acumula varios millones de lecturas, mantendrá la estructura episódica autoconclusiva del original. El equipo ha confirmado que contará con el propio autor como consultor creativo durante toda la producción, algo que los lectores más fieles han recibido con alivio.",
    imageQuery: "psychological horror indie anime webcomic",
    reliability: "confirmed",
    category: "adaptacion",
    genres: ["Terror", "Psicológico"],
    studios: ["Hangetsu Animation"],
    publishedAt: "2026-07-21T09:15:00.000Z",
    source: { platform: "HBO Max", url: "https://www.hbomax.com/", label: "Ver en HBO Max" },
    relatedTitle: "Habitación 407",
    prominence: "indie",
  },
  {
    id: "n17",
    title: "Rumor: colectivo independiente prepara anuncio sorpresa esta semana",
    summary:
      "Cuentas de la comunidad detectaron actividad inusual en las redes de un estudio pequeño, aunque no hay nada confirmado todavía.",
    body:
      "La actividad detectada incluye cambios en las biografías de las redes oficiales del estudio y la reserva de varios dominios web relacionados con un mismo término, algo que la comunidad interpreta como preparación para un anuncio inminente. No es la primera vez que este colectivo genera expectación de esta manera antes de un lanzamiento, así que conviene tomarse el rumor con cautela hasta que haya algo oficial.",
    imageQuery: "small studio teaser mystery announcement",
    reliability: "rumor",
    category: "evento",
    genres: ["Misterio", "Fantasía"],
    studios: ["Tsukikage Films"],
    publishedAt: "2026-07-20T08:00:00.000Z",
    source: { platform: "Crunchyroll", url: "https://www.crunchyroll.com/news", label: "Ver en Crunchyroll Newsroom" },
    relatedTitle: "Desconocido",
    prominence: "indie",
  },
  {
    id: "n18",
    title: "Serie autoproducida sobre panadería llega a plataformas tras éxito viral",
    summary:
      "Nacida como proyecto personal de una animadora independiente en redes sociales, la serie fue adquirida tras acumular millones de vistas.",
    body:
      "Todo empezó como un proyecto personal que su creadora subía episodio a episodio en redes sociales, sin ninguna intención comercial detrás. Tras acumular varios millones de visualizaciones, una distribuidora se puso en contacto con ella para adquirir los derechos y ampliar la producción. La autora ha confirmado que mantendrá el control creativo y que el tono pausado y reconfortante de la serie no cambiará pese al salto a plataformas.",
    imageQuery: "cozy slice of life indie anime bakery",
    reliability: "official",
    category: "estreno",
    genres: ["Slice of Life", "Comedia"],
    studios: ["Hangetsu Animation"],
    publishedAt: "2026-07-19T14:00:00.000Z",
    source: { platform: "Disney+", url: "https://www.disneyplus.com/", label: "Ver en Disney+" },
    relatedTitle: "Pan Recién Hecho",
    prominence: "indie",
  },
  {
    id: "n19",
    title: "Estudio independiente busca animadores para su segundo proyecto",
    summary:
      "Tras el buen recibimiento de su primera obra, el estudio abrió convocatoria pública, lo que sugiere una producción más ambiciosa.",
    body:
      "La convocatoria, publicada en la web del estudio, busca perfiles de animación de fondos y diseño de personajes, dos áreas que suelen ampliarse cuando un estudio pequeño se plantea un proyecto más ambicioso que el anterior. No se ha confirmado ningún detalle argumental todavía, aunque el título provisional ya ha empezado a circular entre la comunidad de seguidores del estudio.",
    imageQuery: "indie animation studio hiring announcement",
    reliability: "confirmed",
    category: "evento",
    genres: ["Fantasía", "Aventura"],
    studios: ["Studio Kagerou"],
    publishedAt: "2026-07-18T11:20:00.000Z",
    source: { platform: "Prime Video", url: "https://www.primevideo.com/", label: "Ver hilo original" },
    relatedTitle: "La Última Cartografía",
    prominence: "indie",
  },
  {
    id: "n20",
    title: "Miniserie de terror de bajo presupuesto arrasa en críticas",
    summary:
      "Con apenas cuatro episodios y un equipo reducido, la serie se ha convertido en la sorpresa mejor valorada del mes entre la crítica especializada.",
    body:
      "Con un equipo de apenas doce personas y cuatro episodios de veinticinco minutos, la serie ha conseguido lo que pocas producciones de bajo presupuesto logran: unanimidad entre la crítica especializada. Varios medios han destacado especialmente el uso del sonido y los silencios prolongados como principal herramienta de tensión, por encima de los recursos visuales. Sus responsables ya han confirmado que están valorando una segunda temporada si la respuesta del público acompaña.",
    imageQuery: "low budget horror anime miniseries critically acclaimed",
    reliability: "official",
    category: "estreno",
    genres: ["Terror"],
    studios: ["Hangetsu Animation"],
    publishedAt: "2026-07-17T09:45:00.000Z",
    source: { platform: "Netflix", url: "https://www.netflix.com/", label: "Ver en Netflix" },
    relatedTitle: "La Casa que Respira",
    prominence: "indie",
  },
];
