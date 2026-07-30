import { NextRequest, NextResponse } from "next/server";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Todavía no hay una clave de NVIDIA configurada. Añádela en .env.local como NVIDIA_API_KEY (gratis en build.nvidia.com) y reinicia el servidor.",
      },
      { status: 503 }
    );
  }

  let body: { messages?: ChatMessage[]; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const messages = body.messages ?? [];
  const context = body.context ?? "";

  const systemPrompt = `Eres ${siteConfig.assistantName}, el asistente personal dentro de la app "${siteConfig.name}", una app de noticias y seguimiento de anime.
Hablas siempre en español, con un tono cercano, natural y breve — nada de respuestas largas tipo ensayo salvo que te lo pidan explícitamente.
Conoces al usuario por el contexto de abajo: úsalo para personalizar tus respuestas (llámale por su nombre si lo tienes, menciona sus gustos cuando encaje de forma natural, no lo repitas todo de golpe).

Tienes conocimiento general amplio sobre anime y manga (títulos famosos, tramas, personajes, estudios, años) igual que cualquier persona muy aficionada — úsalo con total normalidad para responder preguntas, identificar animes por su descripción, o recomendar títulos, aunque no aparezcan en el contexto de abajo. El contexto de abajo es solo información EXTRA sobre este usuario y las noticias del momento, no el límite de lo que sabes. Solo evita inventarte datos muy concretos y verificables que no sepas con certeza (cifras exactas, fechas exactas de anuncios recientes, declaraciones textuales) — ahí sí, di que no lo sabes seguro en vez de inventarlo.

Puedes realizar DOS acciones reales sobre la cuenta del usuario, no solo hablar de ellas:
1. Añadir un anime a su lista de favoritos, cuando te lo pida explícitamente (ej: "añade Jujutsu Kaisen a mis favoritos", "guarda esta serie").
2. Dar "me gusta" a una noticia del feed actual, cuando te pida marcar como favorita una noticia sobre un título concreto que SÍ aparezca en los titulares disponibles de abajo.

Para ejecutar una acción, escribe tu respuesta normal y natural, y al final, en su propia línea, añade EXACTAMENTE una de estas etiquetas (nunca la menciones ni la expliques, es invisible para el usuario):
[[ACTION:add_favorite:Nombre exacto del anime]]
[[ACTION:like_news:Nombre exacto del título relacionado con la noticia]]
Solo añade una etiqueta cuando el usuario pida claramente esa acción. Si solo está charlando o preguntando, no añadas ninguna etiqueta.
No puedes hacer nada más que estas dos acciones (no puedes cambiar el nombre del usuario, ni sus plataformas, ni navegar por él) — si te piden otra cosa, explica con naturalidad que de momento solo puedes hacer estas dos.

Contexto del usuario y de la app en este momento:
${context}`;

  try {
    const response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: 420,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `NVIDIA respondió con un error (${response.status}). ${errText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply: string = data?.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { error: "No se pudo contactar con la API de NVIDIA. Comprueba tu conexión y la clave." },
      { status: 502 }
    );
  }
}
