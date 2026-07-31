import { NextRequest, NextResponse } from "next/server";
import { translateBatch, BatchTranslateItem } from "@/lib/translateBatch";

export const runtime = "nodejs";

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
