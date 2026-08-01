import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const BATCH_SIZE = 15;

/**
 * Genera curiosidades cortas de anime/manga en español, personalizadas
 * con los gustos del usuario cuando los hay. Prioridad "normal" en la
 * cola (ver apiQueue.ts) — es contenido decorativo para la pantalla de
 * carga inicial, nunca debe competir con Ren ni con una traducción real.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ facts: [] });

  let body: { exclude?: string[]; genres?: string[]; favoriteTitles?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ facts: [] });
  }

  const exclude = (body.exclude ?? []).slice(-60); // no hace falta mandar un historial infinito
  const genres = body.genres ?? [];
  const favoriteTitles = body.favoriteTitles ?? [];

  const personalization =
    genres.length || favoriteTitles.length
      ? `Al usuario le gustan estos géneros/series, dale algo de peso a eso en la selección (sin que sean TODAS sobre lo mismo): ${[...genres, ...favoriteTitles].join(", ")}.`
      : "";

  const systemPrompt = `Generas curiosidades cortas y interesantes sobre anime y manga, en español de España, una frase por curiosidad (máximo ~25 palabras cada una). Temas variados: historia del medio, datos de producción, curiosidades de estudios, récords, adaptaciones, doblaje, cultura otaku, etc. Nada de spoilers de tramas recientes. ${personalization}

${exclude.length > 0 ? `Ya se han mostrado estas — NO las repitas ni generes otras muy parecidas:\n${exclude.map((f) => `- ${f}`).join("\n")}` : ""}

Devuelve ÚNICAMENTE un array JSON de ${BATCH_SIZE} strings, sin numerar, sin texto antes ni después.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.9,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${systemPrompt}\n\nResponde como {"facts": [...]}` },
          { role: "user", content: "Genera el lote de curiosidades." },
        ],
      }),
    });

    if (!res.ok) return NextResponse.json({ facts: [] });

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      const facts = Array.isArray(parsed) ? parsed : parsed?.facts;
      if (Array.isArray(facts)) return NextResponse.json({ facts: facts.filter((f) => typeof f === "string") });
    } catch {
      // sigue abajo
    }
    return NextResponse.json({ facts: [] });
  } catch {
    return NextResponse.json({ facts: [] });
  } finally {
    clearTimeout(timeout);
  }
}
