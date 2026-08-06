import { translateBatch } from "./translateBatch";
import type { JikanNewsItem } from "./jikan";

/**
 * Traduce al español las noticias del archivo de MyAnimeList.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ ES OBLIGATORIO Y NO UN EXTRA
 *
 * Anime Hub es una app en español. Todo el feed llega traducido, así que
 * el archivo era el único sitio donde de pronto aparecían titulares en
 * inglés — y encima presentados con una etiqueta que decía "en inglés",
 * como si fuera normal. Para quien no lee inglés, esa sección
 * sencillamente no servía para nada.
 *
 * Se traduce en el SERVIDOR y no en el navegador a propósito: así el
 * resultado se guarda en la caché de la ruta junto con las noticias, y
 * las siguientes visitas no vuelven a gastar una llamada al traductor.
 * ---------------------------------------------------------------------
 *
 * Si la traducción falla (sin clave de IA configurada, cuota agotada,
 * el servicio caído...) se devuelven las noticias TAL CUAL. Es peor
 * enseñarlas en inglés que en español, pero es mucho peor no enseñar
 * nada: la alternativa sería tirar noticias buenas por un problema
 * momentáneo de otro servicio.
 */
export async function traducirNoticias(noticias: JikanNewsItem[]): Promise<{
  noticias: JikanNewsItem[];
  traducidas: boolean;
}> {
  if (noticias.length === 0) return { noticias, traducidas: false };

  try {
    const traducidas = await translateBatch(
      noticias.map((n, i) => ({
        id: String(i),
        title: n.title,
        summary: n.excerpt,
      }))
    );

    if (traducidas.length === 0) return { noticias, traducidas: false };

    // Se empareja por id y no por posición: el traductor devuelve el
    // mismo orden, pero si algún día no lo hiciera, emparejar a ciegas
    // pondría cada título en la noticia equivocada, que es mucho peor
    // que no traducir.
    const porId = new Map(traducidas.map((t) => [t.id, t]));

    return {
      noticias: noticias.map((n, i) => {
        const t = porId.get(String(i));
        if (!t) return n;
        return {
          ...n,
          title: t.title?.trim() || n.title,
          excerpt: t.summary?.trim() || n.excerpt,
        };
      }),
      traducidas: true,
    };
  } catch {
    return { noticias, traducidas: false };
  }
}
