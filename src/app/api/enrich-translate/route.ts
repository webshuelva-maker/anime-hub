import { NextRequest, NextResponse } from "next/server";
import { translateNewsFields } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const summary = req.nextUrl.searchParams.get("summary") ?? "";

  const { result: translated, debug: translateDebug } = await translateNewsFields(title, summary, summary || title, 300);

  return NextResponse.json({
    title: translated?.title ?? null,
    summary: translated?.summary ?? null,
    translateDebug,
  });
}
