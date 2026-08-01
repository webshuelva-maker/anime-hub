import { NextRequest, NextResponse } from "next/server";
import { fetchArticlePage } from "@/lib/articleReader";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

/**
 * Solo descarga el artículo original (rápido) — la traducción se pide
 * APARTE en /api/translate-detail, igual que ya se hace con las
 * tarjetas de la lista (/api/enrich + /api/translate-batch). Antes esta
 * misma ruta hacía scrape + traducción en una sola llamada, y esa
 * traducción (con reintento + modelo de respaldo, hasta ~50s en el peor
 * caso) muchas veces agotaba el tiempo máximo de la función serverless
 * de Netlify antes de terminar — la función moría a medias y el
 * artículo casi nunca llegaba completo.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const article = await fetchArticlePage(url);

  return NextResponse.json({
    coverImageUrl: article.image,
    articleText: article.text,
  });
}
