import { NextRequest, NextResponse } from "next/server";
import { searchAnimeDatabase } from "@/lib/anilist";
import { searchJikanList } from "@/lib/jikan";

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
  const [anilist, mal] = await Promise.all([
    searchAnimeDatabase(term),
    searchJikanList(term).catch(() => []),
  ]);

  const normalizar = (t: string) =>
    t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

  const vistos = new Set(anilist.results.map((r) => normalizar(r.title)));
  const extra = mal.filter((r) => !vistos.has(normalizar(r.title)));

  return NextResponse.json({
    results: [...anilist.results, ...extra].slice(0, 10),
    fuente:
      anilist.results.length > 0
        ? extra.length > 0
          ? "ambas"
          : "anilist"
        : extra.length > 0
          ? "myanimelist"
          : "ninguna",
    debug: `anilist: ${anilist.debug} | myanimelist: ${mal.length} resultado(s)`,
  });
}
