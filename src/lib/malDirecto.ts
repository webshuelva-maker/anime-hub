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

/**
 * Reconoce la dirección de una noticia concreta de MyAnimeList.
 *
 * Acepta la forma absoluta y la RELATIVA. La primera versión solo
 * aceptaba la absoluta y no reconoció nada: escribir enlaces internos en
 * relativo es lo normal en cualquier web, y dar por hecho lo contrario
 * fue una suposición mía sin comprobar.
 */
const ES_NOTICIA = /^(https?:\/\/(www\.)?myanimelist\.net)?\/news\/\d+/i;

/**
 * Tamaño máximo, en caracteres, de lo que puede ser el bloque de UNA
 * noticia. Por encima de esto ya no es una noticia, es la página entera
 * con su menú de navegación.
 */
const LIMITE_BLOQUE = 700;

/** Señales de que lo que ha llegado no es la página, sino un muro. */
function pareceBloqueo(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes("just a moment") ||
    h.includes("cf-browser-verification") ||
    h.includes("challenge-platform") ||
    h.includes("enable javascript and cookies") ||
    h.includes("access denied")
  );
}

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

/**
 * Deja solo el resumen, quitando todo lo que viene pegado en el bloque.
 *
 * Al leer el texto entero del bloque viene el titular, la fecha, la hora
 * con su huso, quién lo publicó y cuántos comentarios tiene. Sin
 * limpiarlo, el resumen empezaba por "Sep 6, 2025 by Sakana | ..." y
 * terminaba con la hora otra vez.
 */
function limpiarResumen(textoBloque: string, titulo: string): string {
  const salida = limpiar(
    textoBloque
      // El propio titular, para que no se repita dentro del resumen.
      .replace(titulo, " ")
      // Fechas, con o sin hora y huso: "Sep 6, 2025 5:30 PM EDT".
      .replace(/[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}(\s+\d{1,2}:\d{2}\s*(AM|PM)?(\s+[A-Z]{2,4})?)?/g, " ")
      // Quién lo publica: "by Sakana |".
      .replace(/\bby\s+\S+\s*\|?/gi, " ")
      // Pies de página que no son resumen.
      .replace(/\b\d+\s+Comments?\b/gi, " ")
      .replace(/\bread more\b/gi, " ")
      // Separadores sueltos que quedan tras los recortes.
      .replace(/\s*\|\s*/g, " ")
  );

  /*
   * Red de seguridad: si lo que ha salido es el MENÚ de MyAnimeList, se
   * tira.
   *
   * Aunque el bloque venga acotado, un cambio de maquetación puede
   * volver a colar la navegación de la web. Y un resumen que pone
   * "Details Characters & Staff Episodes Videos Stats…" no solo no
   * informa: encima se traduce y se cuela en la pantalla con toda la
   * pinta de ser contenido de verdad. Mejor sin resumen que con basura.
   */
  const esMenu =
    /characters?\s*&\s*staff/i.test(salida) ||
    /interest stacks/i.test(salida) ||
    /more info/i.test(salida) ||
    // Las migas de pan del tipo "Inicio > Anime > ..." llevan flechas.
    (salida.match(/>/g) ?? []).length >= 2;

  return esMenu ? "" : salida.slice(0, 240);
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
       * El bloque de ESA noticia, y solo de esa.
       *
       * Antes se cogía `closest("div").parent()`, que subía a un
       * contenedor enorme abarcando media página. Resultado: el resumen
       * se traía el menú entero de MyAnimeList ("Details, Characters &
       * Staff, Episodes, Videos…") y, peor todavía, la fecha era la
       * misma para TODAS las noticias, porque cogía la primera que
       * encontraba en ese contenedor compartido.
       *
       * Ahora se sube desde el enlace de uno en uno y se para en cuanto
       * el bloque tiene texto suficiente para llevar un resumen pero
       * sigue siendo pequeño. Un bloque que se pasa de tamaño ya no es
       * la noticia: es la página.
       */
      let bloque = $(el).parent();
      for (let nivel = 0; nivel < 4; nivel++) {
        const largo = limpiar(bloque.text()).length;
        if (largo > titulo.length + 40 && largo < LIMITE_BLOQUE) break;
        const padre = bloque.parent();
        if (!padre.length) break;
        bloque = padre;
      }

      const textoBloque = limpiar(bloque.text());
      // Si aun así el bloque es descomunal, no se saca resumen de ahí:
      // mejor una noticia sin resumen que una con el menú de la web
      // pegado.
      const resumen =
        textoBloque.length < LIMITE_BLOQUE ? limpiarResumen(textoBloque, titulo) : "";

      noticias.push({
        title: titulo,
        url: limpia.startsWith("http") ? limpia : `https://myanimelist.net${limpia}`,
        // Solo se acepta la fecha si sale del bloque acotado: sacada del
        // contenedor grande, todas las noticias acababan con la misma.
        date: textoBloque.length < LIMITE_BLOQUE ? fechaISO(textoBloque) : null,
        excerpt: resumen,
      });
    });

    /*
     * SEGUNDA ESTRATEGIA, por si la primera no encontró nada.
     *
     * Se buscan los bloques de noticia por su clase y se coge el primer
     * enlace con texto de cada uno. Va después y no antes porque las
     * clases de CSS son lo primero que cambia en un rediseño; esto es el
     * plan B del plan B.
     */
    if (noticias.length === 0) {
      $(".news-unit, .news-list .spaceit_pad, article").each((_, bloque) => {
        if (noticias.length >= limite) return;
        const enlace = $(bloque)
          .find("a")
          .filter((_, a) => limpiar($(a).text()).length >= 15)
          .first();
        const href = enlace.attr("href");
        const titulo = limpiar(enlace.text());
        if (!href || !titulo) return;
        const abs = href.startsWith("http") ? href : `https://myanimelist.net${href}`;
        if (vistas.has(abs)) return;
        vistas.add(abs);
        const texto = limpiar($(bloque).text());
        noticias.push({
          title: titulo,
          url: abs.split("?")[0],
          date: fechaISO(texto),
          excerpt: limpiarResumen(texto, titulo),
        });
      });
    }

    if (noticias.length === 0) {
      /*
       * La página llegó pero no se reconoció nada dentro. Aquí NO vale
       * un mensaje genérico: como este lector va contra el HTML de otra
       * web, hay que decir QUÉ llegó, o afinarlo se vuelve un juego de
       * adivinanzas a ciegas. Con estos cuatro datos se sabe si nos han
       * puesto un muro, si la página vino vacía o si simplemente han
       * cambiado el diseño.
       */
      const enlaces = $("a").length;
      const conNews = $("a").filter((_, a) => ($(a).attr("href") ?? "").includes("/news/")).length;

      if (pareceBloqueo(html)) {
        return {
          ok: false,
          noticias: [],
          motivo: "MyAnimeList devolvió una página de verificación en vez del contenido",
        };
      }

      return {
        ok: false,
        noticias: [],
        motivo: `no se reconoció el contenido (${Math.round(html.length / 1024)} KB, ${enlaces} enlaces, ${conNews} hacia noticias)`,
      };
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
