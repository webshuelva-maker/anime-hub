import { urlIA, modeloPotente, modeloRapido, claveIA } from "@/lib/ia";
import { NextRequest, NextResponse } from "next/server";
import {
  ChatMessage,
  buildResearchBlock,
  buildSystemPrompt,
} from "@/lib/assistantPrompt";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

/**
 * Ruta clásica: devuelve la respuesta entera de golpe. Desde v82 la vía
 * normal es /api/assistant/stream (respuesta escribiéndose en directo),
 * y esta se mantiene como RESPALDO: si el streaming falla o el hosting
 * no lo deja pasar bien, el cliente reintenta por aquí y Ren sigue
 * respondiendo. Comparte prompt y modelos con la otra ruta, así que las
 * dos se comportan igual.
 */
async function callModel(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number,
  reintentosRestantes = 1
): Promise<{ ok: true; reply: string } | { ok: false; debug: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(urlIA(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");

      /*
       * 429 = se ha agotado la cuota de tokens por minuto del plan
       * gratuito (6.000). Groq NO se limita a rechazar: dice exactamente
       * cuántos segundos faltan para tener cuota otra vez ("Please try
       * again in 6.97s", o la cabecera retry-after).
       *
       * Antes eso se ignoraba y se le decía al usuario que los
       * servidores estaban llenos, cuando bastaba con esperar siete
       * segundos. Ahora se espera y se reintenta una vez: para el
       * usuario es una respuesta que tarda un poco más, en vez de un
       * error.
       */
      if (response.status === 429 && reintentosRestantes > 0) {
        const cabecera = Number(response.headers.get("retry-after"));
        const delTexto = errBody.match(/try again in ([\d.]+)s/i);
        const segundos = Number.isFinite(cabecera) && cabecera > 0
          ? cabecera
          : delTexto
          ? parseFloat(delTexto[1])
          : 8;
        // Tope de 20s: por encima de eso ya no compensa hacer esperar a
        // nadie mirando una pantalla.
        const espera = Math.min(segundos + 0.5, 20);
        console.warn(`[assistant] cuota agotada, reintentando en ${espera}s`);
        clearTimeout(timeout);
        await new Promise((r) => setTimeout(r, espera * 1000));
        return callModel(apiKey, model, systemPrompt, messages, maxTokens, reintentosRestantes - 1);
      }

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
  const apiKey = claveIA();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Todavía no hay una clave de Groq configurada. Añádela en .env.local como GROQ_API_KEY (gratis en console.groq.com) y reinicia el servidor.",
      },
      { status: 503 }
    );
  }

  let body: {
    messages?: ChatMessage[];
    context?: string;
    preferFallback?: boolean;
    research?: { dossier?: string; factsText?: string; confidenceLine?: string; webFailed?: boolean };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const messages = (body.messages ?? []).map((m) => ({ role: m.role, content: m.content }));
  const context = body.context ?? "";

  const researchText = [body.research?.factsText, body.research?.dossier]
    .filter((t) => t && t.trim().length > 0)
    .join("\n\n");

  const researchBlock = buildResearchBlock({
    researchText,
    confidenceLine: body.research?.confidenceLine ?? "",
    webFailed: body.research?.webFailed === true,
  });
  const systemPrompt = buildSystemPrompt(context, researchBlock);

  const model = body.preferFallback === true ? modeloRapido() : modeloPotente();
  // Con investigación por delante hay bastante más que contar (lo
  // confirmado, los rumores, los matices), así que se le da más margen
  // que en una charla normal — pero solo en ese caso, para no gastar
  // presupuesto de tokens de más en el resto de mensajes.
  const maxTokens = researchText ? 1100 : 700;
  const attempt = await callModel(apiKey, model, systemPrompt, messages, maxTokens);

  if (!attempt.ok) {
    // No se manda "reply" en el fallo — solo "debug" — para que el
    // cliente pueda distinguir un fallo real de una respuesta de verdad
    // y reintentar con el modelo de respaldo.
    return NextResponse.json({ debug: attempt.debug });
  }

  return NextResponse.json({ reply: attempt.reply });
}
