import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const key = process.env.NVIDIA_API_KEY ?? "";
  return NextResponse.json({
    hasKey: key.length > 0,
    keyLength: key.length,
    startsCorrectly: key.startsWith("nvapi-"),
    keyPreview: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : null,
    model: process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct (por defecto)",
  });
}
