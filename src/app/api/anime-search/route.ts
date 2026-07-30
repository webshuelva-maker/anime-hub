import { NextRequest, NextResponse } from "next/server";
import { searchAnimeDatabase } from "@/lib/anilist";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("q") ?? "";
  const results = await searchAnimeDatabase(term);
  return NextResponse.json({ results });
}
