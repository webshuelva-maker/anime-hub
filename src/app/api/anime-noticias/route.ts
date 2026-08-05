import { NextRequest, NextResponse } from "next/server";
import { getJikanNewsConEstado, searchJikanAnime, type JikanNewsItem } from "@/lib/jikan";

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
    const ficha =
      Number.isFinite(malIdDado) && malIdDado > 0
        ? { malId: malIdDado, title: titulo, url: null as string | null }
        : await searchJikanAnime(titulo);

    if (!ficha) {
      // No se guarda: puede que la consulta ni siquiera se haya hecho.
      return NextResponse.json({
        noticias: [],
        fallo: true,
        motivo: "no se encontró la serie en MyAnimeList",
      });
    }

    const { ok, noticias, motivo } = await getJikanNewsConEstado(ficha.malId, 8);

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

    return NextResponse.json(
      {
        noticias,
        serie: ficha.title,
        malUrl: ficha.url,
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
