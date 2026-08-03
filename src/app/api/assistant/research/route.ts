import { claveIA } from "@/lib/ia";
import { NextRequest, NextResponse } from "next/server";
import { classifyIntent, gatherEvidence } from "@/lib/research";
import { computeConfidence, confidenceInstruction } from "@/lib/confidence";
import { ChatMessage } from "@/lib/assistantPrompt";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Investigación "de una sola tacada". La vía normal es
 * /api/assistant/stream, que cuenta los pasos en directo; esta queda como
 * respaldo para cuando el streaming no llega (un proxy que lo corta, un
 * hosting que lo acumula). Usa exactamente la misma librería, así que el
 * resultado es idéntico, solo que llega de golpe.
 */
export async function POST(req: NextRequest) {
  const apiKey = claveIA();
  if (!apiKey) {
    return NextResponse.json({ error: "Falta GROQ_API_KEY en el servidor." }, { status: 503 });
  }

  let body: { question?: string; messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const messages: ChatMessage[] =
    body.messages && body.messages.length > 0
      ? body.messages
      : [{ role: "user", content: (body.question ?? "").trim() }];

  const intent = await classifyIntent(apiKey, messages);
  if (!intent.needsResearch) {
    return NextResponse.json({ needsResearch: false, debug: intent.debug });
  }

  const evidence = await gatherEvidence(intent.topic, intent.queries, intent.isAnime);
  const confidence = computeConfidence({
    sources: evidence.sources,
    anilist: evidence.anilist,
    jikan: evidence.jikan,
    newest: evidence.newest,
  });

  return NextResponse.json({
    needsResearch: true,
    factsText: evidence.text,
    dossier: "",
    webFailed: evidence.empty,
    confidence,
    confidenceLine: confidenceInstruction(confidence),
    sources: evidence.sources,
    facts: evidence.anilist
      ? {
          title: evidence.anilist.title,
          genres: evidence.anilist.genres,
          studios: evidence.anilist.studios,
          popularity: evidence.anilist.popularity,
          siteUrl: evidence.anilist.siteUrl,
        }
      : null,
    debug: `${intent.debug} | ${evidence.debug}`,
  });
}
