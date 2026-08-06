import { NextRequest, NextResponse } from "next/server";
import {
  getJikanNewsConEstado,
  searchJikanAnimeConEstado,
  type JikanNewsItem,
} from "@/lib/jikan";
import { nucleoDeTitulo } from "@/lib/coincidenciaTitulos";
import { searchAnimeDatabase } from "@/lib/anilist";
import { noticiasDesdeMal } from "@/lib/malDirecto";
import { traducirNoticias } from "@/lib/traducirArchivo";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * El archivo de noticias de una serie concreta.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ ESTA FUENTE Y NO UN BUSCADOR WEB
 *
 * El feed vive de canales RSS, y un RSS solo publica lo reciente: no hay
 * forma de pedirle lo de hace tres meses. La alternativa evidente sería
 * un buscador web (Google, Bing, Brave), pero todos cobran por volumen y
 * devuelven páginas sueltas que luego hay que interpretar.
 *
 * MyAnimeList mantiene, para CADA serie, su propio historial de noticias
 * con fecha. Y Jikan lo expone gratis, sin clave y sin registro. O sea:
 * la respuesta ya viene ordenada, fechada y referida al título exacto,
 * en vez de tener que adivinar si un resultado de búsqueda hablaba de la
 * serie que era. Para esto es mejor fuente que un buscador, no un apaño
 * más barato.
 *
 * SOBRE EL GASTO. Jikan permite 60 peticiones por minuto para todo el
 * mundo que la use, así que el respeto no es opcional:
 *
 *  - Cada consulta son DOS llamadas (encontrar la serie y pedir sus
 *    noticias), así que el resultado se guarda seis horas. El historial
 *    de una serie no cambia de un minuto a otro.
 *  - Se guarda TAMBIÉN cuando no hay nada. Sin eso, las series sin
 *    noticias serían justo las que preguntarían una y otra vez.
 *  - Y solo se llama cuando el feed no ha encontrado nada por su cuenta.
 * ---------------------------------------------------------------------
 */

interface Guardado {
  noticias: JikanNewsItem[];
  hasta: number;
}

