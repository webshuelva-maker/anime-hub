import { NextRequest, NextResponse } from "next/server";
import { fetchArticlePage } from "@/lib/articleReader";
import { translateNewsFields } from "@/lib/translate";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const summary = req.nextUrl.searchParams.get("summary") ?? "";
  const url = req.nextUrl.searchParams.get("url") ?? "";

  const article = await fetchArticlePage(url);
  const bodyForTranslation = article.text || summary || title;

  const { result: translated, debug: translateDebug } = await translateNewsFields(title, summary, bodyForTranslation);

  return NextResponse.json({
    coverImageUrl: article.image,
    body: translated?.body ?? article.text ?? null,
    translateDebug,
  });
}
