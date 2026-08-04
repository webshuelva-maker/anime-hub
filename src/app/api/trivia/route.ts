import { urlIA, claveIA, ajustesRazonamiento, tokensConMargen } from "@/lib/ia";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal


const MODEL = "llama-3.3-70b-versatile";
const BATCH_SIZE = 20;

/**
 * Genera curiosidades cortas de anime/manga en español, personalizadas
 * con los gustos del usuario cuando los hay. Prioridad "normal" en la
 * cola (ver apiQueue.ts) — es contenido decorativo para la pantalla de
 * carga inicial, nunca debe competir con Ren ni con una traducción real.
 */
export async function POST(req: NextRequest) {
  const apiKey = claveIA();
  if (!apiKey) return NextResponse.json({ facts: [] });

  let body: { exclude?: string[]; genres?: string[]; favoriteTitles?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ facts: [] });
  }

  const exclude = (body.exclude ?? []).slice(-200); // historial largo a propósito: con 60 volvían curiosidades de sesiones anteriores
  const genres = body.genres ?? [];
  const favoriteTitles = body.favoriteTitles ?? [];

  const personalization =
    genres.length || favoriteTitles.length
      ? `Al usuario le gustan estos géneros/series, dale algo de peso a eso en la selección (sin que sean TODAS sobre lo mismo): ${[...genres, ...favoriteTitles].join(", ")}.`
      : "";

  const systemPrompt = `Generas curiosidades cortas y interesantes sobre anime y manga, en español de España, una frase por curiosidad (máximo ~25 palabras cada una). Temas variados: historia del medio, datos de producción, curiosidades de estudios, adaptaciones, doblaje, cultura otaku, etc. Nada de spoilers de tramas recientes. ${personalization}

MUY IMPORTANTE — solo datos que sepas con certeza:
- NO inventes cifras, récords ni superlativos. Nada de "el más largo", "el más taquillero", "el primero en...", ni números de episodios, fechas exactas de emisión o cifras de ventas, salvo que sean archiconocidos y estés completamente seguro.
- Ante la duda entre una curiosidad llamativa pero dudosa y una más sosa pero segura, elige SIEMPRE la segura.
- Prefiere hechos cualitativos y verificables (qué estudio hizo qué, de qué obra nace una adaptación, rasgos de estilo de un director) antes que datos numéricos.
Una curiosidad falsa hace más daño que una aburrida: esto se le enseña al usuario como si fuera un dato cierto.

${exclude.length > 0 ? `Ya se han mostrado estas — NO las repitas ni generes otras muy parecidas:\n${exclude.map((f) => `- ${f}`).join("\n")}` : ""}

Devuelve ÚNICAMENTE un array JSON de ${BATCH_SIZE} strings, sin numerar, sin texto antes ni después.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(urlIA(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.9,
        max_tokens: tokensConMargen(1200),
        ...ajustesRazonamiento(),
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