const cache = new Map<string, Guardado>();
const SEIS_HORAS = 6 * 60 * 60 * 1000;
const MEDIA_HORA = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  const titulo = (req.nextUrl.searchParams.get("titulo") ?? "").trim();
  if (titulo.length < 2) {
    return NextResponse.json({ noticias: [] });
  }

  // Si quien llama ya sabe el identificador de MyAnimeList, se ahorra la
  // consulta de búsqueda: media espera menos y una petición menos contra
  // su límite.
  const malIdDado = Number(req.nextUrl.searchParams.get("malId") ?? "");
  const clave = titulo.toLowerCase();
  const guardado = cache.get(clave);
  if (guardado && guardado.hasta > Date.now()) {
    return NextResponse.json({ noticias: guardado.noticias, deCache: true });
  }

  try {
    let ficha: { malId: number; title: string; url: string | null } | null = null;
    let motivoBusqueda: string | null = null;

    if (Number.isFinite(malIdDado) && malIdDado > 0) {
      ficha = { malId: malIdDado, title: titulo, url: null };
    } else {
      /*
       * PRIMERO ANILIST, y solo después MyAnimeList.
       *
       * AniList publica el identificador de MyAnimeList de cada obra, y
       * su servicio funciona. Preguntarle a MyAnimeList "¿cuál es tu
       * identificador para esta serie?" cuando MyAnimeList es
       * precisamente lo que está caído era garantizar el fallo: se
       * quedaba aquí, devolvía "no responde" y NI SIQUIERA llegaba a
       * intentar leer su página, que es el plan B que existe justo para
       * estos momentos.
       *
       * Con esto, el archivo solo depende de MyAnimeList para lo único
       * que solo él tiene: las noticias.
       */
      const enAniList = await searchAnimeDatabase(titulo);
      const conMal = enAniList.results.find((r) => r.malId);
      if (conMal?.malId) {
        ficha = { malId: conMal.malId, title: conMal.title, url: null };
      }
    }

    if (!ficha && !(Number.isFinite(malIdDado) && malIdDado > 0)) {
      const r = await searchJikanAnimeConEstado(titulo);
      motivoBusqueda = r.motivo;
      if (r.ficha) ficha = { malId: r.ficha.malId, title: r.ficha.title, url: r.ficha.url };

      /*
       * Segundo intento con el nombre a secas.
       *
       * Los títulos oficiales largos son los que peor buscan: "Re:ZERO
       * -Starting Life in Another World-" mete tantas palabras que
       * MyAnimeList puede no devolver nada aunque la serie esté ahí de
       * sobra. Solo se reintenta si el primero volvió VACÍO habiendo
       * podido preguntar; si el problema fue de conexión, insistir con
       * otro texto no arregla nada y solo gasta otra petición.
       */
      if (!ficha && r.ok) {
        const nucleo = nucleoDeTitulo(titulo);
        if (nucleo && nucleo.length >= 3 && nucleo.toLowerCase() !== titulo.toLowerCase()) {
          const r2 = await searchJikanAnimeConEstado(nucleo);
          if (r2.ficha) {
            ficha = { malId: r2.ficha.malId, title: r2.ficha.title, url: r2.ficha.url };
            motivoBusqueda = null;
          } else {
            motivoBusqueda = r2.motivo ?? motivoBusqueda;
          }
        }
      }
    }

    if (!ficha) {
      /*
       * Aquí se decía siempre "no se encontró la serie", y era engañoso:
       * también se llegaba cuando la consulta ni siquiera había podido
       * hacerse. Ahora el motivo viene de la propia consulta y distingue
       * "MyAnimeList no tiene esa serie" de "no se pudo conectar".
       */
      return NextResponse.json({
        noticias: [],
        fallo: true,
        motivo: motivoBusqueda ?? "no se pudo consultar MyAnimeList",
      });
    }

    let { ok, noticias, motivo } = await getJikanNewsConEstado(ficha.malId, 8);
    let via = "jikan";

    /*
     * PLAN B: leer la página de MyAnimeList directamente.
     *
     * Su API (Jikan) arrastra un fallo abierto de errores 504
     * intermitentes porque no consigue hablar con MyAnimeList. Cuando
     * eso pasa, la web de MyAnimeList sigue en pie perfectamente, así
     * que se lee de ahí — que es justo lo que hace Jikan por dentro.
     *
     * Solo cuando la API ha fallado, nunca antes: su API es más estable
     * de interpretar que un HTML que pueden rediseñar cuando quieran, y
     * es mejor vecino usar la vía que han hecho para esto.
     */
    if (!ok) {
      const directo = await noticiasDesdeMal(ficha.malId, 8);
      if (directo.ok && directo.noticias.length > 0) {
        ok = true;
        noticias = directo.noticias;
        motivo = null;
        via = "web de MyAnimeList";
      } else if (directo.motivo) {
        // Se cuentan los dos fracasos: saber que han fallado LAS DOS
        // vías, y por qué cada una, es lo que evita otra ronda de
        // adivinanzas.
        motivo = `${motivo} · lectura directa: ${directo.motivo}`;
      }
    }

    /*
     * Al español SIEMPRE, antes de guardar en caché.
     *
     * Esta era la única parte de la app donde aparecía texto en inglés.
     * Traducir aquí y no en el navegador hace que la traducción se
     * guarde junto con las noticias, así que solo se paga una vez por
     * serie y no en cada visita.
     */
    /*
     * De la más reciente a la más antigua.
     *
     * MyAnimeList no siempre las devuelve ordenadas, y el archivo se
     * consulta justo para enterarse de lo ÚLTIMO que se anunció. Que lo
     * primero que se vea sea una noticia de hace cuatro años, con lo
     * reciente enterrado abajo, es lo contrario de lo que hace falta.
     * Las que no traen fecha van al final: sin fecha no se puede afirmar
     * que sean recientes, y colarlas arriba sería mentir.
     */
    noticias = [...noticias].sort((a, b) => {
      const fa = a.date ? Date.parse(a.date) : 0;
      const fb = b.date ? Date.parse(b.date) : 0;
      return fb - fa;
    });

    let traducidas = false;
    if (ok && noticias.length > 0) {
      const r = await traducirNoticias(noticias);
      noticias = r.noticias;
      traducidas = r.traducidas;
    }

    /*
     * Solo se guarda lo que ES una respuesta.
     *
     * Antes se guardaba también el vacío que dejaba un fallo, y eso
     * convertía un tropiezo pasajero en seis horas de "esta serie no
     * tiene noticias". Que es justo lo que pasaba con Violet Evergarden:
     * la app hace tres consultas seguidas a MyAnimeList al buscar (la
     * ficha y las dos del archivo), roza su límite de tres por segundo,
     * y la que se caía se quedaba archivada como si fuera la verdad.
     *
     * Un vacío de verdad se guarda menos tiempo que un resultado: una
     * serie sin noticias hoy puede tenerlas mañana.
     */
    if (ok) {
      cache.set(clave, {
        noticias,
        hasta: Date.now() + (noticias.length > 0 ? SEIS_HORAS : MEDIA_HORA),
      });
    }

    /*
     * Aunque la consulta falle, se devuelve el enlace al archivo en la
     * web de MyAnimeList, que se puede construir solo con el id.
     *
     * Es lo que convierte un callejón sin salida en un desvío: Jikan
     * arrastra un fallo conocido de errores 504 intermitentes, y cuando
     * le da por fallar no hay nada que hacer desde aquí. Pero la página
     * de MyAnimeList sí funciona, así que al menos se puede ofrecer ir
     * directamente a ella en vez de dejar al usuario con un error y un
     * botón de reintentar que a lo mejor tampoco funciona.
     */
    const archivoEnMal = `https://myanimelist.net/anime/${ficha.malId}/_/news`;

    return NextResponse.json(
      {
        noticias,
        serie: ficha.title,
        malUrl: ficha.url,
        archivoUrl: archivoEnMal,
        via,
        traducidas,
        fallo: !ok,
        motivo: ok ? null : `${motivo ?? "desconocido"} · id ${ficha.malId}`,
      },
      { headers: { "Cache-Control": ok ? "public, max-age=3600" : "no-store" } }
    );
  } catch (e) {
    // Que falle esto no puede romper la búsqueda: es un extra.
    return NextResponse.json({
      noticias: [],
      fallo: true,
      motivo: e instanceof Error ? e.message.slice(0, 80) : "error inesperado",
    });
  }
}
