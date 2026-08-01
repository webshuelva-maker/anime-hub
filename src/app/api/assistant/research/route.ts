import { NextRequest, NextResponse } from "next/server";
import {
  runResearch,
  extractCanonicalTitle,
  extractStatus,
  extractLatestDate,
} from "@/lib/research";
import { getAnimeFacts, factsToPromptText, AnimeFacts } from "@/lib/animeFacts";
import { guessTopicFromQuestion } from "@/lib/researchIntent";
import { computeConfidence, confidenceInstruction } from "@/lib/confidence";

export const runtime = "nodejs";
export const maxDuration = 60; // una investigación con varias búsquedas web tarda más que un chat normal

/**
 * Investigación "de una sola tacada". Desde v82 la vía normal es
 * /api/assistant/stream, que cuenta los pasos en directo; esta ruta se
 * queda como respaldo para cuando el streaming no funciona (proxy que lo
 * corta, red rara, hosting que lo acumula). Usa exactamente la misma
 * librería, así que el resultado es idéntico, solo que llega de golpe.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Falta GROQ_API_KEY en el servidor." }, { status: 503 });
  }

  let body: { question?: string; previousTopic?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (question.length < 3) {
    return NextResponse.json({ error: "Pregunta vacía." }, { status: 400 });
  }

  const previousTopic = (body.previousTopic ?? "").trim();
  const effectiveQuestion =
    previousTopic && question.length < 70 ? `${question} (se refiere a: ${previousTopic})` : question;

  const outcome = await runResearch(apiKey, effectiveQuestion, 22000);

  // La ficha de AniList se busca SIEMPRE, haya funcionado la búsqueda web
  // o no: es gratis, es rápida, y es el dato duro sobre el que apoyar la
  // respuesta. Si la investigación devolvió un título canónico se usa ese
  // (mucho más fiable); si no, se intenta adivinar desde la pregunta.
  const canonicalTitle = extractCanonicalTitle(outcome.dossier);
  const lookupTerm = canonicalTitle || guessTopicFromQuestion(question);
  let facts: AnimeFacts | null = null;
  if (lookupTerm.length >= 2) {
    facts = await getAnimeFacts(lookupTerm);
  }

  const confidence = computeConfidence({
    sources: outcome.sources,
    status: extractStatus(outcome.dossier),
    latestDate: extractLatestDate(outcome.dossier),
    facts,
  });

  return NextResponse.json({
    dossier: outcome.dossier,
    webFailed: !outcome.grounded,
    factsText: facts ? factsToPromptText(facts) : "",
    confidence,
    confidenceLine: confidenceInstruction(confidence),
    facts: facts
      ? {
          title: facts.title,
          genres: facts.genres,
          studios: facts.studios,
          popularity: facts.popularity,
          siteUrl: facts.siteUrl,
        }
      : null,
    sources: outcome.sources,
    queries: outcome.queries,
    canonicalTitle,
    debug: outcome.debug,
  });
}
