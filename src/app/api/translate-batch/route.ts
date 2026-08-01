import { NextRequest, NextResponse } from "next/server";
import { translateBatch, BatchTranslateItem } from "@/lib/translateBatch";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

export async function POST(req: NextRequest) {
  let body: { items?: BatchTranslateItem[]; preferFallback?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ results: [] }, { status: 400 });
  }

  const items = (body.items ?? []).slice(0, 12); // límite razonable por lote
  const results = await translateBatch(items, body.preferFallback === true);
  return NextResponse.json({ results });
}
