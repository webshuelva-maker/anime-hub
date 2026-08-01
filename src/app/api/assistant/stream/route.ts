import { NextRequest } from "next/server";
import {
  GROQ_URL,
  PRIMARY_MODEL,
  ChatMessage,
  buildResearchBlock,
  buildSystemPrompt,
} from "@/lib/assistantPrompt";
import { classifyIntent, gatherEvidence } from "@/lib/research";
import { computeConfidence, confidenceInstruction } from "@/lib/confidence";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Ruta en directo (Server-Sent Events). Manda al navegador lo que está
 * pasando DE VERDAD, en el mismo orden en que pasa:
 *
 *   step    → un paso del trabajo, con su estado (en curso / hecho / falló)
 *   sources → las fuentes consultadas, en cuanto se tienen
 *   token   → cada trocito de la respuesta según la escribe el modelo
 *   done    → texto completo en crudo + nivel de confianza
 *   error   → algo falló; el cliente reintenta por la ruta clásica
 *
 * A diferencia de la versión anterior, ahora la búsqueda la hacemos
 * nosotros paso a paso, así que cada estado que se enseña corresponde a
 * algo que está ocurriendo en ese instante: ya no hay que revelar nada
 * "con retraso" ni escalonarlo artificialmente.
 *
 * La confianza se manda al FINAL, junto con la respuesta. Enseñarla antes
 * no tenía ningún sentido: es una valoración de lo que aún no se ha dicho.
 */

interface StreamBody {
  messages?: ChatMessage[];
  context?: string;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Suelta el texto que llega del modelo pero RETIENE cualquier cosa que
 * empiece por "[[" hasta saber si es una etiqueta de acción — si no, se
 * vería escribir "[[ACTION:...]]" en pantalla antes de poder quitarlo.
 */
function createTagFilter() {
  let buffer = "";

  return {
    push(chunk: string): string {
      buffer += chunk;
      const cleaned = buffer.replace(/\[\[[^\]]*\]\]/g, "");

      const open = cleaned.indexOf("[[");
      let emitUpTo: number;
      if (open >= 0) emitUpTo = open;
      else if (cleaned.endsWith("[")) emitUpTo = cleaned.length - 1;
      else emitUpTo = cleaned.length;

      const out = cleaned.slice(0, emitUpTo);
      buffer = cleaned.slice(emitUpTo);
      return out;
    },
    flush(): string {
      const out = buffer.replace(/\[\[[^\]]*\]\]/g, "");
      buffer = "";
      return out;
    },
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;

