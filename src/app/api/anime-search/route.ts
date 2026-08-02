import { NextRequest, NextResponse } from "next/server";
import { searchAnimeDatabase } from "@/lib/anilist";
import { searchJikanList } from "@/lib/jikan";
import { searchKitsu } from "@/lib/kitsu";

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

  const fuentes = [
    anilist.results.length > 0 ? "anilist" : null,
    mal.length > 0 ? "myanimelist" : null,
    kitsu.length > 0 ? "kitsu" : null,
  ].filter(Boolean);

  return NextResponse.json({
    results: juntos.slice(0, 10),
    fuente: fuentes.length > 0 ? fuentes.join("+") : "ninguna",
    // El diagnóstico va SIEMPRE en la respuesta. Llevamos varias vueltas
    // adivinando por qué una búsqueda vuelve vacía; con esto, la app
    // puede enseñar exactamente qué contestó cada base de datos.
    debug: `anilist: ${anilist.debug} | myanimelist: ${mal.length} resultado(s) | kitsu: ${kitsu.length} resultado(s)`,
  });
}
