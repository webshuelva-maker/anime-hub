import { NextRequest, NextResponse } from "next/server";
import { searchAnimeDatabase } from "@/lib/anilist";
import { searchJikanList } from "@/lib/jikan";
import { searchKitsu } from "@/lib/kitsu";
import { MINIMO_COINCIDENCIA, puntuarCoincidencia } from "@/lib/coincidenciaTitulos";

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

  const normalizar = (t: string) =>
    t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

  const vistos = new Set<string>();
  const juntos: typeof anilist.results = [];
  for (const lista of [anilist.results, mal, kitsu]) {
    for (const r of lista) {
      const clave = normalizar(r.title);
      if (!clave || vistos.has(clave)) continue;
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
  const relevantes = juntos
    .map((r) => ({ r, puntos: puntuarCoincidencia(term, r.title) }))
    .filter(({ puntos }) => puntos >= MINIMO_COINCIDENCIA)
    .sort((a, b) => b.puntos - a.puntos)
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
