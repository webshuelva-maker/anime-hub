import * as cheerio from "cheerio";
import type { JikanNewsItem } from "./jikan";

/**
 * Lee las noticias de una serie directamente de la página de
 * MyAnimeList, sin pasar por Jikan.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ EXISTE ESTO
 *
 * Jikan (la API pública de MyAnimeList) arrastra un fallo conocido y
 * abierto: devuelve 504 de forma intermitente porque no consigue hablar
 * con MyAnimeList. Cuando le da por fallar, no hay nada que arreglar
 * desde aquí y el archivo de noticias se queda inservible.
 *
 * Pero la web de MyAnimeList SÍ funciona en esos momentos. Y lo que hace
 * Jikan por dentro es exactamente esto: leer esa página. Así que cuando
 * su API falla, se lee la página igual que haría un navegador.
 *
 * ES UN PLAN B, NO EL CAMINO PRINCIPAL. Solo se usa cuando Jikan ha
 * fallado, por dos motivos: su API es más estable de interpretar que un
 * HTML que ellos pueden rediseñar cuando quieran, y machacar la web con
 * peticiones automáticas es peor vecino que usar la API que han hecho
 * justo para esto.
 * ---------------------------------------------------------------------
 *
 * SOBRE LA FRAGILIDAD. Leer HTML ajeno se rompe el día que cambian el
 * diseño. Para aguantar lo máximo posible NO se buscan clases de CSS
 * concretas (que es lo primero que cambia en un rediseño), sino la forma
 * del contenido: enlaces que apuntan a una noticia de MyAnimeList. Esa
 * estructura de direcciones lleva años igual y es lo último que suelen
 * tocar.
 */

const CABECERAS_NAVEGADOR = {
  // MyAnimeList rechaza a quien no se identifica como navegador. Este
  // proyecto ya se topó con lo mismo en varios canales RSS que devolvían
  // 403 hasta que se les mandaron cabeceras de navegador.
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Reconoce la dirección de una noticia concreta de MyAnimeList. */
const ES_NOTICIA = /myanimelist\.net\/news\/\d+/i;

/**
 * Fechas tal y como las escribe MyAnimeList: "Sep 6, 2019 5:30 PM EDT".
 * Se coge solo la parte de la fecha; la hora y el huso no aportan nada
 * para ordenar noticias de hace meses.
 */
const FECHA = /([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/;

const MESES: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function fechaISO(texto: string): string | null {
  const m = FECHA.exec(texto);
  if (!m) return null;
  const mes = MESES[m[1]];
  if (mes === undefined) return null;
  const d = new Date(Date.UTC(Number(m[3]), mes, Number(m[2])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function limpiar(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

export interface ResultadoDirecto {
  ok: boolean;
  noticias: JikanNewsItem[];
  motivo: string | null;
}

/**
 * Devuelve las noticias que MyAnimeList publica en la página de esa
 * serie. `ok` en false significa que no se pudo ni leer la página.
 */
export async function noticiasDesdeMal(malId: number, limite = 8): Promise<ResultadoDirecto> {
  /*
   * La dirección base se puede cambiar por variable de entorno, igual
   * que la de Jikan: es lo que permite probar este lector contra una
   * página de mentira sin depender de que MyAnimeList esté accesible.
   */
  const base = process.env.MAL_WEB_BASE || "https://myanimelist.net";
  const url = `${base}/anime/${malId}/_/news`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, { signal: controller.signal, headers: CABECERAS_NAVEGADOR });

    if (!res.ok) {
      return {
        ok: false,
        noticias: [],
        motivo:
          res.status === 403 || res.status === 429
            ? `MyAnimeList rechaza la lectura directa (${res.status})`
            : `la página de MyAnimeList respondió ${res.status}`,
      };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const vistas = new Set<string>();
    const noticias: JikanNewsItem[] = [];

    $("a").each((_, el) => {
      if (noticias.length >= limite) return;

      const href = $(el).attr("href") ?? "";
      if (!ES_NOTICIA.test(href)) return;

      const titulo = limpiar($(el).text());
      /*
       * En la página, cada noticia aparece enlazada VARIAS veces: la
       * imagen, el titular y a veces un "leer más". Solo interesa el
       * enlace que lleva el titular escrito, así que se descartan los
       * que traen texto vacío o demasiado corto para ser un título.
       */
      if (titulo.length < 15) return;

      const limpia = href.split("?")[0];
      if (vistas.has(limpia)) return;
      vistas.add(limpia);

      /*
       * El resumen y la fecha viven en el bloque que envuelve al enlace.
       * Se sube un par de niveles y se lee su texto, en vez de depender
       * de nombres de clase concretos.
       */
      const bloque = $(el).closest("div").parent();
      const textoBloque = limpiar(bloque.text());

      /*
       * De ese bloque hay que quitar todo lo que no es resumen.
       *
       * Al leer el texto entero del bloque viene pegado el titular, la
       * fecha, la hora con su huso, quién lo publicó y cuántos
       * comentarios tiene. Sin limpiarlo, el resumen empezaba por
       * "Sep 6, 2025 by Sakana | ..." y terminaba con la hora otra vez:
       * ilegible, y encima la parte en inglés que sí sobreviviría a la
       * traducción por ser nombres propios y fechas.
       */
      const resumen = limpiar(
        textoBloque
          // El propio titular, para que no se repita dentro del resumen.
          .replace(titulo, " ")
          // Fechas, con o sin hora y huso: "Sep 6, 2025 5:30 PM EDT".
          .replace(
            /[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}(\s+\d{1,2}:\d{2}\s*(AM|PM)?(\s+[A-Z]{2,4})?)?/g,
            " "
          )
          // Quién lo publica: "by Sakana |".
          .replace(/\bby\s+\S+\s*\|?/gi, " ")
          // Pies de página que no son resumen.
          .replace(/\b\d+\s+Comments?\b/gi, " ")
          .replace(/\bread more\b/gi, " ")
          // Separadores sueltos que quedan tras los recortes.
          .replace(/\s*\|\s*/g, " ")
      ).slice(0, 240);

      noticias.push({
        title: titulo,
        url: limpia.startsWith("http") ? limpia : `https://myanimelist.net${limpia}`,
        date: fechaISO(textoBloque),
        excerpt: resumen,
      });
    });

    if (noticias.length === 0) {
      /*
       * La página se ha leído pero no se ha reconocido nada. Casi
       * siempre significa que han cambiado el diseño, y decirlo así
       * ahorra buscar el fallo en la red.
       */
      return { ok: false, noticias: [], motivo: "no se reconoció el contenido de MyAnimeList" };
    }

    return { ok: true, noticias, motivo: null };
  } catch (e) {
    const nombre = e instanceof Error ? e.name : "";
    return {
      ok: false,
      noticias: [],
      motivo:
        nombre === "AbortError"
          ? "MyAnimeList no respondió a tiempo"
          : "no se pudo abrir la página de MyAnimeList",
    };
  } finally {
    clearTimeout(timeout);
  }
}
