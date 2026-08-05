import { NextRequest, NextResponse } from "next/server";
import { searchAnimeDatabase } from "@/lib/anilist";
import { searchJikanList } from "@/lib/jikan";
import { searchKitsu } from "@/lib/kitsu";
import {
  MINIMO_COINCIDENCIA,
  nucleoDeTitulo,
  puntuarCoincidencia,
} from "@/lib/coincidenciaTitulos";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("q") ?? "";
  /*
   * Se pregunta a las DOS bases a la vez y se juntan los resultados.
   *
   * En cascada no bastaba: AniList limita las peticiones por minuto y la
   * carga del feed consume unas cuantas, así que a veces respondía "sin
   * resultados" en lugar de con un error, y entonces ni siquiera se
   * llegaba a consultar la segunda. Preguntando a las dos siempre, que
   * una falle o esté limitada deja de importar.
   *
   * AniList va primero en la lista porque sus títulos y carátulas
   * encajan mejor con el resto de la app; MyAnimeList añade lo que
   * falte, sin repetir.
   */
  const [anilist, mal, kitsu] = await Promise.all([
    searchAnimeDatabase(term),
    searchJikanList(term).catch(() => []),
    searchKitsu(term).catch(() => []),
  ]);

  /*
   * Quitar repetidos DE VERDAD.
   *
   * Antes la clave era el título entero sin espacios ni signos. Eso solo
   * pilla los repetidos que se escriben exactamente igual, y estas tres
   * bases de datos casi nunca coinciden en cómo llaman a una serie:
   *
   *   AniList  → "Re:ZERO -Starting Life in Another World-"
   *   MAL      → "Re:Zero kara Hajimeru Isekai Seikatsu"
   *   Kitsu    → "Re:Zero - Starting Life in Another World"
   *
   * Tres textos distintos, la misma serie, y las tres se colaban en la
   * lista. De ahí el montón de entradas casi iguales.
   *
   * La clave nueva es NÚCLEO + FORMATO + AÑO. El núcleo es el nombre de
   * la franquicia sin subtítulo, así que los tres ejemplos de arriba dan
   * "re zero" + "TV" + 2016 y se quedan en uno. Y como el formato y el
   * año entran en la clave, la serie, la película y el especial siguen
   * siendo entradas distintas, que es lo correcto: son obras distintas.
   */
  const claveDe = (r: (typeof anilist.results)[number]) =>
    [nucleoDeTitulo(r.title), r.format ?? "?", r.startYear ?? "?"].join("|");

  const vistos = new Set<string>();
  const juntos: typeof anilist.results = [];
  for (const lista of [anilist.results, mal, kitsu]) {
    for (const r of lista) {
      const clave = claveDe(r);
      if (!nucleoDeTitulo(r.title) || vistos.has(clave)) continue;
      vistos.add(clave);
      juntos.push(r);
    }
  }

  /*
   * Se ordena por parecido con lo buscado y se tira lo que no llega al
   * listón.
   *
   * Antes se devolvían tal cual, en el orden en que venían de cada base:
   * si AniList no encontraba nada (le pasa con los títulos oficiales
   * largos y con puntuación), el primer resultado que se enseñaba era el
   * que le sonara de lejos a MyAnimeList. Así es como buscando Re:ZERO
   * salía "How a Realist Hero Rebuilt the Kingdom" — y encima como ficha
   * principal, que es la que usa el resto de la pantalla.
   */
  /*
   * Se ordena por parecido y, a igualdad, la serie de televisión va
   * primero.
   *
   * Ese desempate importa más de lo que parece: buscando el nombre de
   * una franquicia, la obra que la persona tiene en la cabeza es
   * prácticamente siempre la serie, no un especial de siete minutos ni
   * un recopilatorio. Y la primera de la lista es además la que usa el
   * resto de la pantalla (el botón de seguir, el archivo de noticias),
   * así que acertar aquí arregla tres cosas de golpe.
   */
  const pesoFormato = (formato: string | null): number => {
    const f = (formato ?? "").toUpperCase();
    if (f.includes("TV")) return 3;
    if (f.includes("MOVIE") || f.includes("PELÍCULA")) return 2;
    if (f.includes("OVA") || f.includes("ONA")) return 1;
    return 0;
  };

  const relevantes = juntos
    .map((r) => ({ r, puntos: puntuarCoincidencia(term, r.title) }))
    .filter(({ puntos }) => puntos >= MINIMO_COINCIDENCIA)
    .sort(
      (a, b) =>
        b.puntos - a.puntos ||
        pesoFormato(b.r.format) - pesoFormato(a.r.format) ||
        (a.r.startYear ?? 9999) - (b.r.startYear ?? 9999)
    )
    .map(({ r }) => r);

  const fuentes = [
    anilist.results.length > 0 ? "anilist" : null,
    mal.length > 0 ? "myanimelist" : null,
    kitsu.length > 0 ? "kitsu" : null,
  ].filter(Boolean);

  return NextResponse.json({
    results: relevantes.slice(0, 10),
    fuente: fuentes.length > 0 ? fuentes.join("+") : "ninguna",
    // El diagnóstico va SIEMPRE en la respuesta. Llevamos varias vueltas
    // adivinando por qué una búsqueda vuelve vacía; con esto, la app
    // puede enseñar exactamente qué contestó cada base de datos.
    debug: `anilist: ${anilist.debug} | myanimelist: ${mal.length} resultado(s) | kitsu: ${kitsu.length} resultado(s) | ${juntos.length} juntos, ${relevantes.length} relevantes`,
  });
}
