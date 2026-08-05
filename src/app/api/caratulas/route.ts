import { NextRequest, NextResponse } from "next/server";
import { datosDeTitulos } from "@/lib/popularity";

export const maxDuration = 20;

/**
 * Carátulas para una lista de títulos de anime.
 *
 * Reutiliza datosDeTitulos, que es lo mismo que usa el feed para ordenar
 * por popularidad: una sola consulta a AniList con alias, en lotes, y
 * con caché de horas. O sea que pedir las carátulas de lo que dos
 * personas tienen en común no añade ni una petición extra a AniList si
 * esas series ya han salido en las noticias — que es lo normal.
 *
 * Va en el servidor y no en el navegador para aprovechar esa caché
 * compartida entre todos los usuarios: si dos personas comparten One
 * Piece, se pregunta una vez para toda la app y no una por visita.
 */
export async function GET(request: NextRequest) {
  const crudo = request.nextUrl.searchParams.get("titulos") ?? "";
  const titulos = crudo
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (titulos.length === 0) {
    return NextResponse.json({ caratulas: {} });
  }

  try {
    const datos = await datosDeTitulos(titulos);
    const caratulas: Record<string, string> = {};

    for (const titulo of titulos) {
      /*
       * datosDeTitulos indexa por la MISMA clave que se le pide (el
       * título tal cual, en minúsculas y sin espacios sobrantes) — es lo
       * que busca dentro, no lo que AniList devuelve. Antes esto
       * recorría todo lo devuelto comparando por inclusión de texto
       * contra tituloCanonico (el romaji de AniList), y eso solo
       * coincide cuando el romaji es igual al título que se escribió.
       * En cuanto difieren — "Re:ZERO -Starting Life in Another World-"
       * es "Re:Zero kara Hajimeru Isekai Seikatsu" en romaji, "Kaiju No.
       * 8" es "Kaijuu 8-gou" — ninguna cadena contiene a la otra y la
       * carátula se perdía en silencio, aunque el dato sí había llegado.
       */
      const valor = datos.get(titulo.toLowerCase().trim());
      if (valor?.coverImageUrl) caratulas[titulo] = valor.coverImageUrl;
    }

    return NextResponse.json(
      { caratulas },
      // Una hora en la caché del navegador: las carátulas no cambian.
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch {
    // Sin carátulas la ficha se ve igual, solo con las etiquetas de
    // texto de siempre. No es motivo para devolver un error.
    return NextResponse.json({ caratulas: {} });
  }
}
