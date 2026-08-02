import { NextRequest, NextResponse } from "next/server";
import { searchAnimeDatabase } from "@/lib/anilist";
import { searchJikanList } from "@/lib/jikan";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("q") ?? "";
  const { results, debug } = await searchAnimeDatabase(term);

  // Si AniList no devuelve nada, se pregunta a MyAnimeList antes de dar
  // por hecho que ese anime no existe. AniList limita las peticiones por
  // minuto y la carga del feed consume unas cuantas: justo después de
  // abrir la app, una búsqueda perfectamente válida podía volver vacía y
  // el usuario leía "no hay ningún anime con ese nombre" para títulos que
  // existen. El campo "fuente" dice cuál ha respondido, para poder
  // diagnosticarlo sin adivinar.
  if (results.length > 0) {
    return NextResponse.json({ results, fuente: "anilist", debug });
  }

  const respaldo = await searchJikanList(term);
  return NextResponse.json({
    results: respaldo,
    fuente: respaldo.length > 0 ? "myanimelist" : "ninguna",
    debug: `anilist: ${debug} | myanimelist: ${respaldo.length} resultado(s)`,
  });
}
