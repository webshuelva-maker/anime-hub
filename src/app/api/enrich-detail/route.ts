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
  /*
   * Las noticias en español se devuelven ENTERAS (hasta 20.000
   * caracteres, que da para cualquier artículo largo). No van a pasar
   * por la IA, así que no hay motivo para recortarlas: cortarlas era lo
   * que hacía que todas terminaran en puntos suspensivos y hubiera que
   * ir a la web original para leerlas.
   *
   * Las que todavía haya que traducir mantienen un límite prudente,
   * porque ahí el texto sí se manda al modelo y uno muy largo agota el
   * tiempo de la función.
   */
  const esEspanol = req.nextUrl.searchParams.get("lang") === "es";
  const article = await fetchArticlePage(url, esEspanol ? 20000 : 2500);

  return NextResponse.json({
    coverImageUrl: article.image,
    articleText: article.text,
  });
}
