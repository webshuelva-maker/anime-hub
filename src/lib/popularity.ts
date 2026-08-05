/**
 * Popularidad de los títulos del feed, en UNA sola petición.
 *
 * Hasta ahora la popularidad llegaba con el enriquecido de cada tarjeta,
 * o sea DESPUÉS de que el feed ya estuviera ordenado y pintado. Resultado:
 * al ordenar, casi ningún elemento tenía ese dato, y la regla de "si no
 * hay preferencias, primero lo conocido" no se aplicaba a nada. Por eso
 * el feed de alguien nuevo salía lleno de series que no conoce.
 *
 * Aquí se piden todos los títulos de golpe, aprovechando que GraphQL
 * permite varias consultas con alias en la misma petición: treinta
 * títulos, una sola llamada a AniList. Los resultados se guardan en
 * memoria un rato, así que las recargas siguientes no piden nada.
 *
 * No se filtra por tipo: así valen igual las noticias de anime y las de
 * manga, que era otra cosa que se quedaba fuera.
 */

const ANILIST_URL = "https://graphql.anilist.co";
const TTL_MS = 6 * 60 * 60 * 1000; // seis horas: la popularidad se mueve muy despacio

export interface DatosTitulo {
  /** Identificador de la ficha en AniList. */
  anilistId: number | null;
  /*
   * Título original en romaji.
   *
   * Es lo que de verdad identifica la OBRA, y no el id: AniList tiene
   * fichas separadas para el anime y para el manga de la misma serie, con
   * ids distintos (Chained Soldier cayó en la 141821 y Mato Seihei no
   * Slave en la 106064, siendo la misma historia). Las dos fichas sí
   * comparten el romaji "Mato Seihei no Slave", así que comparando esto
   * se detectan las noticias repetidas con el título japonés en un medio
   * y el internacional en otro.
   */
  tituloCanonico: string | null;
  /*
   * Carátula oficial de AniList.
   *
   * Se pide AQUÍ, en el mismo lote, y no una por una desde /api/enrich.
   * Ese camino solo cubría las 9 primeras noticias, con 3 segundos de
   * margen y con la consulta que devuelve 404 al no encontrar — por eso
   * la mayoría se quedaba con una fotografía genérica sin relación con
   * la noticia. En el lote ya se resuelve el título igualmente, así que
   * la carátula sale gratis y para todas.
   */
  coverImageUrl: string | null;
  popularity: number | null;
  genres: string[];
  studios: string[];
  /** Plataformas donde se puede ver, según AniList. */
  platforms: string[];
}

const cache = new Map<string, { datos: DatosTitulo; expira: number }>();

/*
 * Rastro del último intento contra AniList.
 *
 * La popularidad sigue saliendo a cero incluso con los títulos ya
 * limpios, así que el fallo está en la propia llamada y desde fuera no
 * se distingue: una respuesta vacía y una respuesta rechazada se ven
 * igual. Esto guarda el código de estado y el primer error que devuelva
 * AniList para poder mirarlo en /api/news sin tener que adivinar.
 */
export let ultimoIntentoAniList: {
  estado: number | null;
  error: string | null;
  cuantosDatos: number;
  ejemploConsulta: string | null;
} = { estado: null, error: null, cuantosDatos: 0, ejemploConsulta: null };

function claveDe(titulo: string): string {
  return titulo.toLowerCase().trim();
}

