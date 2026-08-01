import { NextRequest, NextResponse } from "next/server";
import { getAnimeFacts } from "@/lib/animeFacts";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Ficha rápida de un anime (géneros, estudio, popularidad). La usa el
 * cliente cuando Ren detecta que el usuario se ha interesado por una
 * serie, para saber QUÉ géneros y estudios reforzar en la afinidad —
 * sin esto solo podríamos guardar el título suelto, que no ayuda a
 * ordenar el feed.
 */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const facts = await getAnimeFacts(title);
  if (!facts) return NextResponse.json({ facts: null });

  return NextResponse.json({
    facts: {
      title: facts.title,
      genres: facts.genres,
      studios: facts.studios,
      popularity: facts.popularity,
      siteUrl: facts.siteUrl,
    },
  });
}
