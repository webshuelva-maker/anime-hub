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
  /** Identificador de la obra en AniList: dos títulos distintos de la misma serie comparten id. */
  anilistId: number | null;
  popularity: number | null;
  genres: string[];
  studios: string[];
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

async function pedirLote(titulos: string[]): Promise<Map<string, DatosTitulo>> {
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
   */
  const consulta = `query {
${titulos
  .map(
    (t, i) => `  t${i}: Page(perPage: 1) {
    media(search: "${escapar(t)}", sort: SEARCH_MATCH) {
      id
      popularity
      genres
      studios(isMain: true) { nodes { name } }
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
        popularity: typeof m.popularity === "number" ? m.popularity : null,
        genres: Array.isArray(m.genres) ? m.genres : [],
        studios: (m.studios?.nodes ?? []).map((s: { name: string }) => s.name),
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
 */
export async function datosDeTitulos(titulos: string[]): Promise<Map<string, DatosTitulo>> {
  const ahora = Date.now();
  const salida = new Map<string, DatosTitulo>();
  const pendientes: string[] = [];

  for (const t of titulos) {
    const clave = claveDe(t);
    if (!clave || salida.has(clave)) continue;
    const guardado = cache.get(clave);
    if (guardado && guardado.expira > ahora) {
      salida.set(clave, guardado.datos);
    } else if (!pendientes.some((p) => claveDe(p) === clave)) {
      pendientes.push(t);
    }
  }

  const lotes: string[][] = [];
  for (let i = 0; i < pendientes.length; i += 12) lotes.push(pendientes.slice(i, i + 12));

  const respuestas = await Promise.all(lotes.map(pedirLote));
  for (const r of respuestas) {
    for (const [clave, datos] of r) {
      cache.set(clave, { datos, expira: ahora + TTL_MS });
      salida.set(clave, datos);
    }
  }

  return salida;
}
