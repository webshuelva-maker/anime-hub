import { NextRequest } from "next/server";
import {
  GROQ_URL,
  PRIMARY_MODEL,
  ChatMessage,
  buildResearchBlock,
  buildSystemPrompt,
} from "@/lib/assistantPrompt";
import {
  runResearch,
  extractCanonicalTitle,
  extractStatus,
  extractLatestDate,
} from "@/lib/research";
import { getAnimeFacts, factsToPromptText, AnimeFacts } from "@/lib/animeFacts";
import { guessTopicFromQuestion, shouldResearch } from "@/lib/researchIntent";
import { computeConfidence, confidenceInstruction } from "@/lib/confidence";

export const runtime = "nodejs";
export const maxDuration = 60; // investigar + redactar en una sola conexión necesita más margen que una respuesta suelta

/**
 * Ruta en directo (Server-Sent Events). Va mandando al navegador lo que
 * está pasando DE VERDAD, en el mismo orden en que pasa:
 *
 *   step    → un paso del trabajo (buscar, contrastar, redactar) con su estado
 *   sources → las fuentes consultadas y el nivel de confianza calculado
 *   token   → cada trocito de la respuesta según lo va escribiendo el modelo
 *   done    → el texto completo en crudo (con etiquetas de acción incluidas)
 *   error   → algo ha fallado; el cliente reintenta por la ruta clásica
 *
 * Un matiz honesto sobre los pasos: Groq no va contando sus búsquedas
 * mientras las hace, las devuelve todas al terminar. Así que el paso
 * "buscando" se marca en curso de verdad desde el principio, y las
 * consultas concretas (que son las reales, sacadas de su razonamiento)
 * se revelan al terminar, escalonadas para que se puedan leer.
 */

interface StreamBody {
  messages?: ChatMessage[];
  context?: string;
  question?: string;
  /** Serie de la que iba la última investigación, para entender preguntas
   *  de seguimiento tipo "¿y ha terminado ya?" sin repetir el título. */
  previousTopic?: string;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Va soltando el texto que llega del modelo pero RETIENE cualquier cosa
 * que empiece por "[[" hasta saber si es una etiqueta de acción — si no,
 * el usuario vería escribirse en pantalla "[[ACTION:interes:...]]" antes
 * de que el cliente pueda quitarlo.
 */
function createTagFilter() {
  let buffer = "";

  return {
    push(chunk: string): string {
      buffer += chunk;

      // Quita las etiquetas ya completas que hayan quedado dentro. Se
      // borra CUALQUIER cosa entre dobles corchetes, no solo las acciones
      // conocidas: si el modelo se inventa un nombre de acción o escribe
      // mal la etiqueta, tampoco debe verse en pantalla.
      const cleaned = buffer.replace(/\[\[[^\]]*\]\]/g, "");

      const open = cleaned.indexOf("[[");
      let emitUpTo: number;
      if (open >= 0) {
        // Hay una etiqueta a medias: no se emite nada desde ahí.
        emitUpTo = open;
      } else if (cleaned.endsWith("[")) {
        // Podría ser el principio de "[[" en el siguiente trozo.
        emitUpTo = cleaned.length - 1;
      } else {
        emitUpTo = cleaned.length;
      }

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
  const question = (body.question ?? "").trim();
  const previousTopic = (body.previousTopic ?? "").trim();

  if (!apiKey) {
    return new Response("Falta GROQ_API_KEY.", { status: 503 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };
      const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

      let researchText = "";
      let confidenceLine = "";

      try {
        const needsResearch =
          question.length > 0 && shouldResearch(question, previousTopic).needed;
        let webFailed = false;

        if (needsResearch) {
          // Una pregunta de seguimiento ("¿y ha terminado ya?") no dice
          // de qué serie habla: se le añade el tema anterior para que la
          // búsqueda no salga a ciegas.
          const effectiveQuestion =
            previousTopic && question.length < 70
              ? `${question} (se refiere a: ${previousTopic})`
              : question;

          // --- Paso 1: búsqueda web real -----------------------------
          send("step", { id: "search", label: "Buscando en internet", status: "running" });

          const outcome = await runResearch(apiKey, effectiveQuestion, 22000);
          webFailed = !outcome.grounded;

          if (outcome.grounded) {
            send("step", {
              id: "search",
              label: "Buscando en internet",
              status: "done",
              detail: `${outcome.sources.length} fuentes`,
            });

            // Las consultas reales que ejecutó, una a una.
            for (const q of outcome.queries) {
              send("step", { id: `q:${q}`, label: `«${q}»`, status: "done", sub: true });
              await pause(500);
            }
          } else {
            // Sin fuentes no hay investigación: se dice tal cual, en vez
            // de dejar que parezca que sí encontró algo.
            send("step", {
              id: "search",
              label: "Buscando en internet",
              status: "failed",
              detail: "sin fuentes utilizables",
            });
          }

          // --- Paso 2: contraste con la ficha oficial ----------------
          send("step", { id: "anilist", label: "Contrastando con AniList", status: "running" });

          const canonicalTitle = extractCanonicalTitle(outcome.dossier);
          const lookupTerm = canonicalTitle || guessTopicFromQuestion(question);
          let facts: AnimeFacts | null = null;
          if (lookupTerm.length >= 2) facts = await getAnimeFacts(lookupTerm);

          send("step", {
            id: "anilist",
            label: "Contrastando con AniList",
            status: facts ? "done" : "skipped",
            detail: facts ? facts.title : "sin ficha",
          });

          // --- Paso 3: confianza, calculada con reglas fijas ---------
          const confidence = computeConfidence({
            sources: outcome.sources,
            status: extractStatus(outcome.dossier),
            latestDate: extractLatestDate(outcome.dossier),
            facts,
          });
          confidenceLine = confidenceInstruction(confidence);

          send("sources", {
            sources: outcome.sources,
            confidence,
            webFailed,
            topic: facts?.title ?? canonicalTitle ?? null,
            facts: facts
              ? { title: facts.title, genres: facts.genres, studios: facts.studios }
              : null,
          });

          // El dossier ya viene vacío si no hubo fuentes (ver lib/research.ts),
          // así que aquí solo puede quedar la ficha de AniList, que sí es fiable.
          researchText = [facts ? factsToPromptText(facts) : "", outcome.dossier]
            .filter((t) => t.trim().length > 0)
            .join("\n\n");
        }

        // --- Paso 4: redactar, ya en directo -------------------------
        if (needsResearch) {
          send("step", { id: "write", label: "Redactando la respuesta", status: "running" });
        }

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
            temperature: 0.7,
            max_tokens: researchText ? 750 : 420,
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
                if (needsResearch) {
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

        send("done", { raw });
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
      // Evita que proxies intermedios acumulen la respuesta y la suelten
      // de golpe al final, que anularía todo el efecto de escribir en vivo.
      "X-Accel-Buffering": "no",
    },
  });
}
