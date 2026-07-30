import { NextResponse } from "next/server";

export const runtime = "nodejs";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export async function GET() {
  const key = process.env.NVIDIA_API_KEY ?? "";
  const model = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";

  const base = {
    hasKey: key.length > 0,
    keyLength: key.length,
    startsCorrectly: key.startsWith("nvapi-"),
    keyPreview: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : null,
    model,
    modelSource: process.env.NVIDIA_MODEL ? "NVIDIA_MODEL configurada" : "por defecto (NVIDIA_MODEL no está puesta)",
  };

  if (!key) {
    return NextResponse.json({ ...base, liveTest: "sin clave, no se ha probado" });
  }

  // Prueba real: una llamada mínima de verdad contra NVIDIA, no solo mirar
  // si la clave tiene la forma correcta.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hola" }],
        max_tokens: 5,
      }),
    });
    clearTimeout(timeout);

    if (res.ok) {
      return NextResponse.json({ ...base, liveTest: "ok — la clave funciona de verdad contra NVIDIA" });
    }

    const errBody = await res.text().catch(() => "");
    return NextResponse.json({
      ...base,
      liveTest: `FALLA — NVIDIA respondió ${res.status}: ${errBody.slice(0, 300)}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ...base, liveTest: `FALLA — excepción: ${message}` });
  }
}
