import { NextRequest, NextResponse } from "next/server";
import { findCoverImage, guessSeriesName } from "@/lib/anilist";
import { fetchArticlePage } from "@/lib/articleReader";
import { translateNewsFields } from "@/lib/translate";

export const runtime = "nodejs";

/**
 * Enriquecimiento RÁPIDO para una tarjeta de la lista: carátula + título y
 * resumen traducidos. El artículo completo (más lento) se pide aparte,
 * solo cuando el usuario abre esa noticia — ver /api/enrich-detail.
 */
export async function GET(req: NextRequest) {
  const relatedTitle = req.nextUrl.searchParams.get("relatedTitle") ?? "";
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const summary = req.nextUrl.searchParams.get("summary") ?? "";
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const alreadyHasImage = req.nextUrl.searchParams.get("hasImage") === "1";

  const [aniListCover, article] = await Promise.all([
    alreadyHasImage ? Promise.resolve(null) : findCoverImage(guessSeriesName(relatedTitle)),
    alreadyHasImage ? Promise.resolve({ text: null, image: null }) : fetchArticlePage(url),
  ]);

  // Preferimos la carátula oficial de AniList; si no hay, la propia imagen
  // de la página del artículo (og:image, casi siempre presente).
  const coverImageUrl = aniListCover || article.image || null;

  const { result: translated, debug: translateDebug } = await translateNewsFields(title, summary, summary || title);

  return NextResponse.json({
    coverImageUrl,
    title: translated?.title ?? null,
    summary: translated?.summary ?? null,
    translateDebug,
  });
}
