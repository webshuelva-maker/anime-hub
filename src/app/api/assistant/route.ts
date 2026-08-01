import { NextRequest, NextResponse } from "next/server";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

async function callModel(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<{ ok: true; reply: string } | { ok: false; debug: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: 420,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      const debug = `Groq respondió ${response.status}: ${errBody.slice(0, 300)}`;
      console.error(`[assistant] ${debug}`);
      return { ok: false, debug };
    }

    const data = await response.json();
    const reply: string = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, reply };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const debug = `excepción: ${message}`;
    console.error(`[assistant] ${debug}`);
    return { ok: false, debug };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Todavía no hay una clave de Groq configurada. Añádela en .env.local como GROQ_API_KEY (gratis en console.groq.com) y reinicia el servidor.",
      },
      { status: 503 }
    );
  }

  let body: { messages?: ChatMessage[]; context?: string; preferFallback?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const messages = (body.messages ?? []).map((m) => ({ role: m.role, content: m.content }));
  const context = body.context ?? "";

  const systemPrompt = `Eres ${siteConfig.assistantName}, el asistente personal dentro de la app "${siteConfig.name}", una app de noticias y seguimiento de anime.
Hablas siempre en español, con un tono cercano, natural y breve — nada de respuestas largas tipo ensayo salvo que te lo pidan explícitamente.
Conoces al usuario por el contexto de abajo: úsalo para personalizar tus respuestas (llámale por su nombre si lo tienes, menciona sus gustos cuando encaje de forma natural, no lo repitas todo de golpe).

Tienes conocimiento general amplio sobre anime y manga (títulos famosos, tramas, personajes, estudios, años) igual que cualquier persona muy aficionada — úsalo con total normalidad para responder preguntas, identificar animes por su descripción, o recomendar títulos, aunque no aparezcan en el contexto de abajo. El contexto de abajo es solo información EXTRA sobre este usuario y las noticias del momento, no el límite de lo que sabes. Solo evita inventarte datos muy concretos y verificables que no sepas con certeza (cifras exactas, fechas exactas de anuncios recientes, declaraciones textuales) — ahí sí, di que no lo sabes seguro en vez de inventarlo.

Puedes realizar TRES acciones reales sobre la cuenta del usuario, no solo hablar de ellas:
1. Añadir un anime a su lista de favoritos, cuando te lo pida explícitamente (ej: "añade Jujutsu Kaisen a mis favoritos", "guarda esta serie").
2. Dar "me gusta" a una noticia del feed actual, cuando te pida marcar como favorita una noticia sobre un título concreto que SÍ aparezca en los titulares disponibles de abajo.
3. Recordar algo a largo plazo sobre este usuario, para futuras conversaciones — tanto datos sobre él (gustos, cosas que cuenta de sí mismo) como preferencias de cómo quiere que le trates (ej: "háblame de tú", "sé más gracioso", "no me des la razón en todo", "sé más breve"). Usa esta acción cuando el usuario comparta algo que claramente merece recordarse para la próxima vez, o cuando te pida explícitamente que le trates de otra forma a partir de ahora. Aplica de verdad esas preferencias de trato en TODAS tus respuestas siguientes, no solo la primera vez que las dice — adáptate poco a poco a como el usuario te vaya tratando a ti, igual que haría una persona.

Para ejecutar una acción, escribe tu respuesta normal y natural, y al final, en su propia línea, añade EXACTAMENTE una de estas etiquetas (nunca la menciones ni la expliques, es invisible para el usuario):
[[ACTION:add_favorite:Nombre exacto del anime]]
[[ACTION:like_news:Nombre exacto del título relacionado con la noticia]]
[[ACTION:remember:Lo que hay que recordar, en una frase clara y en tercera persona (ej: "Prefiere que le hable de tú", "Le encanta el gore y el terror psicológico")]]
Puedes añadir varias etiquetas de "remember" en la misma respuesta si hay varias cosas que recordar. Solo añade una etiqueta cuando de verdad corresponda. Si solo está charlando o preguntando sin compartir nada memorable, no añadas ninguna etiqueta.
No puedes hacer nada más que estas tres acciones (no puedes cambiar el nombre del usuario, ni sus plataformas, ni navegar por él) — si te piden otra cosa, explica con naturalidad que de momento solo puedes hacer estas.

Contexto del usuario y de la app en este momento:
${context}`;

  const model = body.preferFallback === true ? FALLBACK_MODEL : PRIMARY_MODEL;
  const attempt = await callModel(apiKey, model, systemPrompt, messages);

  if (!attempt.ok) {
    // FALLO DE LÓGICA ENCONTRADO: esto devolvía un "reply" con el
    // mensaje enlatado incluso al fallar — pero el cliente decide si
    // reintentar mirando "si no hay reply" (`if (!data.reply)`). Como
    // aquí SIEMPRE había un reply (el mensaje de "servidores llenos"),
    // esa condición nunca era cierta: el cliente nunca reintentaba con
    // el modelo de respaldo, ni mostraba el motivo técnico, porque
    // creía que la primera respuesta ya había ido bien. Ahora NO se
    // manda "reply" en el fallo — solo "debug" — para que el cliente sí
    // pueda distinguir un fallo real de una respuesta de verdad.
    return NextResponse.json({ debug: attempt.debug });
  }

  return NextResponse.json({ reply: attempt.reply });
}
