import { NextRequest, NextResponse } from "next/server";
import { datosDeTitulos, variantesDeBusqueda } from "@/lib/popularity";

export const maxDuration = 20;

/**
 * Datos de ficha (carátula, géneros y estudios) para una lista de
 * títulos de anime.
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
 *
 * Devuelve también géneros y estudios porque es exactamente la misma
 * consulta: con eso, "Tus gustos" puede rellenar la afinidad de estudios
 * de los favoritos que ya tenías marcados de antes, sin pedir nada nuevo.
 */
export async function GET(request: NextRequest) {
  const crudo = request.nextUrl.searchParams.get("titulos") ?? "";
  const titulos = crudo
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (titulos.length === 0) {
    return NextResponse.json({ caratulas: {}, datos: {} });
  }

  try {
    const datos = await datosDeTitulos(titulos);

    const caratulas: Record<string, string> = {};
    const fichas: Record<string, { genres: string[]; studios: string[] }> = {};

    for (const titulo of titulos) {
      /*
       * datosDeTitulos indexa por la MISMA clave que se le pide (el
       * título tal cual, en minúsculas y sin espacios sobrantes) — es lo
       * que busca dentro, no lo que AniList devuelve. Antes esto
       * recorría todo lo devuelto comparando por inclusión de texto
       * contra tituloCanonico (el romaji de AniList), y eso solo
       * coincide cuando el romaji es igual al título que se escribió.
       * En cuanto difieren — "Re:ZERO -Starting Life in Another World-"
       * es "Re:Zero kara Hajimeru Isekai Seikatsu" en romaji — ninguna
       * cadena contiene a la otra y la carátula se perdía en silencio.
       */
      const valor = datos.get(titulo.toLowerCase().trim());
      if (!valor) continue;
      if (valor.coverImageUrl) caratulas[titulo] = valor.coverImageUrl;
      fichas[titulo] = { genres: valor.genres, studios: valor.studios };
    }

    /*
     * Segunda pasada para lo que AniList no ha encontrado con el título
     * completo. Los nombres oficiales largos son justo los que peor
     * buscan, así que se reintenta con el título recortado (sin
     * subtítulo, sin marcas de temporada). Solo se consulta lo que ha
     * fallado, y en la mayoría de visitas esta lista está vacía.
     */
    const faltan = titulos.filter((t) => !caratulas[t]);
    if (faltan.length > 0) {
      const porVariante = new Map<string, string>();
      for (const titulo of faltan) {
        for (const v of variantesDeBusqueda(titulo)) {
          if (!porVariante.has(v.toLowerCase())) porVariante.set(v.toLowerCase(), titulo);
        }
      }

      const variantes = [...porVariante.keys()];
      if (variantes.length > 0) {
        const segundos = await datosDeTitulos(variantes);
        for (const [clave, original] of porVariante) {
          if (caratulas[original]) continue;
          const valor = segundos.get(clave);
          if (!valor) continue;
          if (valor.coverImageUrl) caratulas[original] = valor.coverImageUrl;
          // Los géneros y estudios solo se completan si no los había ya:
          // la búsqueda recortada es menos precisa que la exacta.
          if (!fichas[original] && (valor.genres.length > 0 || valor.studios.length > 0)) {
            fichas[original] = { genres: valor.genres, studios: valor.studios };
          }
        }
      }
    }

    const completo = titulos.every((t) => caratulas[t]);

    return NextResponse.json(
      { caratulas, datos: fichas },
      {
        /*
         * Solo se cachea cuando se ha resuelto TODO. Antes se mandaba
         * siempre una hora de caché, así que una respuesta incompleta
         * (por un fallo puntual de AniList, o por el error de emparejado
         * que había aquí) se quedaba pegada en el navegador durante una
         * hora: aunque el servidor ya estuviera arreglado, seguías
         * viendo los huecos sin carátula.
         */
        headers: {
          "Cache-Control": completo ? "public, max-age=3600" : "no-store",
        },
      }
    );
  } catch {
    // Sin carátulas la ficha se ve igual, solo con las etiquetas de
    // texto de siempre. No es motivo para devolver un error.
    return NextResponse.json({ caratulas: {}, datos: {} }, { headers: { "Cache-Control": "no-store" } });
  }
}