/** Escapa el título para poder incrustarlo en la consulta GraphQL. */
function escapar(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Formas alternativas de buscar un título cuando el nombre completo no
 * da resultado en AniList.
 *
 * Los títulos oficiales largos son justo los que peor buscan: el
 * subtítulo entero ("Re:ZERO -Starting Life in Another World-",
 * "Mushoku Tensei: Jobless Reincarnation") mete tantas palabras que el
 * buscador de AniList puede no dar ninguna coincidencia, aunque la serie
 * esté ahí de sobra. Recortando el subtítulo se encuentra a la primera.
 *
 * Se devuelven de más específica a menos, sin repetir y sin la original
 * (que ya se ha probado antes de llamar aquí).
 */
export function variantesDeBusqueda(titulo: string): string[] {
  const base = titulo.trim();
  const salida: string[] = [];

  const meter = (v: string) => {
    const limpio = v.replace(/\s+/g, " ").trim();
    // Menos de cuatro letras no identifica nada: "Re" encontraría
    // cualquier cosa, y una coincidencia falsa es peor que ninguna.
    if (limpio.length < 4) return;
    if (limpio.toLowerCase() === base.toLowerCase()) return;
    if (salida.some((s) => s.toLowerCase() === limpio.toLowerCase())) return;
    salida.push(limpio);
  };

  // "Re:ZERO -Starting Life in Another World-" → "Re:ZERO"
  meter(base.replace(/[-–—]\s*[^-–—]+\s*[-–—]?\s*$/, ""));
  // "Mushoku Tensei: Jobless Reincarnation" → "Mushoku Tensei"
  meter(base.split(/[:：]/)[0]);
  // Sin paréntesis ni corchetes: "(TV)", "[2024]", "(Season 2)"
  meter(base.replace(/[([{][^)\]}]*[)\]}]/g, ""));
  // Sin marcas de temporada al final: "Season 2", "2nd Season", "Part 2"
  meter(base.replace(/\b((\d+(st|nd|rd|th)?\s+)?season|part|cour|temporada)\s*\d*\s*$/i, ""));
  // Último recurso: solo las tres primeras palabras.
  meter(base.split(/\s+/).slice(0, 3).join(" "));

  return salida.slice(0, 3);
}

/**
 * Traduce los enlaces externos de AniList a los nombres de plataforma
 * que usa la app.
 *
 * Sirve para poder priorizar en el feed las noticias de series que se
 * pueden ver donde el usuario tiene cuenta: si solo tiene Crunchyroll,
 * una noticia de algo exclusivo de otra plataforma le sirve de menos.
 * AniList escribe los nombres a su manera ("Amazon Prime Video",
 * "Netflix"), así que hay que emparejarlos.
 */
const EQUIVALENCIAS_PLATAFORMA: [RegExp, string][] = [
  [/crunchyroll/i, "Crunchyroll"],
  [/netflix/i, "Netflix"],
  [/prime\s*video|amazon/i, "Prime Video"],
  [/hbo|max\b/i, "HBO Max"],
  [/disney/i, "Disney+"],
  [/animebox|selecta/i, "AnimeBox"],
  [/onegai/i, "Anime Onegai"],
  [/wakanim/i, "Wakanim"],
  [/bilibili/i, "Bilibili"],
  [/muse/i, "Muse Asia"],
  [/laftel/i, "Laftel"],
];

function plataformasDe(links: unknown): string[] {
  if (!Array.isArray(links)) return [];
  const salida = new Set<string>();
  for (const l of links as { site?: string; type?: string }[]) {
    if (!l?.site || l.type !== "STREAMING") continue;
    for (const [patron, nombre] of EQUIVALENCIAS_PLATAFORMA) {
      if (patron.test(l.site)) salida.add(nombre);
    }
  }
  return [...salida];
}