  let body: StreamBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Petición inválida.", { status: 400 });
  }

  const messages = (body.messages ?? []).map((m) => ({ role: m.role, content: m.content }));
  const context = body.context ?? "";

  if (!apiKey) return new Response("Falta GROQ_API_KEY.", { status: 503 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      let researchText = "";
      let confidenceLine = "";
      let webFailed = false;
      let confidence = null as ReturnType<typeof computeConfidence> | null;

      try {
        // --- Paso 1: entender qué se está preguntando ----------------
        // Lo decide un modelo leyendo la conversación, no una lista de
        // palabras clave. Así da igual el idioma, el vocabulario, las
        // faltas o que la pregunta sea "y la 3?".
        send("step", { id: "intent", label: "Entendiendo la pregunta", status: "running" });
        const intent = await classifyIntent(apiKey, messages);
        send("step", {
          id: "intent",
          label: "Entendiendo la pregunta",
          status: "done",
          detail: intent.needsResearch ? intent.topic || "hay que buscarlo" : "no hace falta buscar",
        });

        if (intent.needsResearch) {
          // --- Paso 2: buscar, de verdad y en paralelo ---------------
          send("step", { id: "search", label: "Buscando noticias", status: "running" });
          for (const q of intent.queries.slice(0, 2)) {
            send("step", { id: `q:${q}`, label: `«${q}»`, status: "running", sub: true });
          }
          send("step", {
            id: "rumors",
            label: "Rastreando rumores y filtraciones",
            status: "running",
          });
          send("step", {
            id: "db",
            label: "Contrastando AniList y MyAnimeList",
            status: "running",
          });

          const evidence = await gatherEvidence(intent.topic, intent.queries);
          webFailed = evidence.empty;

          send("step", {
            id: "search",
            label: "Buscando noticias",
            status: evidence.hits.length > 0 ? "done" : "failed",
            detail:
              evidence.hits.length > 0
                ? `${evidence.hits.length} resultados`
                : `sin resultados (${evidence.debug})`,
          });
          for (const q of intent.queries.slice(0, 2)) {
            send("step", { id: `q:${q}`, label: `«${q}»`, status: "done", sub: true });
          }

          const rumorCount = evidence.rumorHits.length + evidence.redditHits.length;
          send("step", {
            id: "rumors",
            label: "Rastreando rumores y filtraciones",
            status: rumorCount > 0 ? "done" : "failed",
            detail:
              rumorCount > 0
                ? `${rumorCount} menciones sin verificar`
                : "nada circulando ahora mismo",
          });

          const dbDetail = [
            evidence.anilist ? `AniList: ${evidence.anilist.title}` : null,
            evidence.jikan ? "MAL ✓" : null,
          ]
            .filter(Boolean)
            .join(" · ");
          send("step", {
            id: "db",
            label: "Contrastando AniList y MyAnimeList",
            status: evidence.anilist || evidence.jikan ? "done" : "failed",
            detail: dbDetail || "sin ficha",
          });

          confidence = computeConfidence({
            sources: evidence.sources,
            anilist: evidence.anilist,
            jikan: evidence.jikan,
            newest: evidence.newest,
          });
          confidenceLine = confidenceInstruction(confidence);
          researchText = evidence.text;

          send("sources", {
            sources: evidence.sources,
            topic: evidence.anilist?.title ?? intent.topic ?? null,
            facts: evidence.anilist
              ? {
                  title: evidence.anilist.title,
                  genres: evidence.anilist.genres,
                  studios: evidence.anilist.studios,
                }
              : null,
          });

          send("step", { id: "write", label: "Redactando la respuesta", status: "running" });
        }

        // --- Paso 3: responder, ya en directo ------------------------
        const systemPrompt = buildSystemPrompt(
          context,
          buildResearchBlock({ researchText, confidenceLine, webFailed })
        );

        const groqRes = await fetch(GROQ_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: PRIMARY_MODEL,
            messages: [{ role: "system", content: systemPrompt }, ...messages],
            temperature: 0.6,
            max_tokens: researchText ? 700 : 420,
            stream: true,
          }),
        });

        if (!groqRes.ok || !groqRes.body) {
          const errBody = await groqRes.text().catch(() => "");
          send("error", { debug: `Groq respondió ${groqRes.status}: ${errBody.slice(0, 200)}` });
          controller.close();
          return;
        }

        const reader = groqRes.body.getReader();
        const decoder = new TextDecoder();
        const filter = createTagFilter();
        let raw = "";
        let carry = "";
        let firstToken = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          carry += decoder.decode(value, { stream: true });
          const lines = carry.split("\n");
          carry = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload);
              const delta: string = parsed?.choices?.[0]?.delta?.content ?? "";
              if (!delta) continue;

              if (firstToken) {
                firstToken = false;
                if (intent.needsResearch) {
                  send("step", { id: "write", label: "Redactando la respuesta", status: "done" });
                }
              }

              raw += delta;
              const visible = filter.push(delta);
              if (visible) send("token", { text: visible });
            } catch {
              // Un trozo suelto que no parsea no debe tumbar el stream.
            }
          }
        }

        const tail = filter.flush();
        if (tail) send("token", { text: tail });

        // La confianza va aquí, con la respuesta ya escrita.
        send("done", { raw, confidence });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send("error", { debug: `excepción en stream: ${msg}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
