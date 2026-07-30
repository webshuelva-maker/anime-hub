import { NextRequest, NextResponse } from "next/server";
import { findCoverImage, guessSeriesName } from "@/lib/anilist";
import { fetchFullArticle } from "@/lib/articleReader";
import { translateNewsFields } from "@/lib/translate";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const relatedTitle = req.nextUrl.searchParams.get("relatedTitle") ?? "";
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const summary = req.nextUrl.searchParams.get("summary") ?? "";
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const alreadyHasImage = req.nextUrl.searchParams.get("hasImage") === "1";

  // La carátula y el artículo completo son independientes entre sí, así
  // que se piden en paralelo — pero solo para ESTA noticia, no para todas
  // a la vez, para no disparar de golpe decenas de peticiones a AniList.
  const [cover, fullArticle] = await Promise.all([
    alreadyHasImage ? Promise.resolve(null) : findCoverImage(guessSeriesName(relatedTitle)),
    fetchFullArticle(url),
  ]);

  const bodyForTranslation = fullArticle || summary || title;
  const translated = await translateNewsFields(title, summary, bodyForTranslation);

  return NextResponse.json({
    coverImageUrl: cover,
    title: translated?.title ?? null,
    summary: translated?.summary ?? null,
    body: translated?.body ?? fullArticle ?? null,
  });
}