async function pedirLote(
  titulos: string[],
  tipo?: "ANIME" | "MANGA"
): Promise<Map<string, DatosTitulo>> {
  const resultado = new Map<string, DatosTitulo>();
  if (titulos.length === 0) return resultado;

  /*
   * Se pregunta con Page(...) { media(...) } y NO con Media(...) directo.
   *
   * Este es el motivo, y costó encontrarlo: con Media, si un título no
   * existe AniList responde 404 con "Not Found." y anula la respuesta
   * ENTERA — no devuelve los que sí encontró, devuelve data en blanco.
   * Como los títulos salen de recortar titulares de noticias, en un lote
   * siempre falla alguno, así que ni una noticia llegaba a tener
   * popularidad. El diagnóstico lo dejó claro: estado 404, cero datos.
   *
   * Con Page, "no hay resultados" es una lista vacía, que es una
   * respuesta perfectamente válida. Los títulos que sí existen vienen
   * igual y los que no simplemente traen media: [].
   *
   * Se pide también el id: es lo único que sabe que "Chained Soldier" y
   * "Mato Seihei no Slave" son la misma obra, y con eso se pueden quitar
   * las noticias duplicadas que llegan con el título japonés por un lado
   * y el internacional por otro.
   *
   * El tipo es OPCIONAL a propósito. Para el feed no se filtra, porque
   * muchas noticias son de manga puro sin adaptación todavía y filtrando
   * se quedarían sin datos. Pero para los favoritos hay que pedir ANIME
   * sí o sí: sin filtrar, un título como "Re:ZERO -Starting Life in
   * Another World-" encuentra primero la NOVELA LIGERA, que se llama
   * exactamente igual — y una novela no tiene estudio de animación, así
   * que devolvía la portada del libro y cero estudios. Ese era el motivo
   * de que la sección de Estudios saliera casi vacía teniendo varios
   * favoritos marcados.
   */
  const filtroTipo = tipo ? `, type: ${tipo}` : "";
  const consulta = `query {
${titulos
  .map(
    (t, i) => `  t${i}: Page(perPage: 1) {
    media(search: "${escapar(t)}"${filtroTipo}, sort: SEARCH_MATCH) {
      id
      title { romaji }
      coverImage { extraLarge large }
      popularity
      genres
      studios(isMain: true) { nodes { name } }
    externalLinks { site type }
    }
  }`
  )
  .join("\n")}
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0)",
      },
      body: JSON.stringify({ query: consulta }),
      signal: controller.signal,
    });

    /*
     * Se lee el cuerpo aunque el estado no sea 200: con Page ya no
     * debería fallar, pero si algún día vuelve a hacerlo, mejor
     * aprovechar lo que venga que descartarlo a ciegas.
     */
    const json = await res.json().catch(() => null);

    // Rastro para el diagnóstico (ver arriba).
    ultimoIntentoAniList = {
      estado: res.status,
      error: json?.errors?.[0]?.message ?? null,
      cuantosDatos: json?.data ? Object.values(json.data).filter(Boolean).length : 0,
      ejemploConsulta: titulos[0] ?? null,
    };

    if (!json) return resultado;

    // Con Page, cada alias trae { media: [...] }: una lista con como
    // mucho un resultado, o vacía si no hay coincidencia.
    const data = json?.data ?? {};
    titulos.forEach((t, i) => {
      const m = data[`t${i}`]?.media?.[0];
      if (!m) return;
      resultado.set(claveDe(t), {
        anilistId: typeof m.id === "number" ? m.id : null,
        tituloCanonico: typeof m.title?.romaji === "string" ? m.title.romaji : null,
        coverImageUrl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
        popularity: typeof m.popularity === "number" ? m.popularity : null,
        genres: Array.isArray(m.genres) ? m.genres : [],
        studios: (m.studios?.nodes ?? []).map((s: { name: string }) => s.name),
        platforms: plataformasDe(m.externalLinks),
      });
    });
    return resultado;
  } catch {
    return resultado;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Devuelve popularidad, géneros y estudios de una lista de títulos.
 * Lo que ya esté en memoria no se vuelve a pedir; el resto va en lotes
 * de doce, en paralelo, para no montar una consulta gigante.
 *
 * Con "tipo" se limita la búsqueda a anime o a manga. Los favoritos lo
 * usan con ANIME para no acabar en la ficha de la novela ligera, que se
 * llama igual pero no tiene estudio de animación.
 */
export async function datosDeTitulos(
  titulos: string[],
  tipo?: "ANIME" | "MANGA"
): Promise<Map<string, DatosTitulo>> {
  const ahora = Date.now();
  const salida = new Map<string, DatosTitulo>();
  const pendientes: string[] = [];

  // La caché se reparte por tipo: la ficha del anime y la de la novela
  // del mismo título son distintas, y guardarlas bajo la misma clave
  // haría que la primera que llegara tapara a la otra.
  const claveCache = (t: string) => `${tipo ?? "cualquiera"}:${claveDe(t)}`;

  for (const t of titulos) {
    const clave = claveDe(t);
    if (!clave || salida.has(clave)) continue;
    const guardado = cache.get(claveCache(t));
    if (guardado && guardado.expira > ahora) {
      salida.set(clave, guardado.datos);
    } else if (!pendientes.some((p) => claveDe(p) === clave)) {
      pendientes.push(t);
    }
  }

  const lotes: string[][] = [];
  for (let i = 0; i < pendientes.length; i += 12) lotes.push(pendientes.slice(i, i + 12));

  const respuestas = await Promise.all(lotes.map((lote) => pedirLote(lote, tipo)));
  for (const r of respuestas) {
    for (const [clave, datos] of r) {
      cache.set(`${tipo ?? "cualquiera"}:${clave}`, { datos, expira: ahora + TTL_MS });
      salida.set(clave, datos);
    }
  }

  return salida;
}
