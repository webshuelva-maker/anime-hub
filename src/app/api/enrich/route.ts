import { NextRequest, NextResponse } from "next/server";
import { findCoverImage, guessSeriesName } from "@/lib/anilist";
import { fetchArticlePage } from "@/lib/articleReader";

export const runtime = "nodejs";

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
    return NextResponse.json({ coverImageUrl: null });
  }

  const [aniListCover, article] = await Promise.all([
    findCoverImage(guessSeriesName(relatedTitle)),
    fetchArticlePage(url),
  ]);

  // Preferimos la carátula oficial de AniList; si no hay, la propia imagen
  // de la página del artículo (og:image, casi siempre presente).
  const coverImageUrl = aniListCover || article.image || null;

  return NextResponse.json({ coverImageUrl });
}
