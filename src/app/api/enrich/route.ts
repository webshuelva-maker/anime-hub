import { NextRequest, NextResponse } from "next/server";
import { findCoverImage, guessSeriesName } from "@/lib/anilist";
import { fetchArticlePage } from "@/lib/articleReader";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

/**
 * Solo la carátula, rápido — la traducción se pide APARTE (ver
 * /api/enrich-translate), para que una traducción lenta nunca retenga una
 * imagen que ya está lista.
 */
export async function GET(req: NextRequest) {
  const relatedTitle = req.nextUrl.searchParams.get("relatedTitle") ?? "";
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const alreadyHasImage = req.nextUrl.searchParams.get("hasImage") === "1";

  if (alreadyHasImage) {
    const match = await findCoverImage(guessSeriesName(relatedTitle));
    const prominence: "mainstream" | "indie" | null = match.popularity === null ? null : match.popularity >= 20000 ? "mainstream" : "indie";
    return NextResponse.json({ coverImageUrl: null, popularity: match.popularity, prominence });
  }

  const [aniListMatch, article] = await Promise.all([
    findCoverImage(guessSeriesName(relatedTitle)),
    fetchArticlePage(url),
  ]);

  // Preferimos la carátula oficial de AniList; si no hay, la propia imagen
  // de la página del artículo (og:image, casi siempre presente).
  const coverImageUrl = aniListMatch.coverImageUrl || article.image || null;

  // "popularity" de AniList = cuánta gente tiene ese título en su lista —
  // un proxy razonable de lo conocido que es. El corte en 20.000 es una
  // estimación (grandes franquicias suelen estar muy por encima; series
  // de nicho, muy por debajo) — se puede ajustar si hace falta.
  const popularity = aniListMatch.popularity;
  const prominence: "mainstream" | "indie" | null = popularity === null ? null : popularity >= 20000 ? "mainstream" : "indie";

  return NextResponse.json({ coverImageUrl, popularity, prominence });
}
