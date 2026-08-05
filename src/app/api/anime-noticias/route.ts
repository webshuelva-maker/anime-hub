import { NextRequest, NextResponse } from "next/server";
import { getJikanNews, searchJikanAnime, type JikanNewsItem } from "@/lib/jikan";

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

export async function GET(req: NextRequest) {
  const titulo = (req.nextUrl.searchParams.get("titulo") ?? "").trim();
  if (titulo.length < 2) {
    return NextResponse.json({ noticias: [] });
  }

  const clave = titulo.toLowerCase();
  const guardado = cache.get(clave);
  if (guardado && guardado.hasta > Date.now()) {
    return NextResponse.json({ noticias: guardado.noticias, deCache: true });
  }

  try {
    const ficha = await searchJikanAnime(titulo);
    if (!ficha) {
      cache.set(clave, { noticias: [], hasta: Date.now() + SEIS_HORAS });
      return NextResponse.json({ noticias: [] });
    }

    const noticias = await getJikanNews(ficha.malId, 8);
    cache.set(clave, { noticias, hasta: Date.now() + SEIS_HORAS });

    return NextResponse.json(
      { noticias, serie: ficha.title, malUrl: ficha.url },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch {
    // Que falle esto no puede romper la búsqueda: es un extra.
    return NextResponse.json({ noticias: [] });
  }
}
