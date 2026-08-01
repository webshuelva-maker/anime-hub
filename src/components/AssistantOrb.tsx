"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { getPreferences } from "@/lib/storage";
import { buildAssistantContext } from "@/lib/assistantContext";
import { parseAndRunActions, AssistantAction } from "@/lib/assistantActions";
import { shouldResearch } from "@/lib/researchIntent";
import { ResearchSource, TIER_COLOR, TIER_LABEL } from "@/lib/sourceTiers";
import { Confidence, CONFIDENCE_COLOR } from "@/lib/confidence";
import { recordAnimeInterest, boostCategories } from "@/lib/learning";
import { UserPreferences } from "@/types/news";
import { ConfirmDialog } from "./ConfirmDialog";
import { playToggle, playSend, playReceive, playHover } from "@/lib/sound";
import { runExclusive, setBackgroundPaused, waitForTokenBudget, recordTokenUsage } from "@/lib/apiQueue";

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];
  /** Fuentes reales consultadas si esta respuesta salió de una investigación. */
  sources?: ResearchSource[];
  /** Nivel de confianza calculado con reglas fijas (ver lib/confidence.ts). */
  confidence?: Confidence;
  /** Pasos que dio Ren, guardados para poder repasarlos después. */
  steps?: Step[];
  ts?: number;
}

/** Lo que devuelve /api/assistant/research. */
interface ResearchResponse {
  dossier?: string;
  factsText?: string;
  facts?: { title: string; genres: string[]; studios: string[] } | null;
  sources?: ResearchSource[];
  confidence?: Confidence | null;
  confidenceLine?: string;
  canonicalTitle?: string | null;
  debug?: string;
}

/** En qué está Ren ahora mismo, para poder decirlo en la interfaz. */
type Phase = "idle" | "research" | "writing";

/** Un paso real del trabajo de Ren, tal y como lo va contando el servidor. */
interface Step {
  id: string;
  label: string;
  status: "running" | "done" | "failed" | "skipped";
  detail?: string;
  /** true = es una de las búsquedas concretas, va indentada bajo su paso. */
  sub?: boolean;
}

interface StreamTurnResult {
  ok: boolean;
  raw: string;
  sources: ResearchSource[];
  confidence: Confidence | null;
  steps: Step[];
}

/**
 * Consume el stream de /api/assistant/stream: pasos, fuentes y la
 * respuesta escribiéndose trozo a trozo.
 *
 * Devuelve ok:false solo si NO llegó ni un carácter de respuesta — en ese
 * caso el que llama repite el turno por las rutas clásicas. Si el corte
 * ocurre a mitad de la redacción se da por bueno lo recibido: repetirlo
 * gastaría el doble de cuota para reescribir casi lo mismo.
 */
async function runStreamingTurn(opts: {
  apiMessages: { role: "user" | "assistant"; content: string }[];
  contextText: string;
  question: string;
  onStep: (step: Step) => void;
  onSources: (payload: {
    sources: ResearchSource[];
    confidence: Confidence;
    facts: { title: string; genres: string[]; studios: string[] } | null;
  }) => void;
  onToken: (chunk: string) => void;
}): Promise<StreamTurnResult> {
  const steps: Step[] = [];
  let sources: ResearchSource[] = [];
  let confidence: Confidence | null = null;
  let raw = "";
  let visible = "";

  try {
    const res = await fetch("/api/assistant/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: opts.apiMessages,
        context: opts.contextText,
        question: opts.question,
      }),
    });

    if (!res.ok || !res.body) return { ok: false, raw: "", sources, confidence, steps };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let carry = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      carry += decoder.decode(value, { stream: true });
      // Los eventos van separados por una línea en blanco.
      const blocks = carry.split("\n\n");
      carry = blocks.pop() ?? "";

      for (const block of blocks) {
        const eventLine = block.split("\n").find((l) => l.startsWith("event:"));
        const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;

        const event = eventLine.slice(6).trim();
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }

        if (event === "step") {
          const step = data as unknown as Step;
          const idx = steps.findIndex((s) => s.id === step.id);
          if (idx === -1) steps.push(step);
          else steps[idx] = step;
          opts.onStep(step);
        } else if (event === "sources") {
          const payload = data as unknown as {
            sources: ResearchSource[];
            confidence: Confidence;
            facts: { title: string; genres: string[]; studios: string[] } | null;
          };
          sources = payload.sources ?? [];
          confidence = payload.confidence ?? null;
          opts.onSources(payload);
        } else if (event === "token") {
          const chunk = String(data.text ?? "");
          visible += chunk;
          opts.onToken(chunk);
        } else if (event === "done") {
          raw = String(data.raw ?? "");
        } else if (event === "error") {
          // Si ya había texto en pantalla, se conserva; si no, se
          // devuelve fallo para que el cliente use la vía clásica.
          return { ok: visible.length > 0, raw: raw || visible, sources, confidence, steps };
        }
      }
    }

    const finalRaw = raw || visible;
    return { ok: finalRaw.trim().length > 0, raw: finalRaw, sources, confidence, steps };
  } catch {
    return { ok: visible.length > 0, raw: raw || visible, sources, confidence, steps };
  }
}

const ARCHIVE_KEY = "anime-hub:assistant-archive";

function loadArchive(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ARCHIVE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveArchive(messages: Message[]): void {
  window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify(messages.slice(-60)));
}

/** Resumen breve de temas ya hablados, para que Ren pueda recordarlos sin repetir la conversación entera. */
function buildPriorTopicsSummary(archive: Message[]): string {
  const userLines = archive.filter((m) => m.role === "user").slice(-10).map((m) => `- ${m.content}`);
  if (userLines.length === 0) return "";
  return `Cosas de las que ya ha hablado contigo este usuario en sesiones anteriores (no continúes esa conversación, pero recuérdalas si te pregunta por ellas):\n${userLines.join("\n")}`;
}

function Orb({ active, size = 24 }: { active: boolean; size?: number }) {
  return (
    <div className="relative flex flex-shrink-0 items-center justify-center" style={{ height: size, width: size }}>
      <motion.div
        className="absolute inset-0 rounded-full blur-md"
        style={{ background: "radial-gradient(circle, var(--ice), transparent 70%)" }}
        animate={{ opacity: active ? [0.5, 0.85, 0.5] : [0.35, 0.55, 0.35], scale: active ? [1, 1.3, 1] : [1, 1.15, 1] }}
        transition={{ duration: active ? 1.1 : 2.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="relative rounded-full"
        style={{
          height: size * 0.78,
          width: size * 0.78,
          background: "radial-gradient(circle at 35% 30%, var(--ice), var(--accent-via) 75%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.15) inset",
        }}
        animate={
          active
            ? { scale: [1, 1.12, 0.95, 1.08, 1], x: [0, 1, -1, 1, 0], y: [0, -1, 1, -1, 0] }
            : { scale: [1, 1.05, 1] }
        }
        transition={{ duration: active ? 1.1 : 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--ice)" }}
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function StepIcon({ status }: { status: Step["status"] }) {
  if (status === "running") {
    return (
      <motion.span
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-ice"
        style={{ borderTopColor: "transparent" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      />
    );
  }
  if (status === "done") return <span className="ice-text w-2.5 flex-shrink-0 text-[10px] leading-none">✓</span>;
  if (status === "failed") return <span className="w-2.5 flex-shrink-0 text-[10px] leading-none text-muted">✕</span>;
  return <span className="w-2.5 flex-shrink-0 text-[10px] leading-none text-muted">–</span>;
}

/** Los pasos reales que va dando Ren, tachándose según se completan. */
function StepsList({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-panel-border/70 bg-panel-soft/40 px-2.5 py-2">
      {steps.map((s) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={`flex items-center gap-2 text-[11px] ${s.sub ? "pl-4" : ""}`}
        >
          <StepIcon status={s.status} />
          <span className={s.status === "done" ? "text-muted line-through" : "text-foreground"}>{s.label}</span>
          {s.detail && <span className="truncate text-[10px] text-muted">· {s.detail}</span>}
        </motion.div>
      ))}
    </div>
  );
}

/** Versión plegada, para no dejar el historial lleno de pasos ya cumplidos. */
function StepsSummary({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-fit text-[10px] uppercase tracking-wide text-muted transition-colors hover:text-foreground"
      >
        {open ? "▾" : "▸"} Cómo lo ha averiguado
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <StepsList steps={steps} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Nivel de confianza. El número NO lo decide el modelo: sale de reglas
 * fijas sobre las fuentes, el contraste con AniList y la antigüedad de la
 * información (ver lib/confidence.ts). Por eso se puede desplegar el
 * porqué: cada punto tiene una razón concreta detrás.
 */
function ConfidenceCard({ confidence }: { confidence: Confidence }) {
  const [expanded, setExpanded] = useState(false);
  const color = CONFIDENCE_COLOR[confidence.level];

  return (
    <div className="rounded-xl border border-panel-border/70 bg-panel-soft/40 px-2.5 py-2">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Confianza</span>
        <span className="text-[11px] font-medium capitalize" style={{ color }}>
          {confidence.level}
        </span>
        <span className="text-[10px] text-muted">{confidence.score}/100</span>
        <span className="ml-auto block h-1 w-14 overflow-hidden rounded-full bg-panel-border">
          <motion.span
            className="block h-1 rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${confidence.score}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </span>
        <span className="text-[10px] text-muted">{expanded ? "▾" : "▸"}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-2 flex flex-col gap-1 overflow-hidden"
          >
            {confidence.reasons.map((r, i) => (
              <li key={i} className="flex gap-1.5 text-[10px] leading-snug text-muted">
                <span style={{ color }}>·</span>
                {r}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function SourcesList({ sources }: { sources: ResearchSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-panel-border/70 bg-panel-soft/40 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Fuentes consultadas</p>
      {sources.map((src, si) => (
        <a
          key={si}
          href={src.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-1.5 transition-opacity hover:opacity-80"
        >
          <span
            className="mt-[5px] h-[5px] w-[5px] flex-shrink-0 rounded-full"
            style={{ background: TIER_COLOR[src.tier] }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] leading-snug text-foreground">{src.title}</span>
            <span className="text-[10px]" style={{ color: TIER_COLOR[src.tier] }}>
              {TIER_LABEL[src.tier]}
            </span>
            <span className="text-[10px] text-muted"> · {src.domain}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

function initialMessages(): Message[] {
  // Cada vez que entras en la página, la conversación visible empieza
  // limpia — Ren no continúa el hilo de antes. El archivo de memoria (con
  // los temas ya hablados) sigue intacto por debajo para que pueda
  // recordarlos si se lo preguntas, solo no se muestra de golpe.
  return [];
}

export function AssistantOrb() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [archive, setArchive] = useState<Message[]>(loadArchive);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [streamText, setStreamText] = useState("");
  const [liveSources, setLiveSources] = useState<ResearchSource[]>([]);
  const [liveConfidence, setLiveConfidence] = useState<Confidence | null>(null);
  const [slowResponse, setSlowResponse] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const appendToArchive = (msgs: Message[]) => {
    setArchive((prev) => {
      const next = [...prev, ...msgs];
      saveArchive(next);
      return next;
    });
  };

  const handleClearChat = () => {
    setMessages([]);
    setArchive([]);
    window.localStorage.removeItem(ARCHIVE_KEY);
    setConfirmingClear(false);
  };

  useEffect(() => {
    if (open && !prefs) {
      const p = getPreferences();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefs(p);
      if (messages.length === 0) {
        const name = p.displayName ? `, ${p.displayName}` : "";
        const greeting: Message = {
          role: "assistant",
          content: `Hola${name}. Soy ${siteConfig.assistantName}. Si me preguntas por fechas, temporadas o rumores de una serie, lo busco de verdad y te digo qué está confirmado y qué no. También puedo charlar de anime sin más. ¿Qué te apetece?`,
          ts: Date.now(),
        };
        setMessages([greeting]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  /**
   * Guarda el mensaje de Ren en la conversación y en el archivo, ejecuta
   * sus acciones y refuerza la afinidad de las series mencionadas.
   * Lo comparten la vía en directo y la de respaldo.
   */
  const commitAssistantReply = (
    rawReply: string,
    extras: { sources?: ResearchSource[]; confidence?: Confidence | null; steps?: Step[] },
    boostedTitles: Set<string>
  ) => {
    const { cleanText, actions, interests } = parseAndRunActions(rawReply);
    const assistantMessage: Message = {
      role: "assistant",
      content: cleanText || rawReply,
      actions,
      sources: extras.sources && extras.sources.length > 0 ? extras.sources : undefined,
      confidence: extras.confidence ?? undefined,
      steps: extras.steps && extras.steps.length > 0 ? extras.steps : undefined,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMessage]);
    appendToArchive([assistantMessage]);
    playReceive();

    // Series que Ren ha marcado como interesantes durante la charla. El
    // título ya se ha guardado al leer la etiqueta; aquí solo se
    // completan géneros y estudio, en segundo plano.
    interests
      .filter((title) => !boostedTitles.has(title.toLowerCase()))
      .slice(0, 2)
      .forEach(async (title) => {
        try {
          const res = await fetch(`/api/anime-facts?title=${encodeURIComponent(title)}`);
          const data = (await res.json()) as { facts?: { genres?: string[]; studios?: string[] } | null };
          if (data.facts) boostCategories(data.facts.genres ?? [], data.facts.studios ?? []);
        } catch {
          // La afinidad es una mejora, no algo crítico: si falla, se ignora.
        }
      });
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text, ts: Date.now() };
    const nextMessages: Message[] = [...messages, userMessage];
    setMessages(nextMessages);
    appendToArchive([userMessage]);
    setInput("");
    playSend();
    setLoading(true);
    setPhase("idle");
    setSteps([]);
    setStreamText("");
    setLiveSources([]);
    setLiveConfidence(null);
    const slowTimer = setTimeout(() => setSlowResponse(true), 4000);

    const boostedTitles = new Set<string>();

    try {
      // Se pausa la traducción de fondo de la lista mientras Ren espera
      // respuesta — la cola con prioridad decide el ORDEN, pero no
      // libera cupo de tokens/minuto ya gastado por Groq; sin esto, si
      // la lista estaba traduciendo justo cuando se le habla a Ren, se
      // quedaba sin presupuesto y Ren fallaba con "servidores llenos".
      setBackgroundPaused(true);

      const currentPrefs = getPreferences();
      const priorTopics = buildPriorTopicsSummary(archive);
      const contextText = buildAssistantContext(currentPrefs) + (priorTopics ? `\n\n${priorTopics}` : "");

      // Groq valida el formato de los mensajes de forma estricta: SOLO
      // acepta "role" y "content", nada más. Los mensajes de la interfaz
      // llevan además "ts" (y a veces "actions") para uso interno — si
      // se mandan tal cual, Groq responde 400 "property 'ts' is
      // unsupported" en cuanto hay más de un mensaje en la conversación.
      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const willResearch = shouldResearch(text).needed;
      setPhase(willResearch ? "research" : "writing");

      const estimatedTokens = 500 + (willResearch ? 1600 : 0) +
        nextMessages.reduce((sum, m) => sum + m.content.length / 3, 0);

      // ---- VÍA PRINCIPAL: respuesta en directo -----------------------
      // Un único stream que va contando los pasos reales (buscar,
      // contrastar, redactar) y luego escribe la respuesta trozo a
      // trozo. Todo dentro de la misma cola de peticiones que el resto
      // de la app, con prioridad alta.
      const streamed = await runExclusive(async () => {
        await waitForTokenBudget(estimatedTokens, "high");
        const result = await runStreamingTurn({
          apiMessages,
          contextText,
          question: text,
          onStep: (step) =>
            setSteps((prev) => {
              const idx = prev.findIndex((s) => s.id === step.id);
              if (idx === -1) return [...prev, step];
              const copy = [...prev];
              copy[idx] = step;
              return copy;
            }),
          onSources: (payload) => {
            setLiveSources(payload.sources);
            setLiveConfidence(payload.confidence);
            setPhase("writing");
            if (payload.facts?.title) {
              recordAnimeInterest(
                payload.facts.title,
                payload.facts.genres ?? [],
                payload.facts.studios ?? []
              );
              boostedTitles.add(payload.facts.title.toLowerCase());
            }
          },
          onToken: (chunk) => setStreamText((prev) => prev + chunk),
        });
        recordTokenUsage(estimatedTokens);
        return result;
      }, "high");

      if (streamed.ok) {
        commitAssistantReply(
          streamed.raw,
          { sources: streamed.sources, confidence: streamed.confidence, steps: streamed.steps },
          boostedTitles
        );
        return;
      }

      // ---- RESPALDO: el mismo trabajo, pero de golpe -----------------
      // Si el streaming no llega (proxy que lo corta, hosting que lo
      // acumula, red rara), se repite por las rutas clásicas en vez de
      // dejar al usuario sin respuesta.
      setSteps([]);
      setStreamText("");

      let research: { dossier: string; factsText: string; confidenceLine: string } | undefined;
      let researchSources: ResearchSource[] = [];
      let confidence: Confidence | null = null;

      if (willResearch) {
        setPhase("research");
        try {
          const r = (await runExclusive(async () => {
            await waitForTokenBudget(1600, "high");
            const res = await fetch("/api/assistant/research", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ question: text }),
            }).then((res) => res.json());
            recordTokenUsage(1600);
            return res;
          }, "high")) as ResearchResponse;

          if (r?.dossier || r?.factsText) {
            research = {
              dossier: r.dossier ?? "",
              factsText: r.factsText ?? "",
              confidenceLine: r.confidenceLine ?? "",
            };
          }
          researchSources = r?.sources ?? [];
          confidence = r?.confidence ?? null;
          if (confidence) setLiveConfidence(confidence);
          setLiveSources(researchSources);

          if (r?.facts?.title && !boostedTitles.has(r.facts.title.toLowerCase())) {
            recordAnimeInterest(r.facts.title, r.facts.genres ?? [], r.facts.studios ?? []);
            boostedTitles.add(r.facts.title.toLowerCase());
          }
        } catch {
          // Si la investigación falla, Ren responde igualmente con lo que
          // sabe — mejor una respuesta sin verificar que ninguna.
        }
      }

      setPhase("writing");

      const callAssistant = (preferFallback: boolean) =>
        runExclusive(async () => {
          await waitForTokenBudget(estimatedTokens, "high");
          const result = await fetch("/api/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: apiMessages, context: contextText, preferFallback, research }),
          }).then((r) => r.json());
          recordTokenUsage(estimatedTokens);
          return result;
        }, "high") as Promise<{ reply?: string; error?: string; debug?: string }>;

      let data = await callAssistant(false);
      if (!data.reply) {
        await new Promise((r) => setTimeout(r, 1500));
        data = await callAssistant(true);
      }

      const debugSuffix = data.debug ? `\n\n(detalle técnico: ${data.debug})` : "";
      const rawReply: string = data.reply
        ? data.reply
        : `Los servidores están más llenos de lo normal ahora mismo y no consigo responder. Prueba otra vez en un momento.${debugSuffix}`;

      commitAssistantReply(rawReply, { sources: researchSources, confidence }, boostedTitles);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Se ha cortado la conexión. Inténtalo otra vez." },
      ]);
    } finally {
      clearTimeout(slowTimer);
      setSlowResponse(false);
      setLoading(false);
      setPhase("idle");
      setSteps([]);
      setStreamText("");
      setLiveSources([]);
      setLiveConfidence(null);
      setBackgroundPaused(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed bottom-24 right-5 z-40 h-[29rem] w-[23rem] max-w-[calc(100vw-2.5rem)] rounded-[1.75rem] p-[1px] shadow-2xl shadow-black/60 sm:right-6"
          >
            {/* Borde sutil con degradado — separado del contenido para un acabado más cuidado */}
            <div
              className="absolute inset-0 rounded-[1.75rem] opacity-60"
              style={{ background: "linear-gradient(160deg, var(--ice), transparent 40%, transparent 70%, var(--accent-via))" }}
            />
            <div className="panel relative flex h-full w-full flex-col overflow-hidden rounded-[1.7rem]">
              <div className="relative flex items-center gap-3 border-b border-panel-border/70 px-5 py-4">
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-25"
                  style={{ background: "radial-gradient(120px 60px at 20% 0%, var(--ice), transparent 70%)" }}
                />
                <Orb active={false} size={32} />
                <div className="relative">
                  <p className="font-heading text-sm font-semibold">{siteConfig.assistantName}</p>
                  <p className="text-[11px] text-muted">
                    {phase === "research" ? "investigando…" : loading ? "escribiendo…" : "en línea"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingClear(true);
                    playToggle();
                  }}
                  onMouseEnter={playHover}
                  aria-label="Borrar conversación"
                  title="Borrar conversación"
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-soft hover:text-foreground"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    playToggle();
                  }}
                  onMouseEnter={playHover}
                  aria-label="Cerrar"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-soft hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4">
                <div className="flex flex-col gap-3">
                  {messages.map((m, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex items-end gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      {m.role === "assistant" && <Orb active={false} size={16} />}
                      <div className="flex max-w-[78%] flex-col gap-1.5">
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                            m.role === "user"
                              ? "accent-gradient text-white"
                              : "panel-elevated border border-panel-border/70 text-foreground"
                          }`}
                        >
                          {m.content}
                        </div>
                        {m.actions?.map((a, ai) => (
                          <span
                            key={ai}
                            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-ice/30 bg-ice/10 px-2.5 py-1 text-[11px] font-medium text-ice"
                          >
                            ✓ {a.result}
                          </span>
                        ))}
                        {m.confidence && <ConfidenceCard confidence={m.confidence} />}
                        {m.sources && <SourcesList sources={m.sources} />}
                        {m.steps && <StepsSummary steps={m.steps} />}
                      </div>
                    </motion.div>
                  ))}
                  {loading && (
                    <div className="flex w-full flex-col items-start gap-2">
                      {/* Lo que está haciendo AHORA: pasos reales, fuentes y
                          confianza aparecen en cuanto se saben, sin esperar
                          a que termine de escribir. */}
                      {steps.length > 0 && (
                        <div className="w-full pl-6">
                          <StepsList steps={steps} />
                        </div>
                      )}
                      {liveConfidence && (
                        <div className="w-full pl-6">
                          <ConfidenceCard confidence={liveConfidence} />
                        </div>
                      )}
                      {liveSources.length > 0 && (
                        <div className="w-full pl-6">
                          <SourcesList sources={liveSources} />
                        </div>
                      )}

                      {streamText ? (
                        <div className="flex items-end gap-2">
                          <Orb active={false} size={16} />
                          <div className="panel-elevated max-w-[78%] rounded-2xl border border-panel-border/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground">
                            {streamText}
                            {/* Cursor de escritura: se ve que está redactando en vivo. */}
                            <motion.span
                              className="ml-0.5 inline-block h-3 w-[2px] align-middle"
                              style={{ background: "var(--ice)" }}
                              animate={{ opacity: [1, 0.15, 1] }}
                              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-end gap-2">
                          <Orb active={false} size={16} />
                          <div className="panel-elevated flex items-center rounded-2xl border border-panel-border/70 px-2 py-1">
                            <TypingDots />
                          </div>
                        </div>
                      )}

                      {!streamText && phase === "research" && steps.length === 0 && (
                        <p className="ml-8 text-[11px] text-muted">
                          Buscando en fuentes oficiales y contrastando rumores…
                        </p>
                      )}
                      {!streamText && phase !== "research" && slowResponse && (
                        <p className="ml-8 text-[11px] text-muted">
                          Los servidores están más llenos de lo normal, tardando un poco más…
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-panel-border/70 bg-panel-soft/30 p-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Escribe algo…"
                  className="panel-elevated flex-1 rounded-full px-4 py-2.5 text-sm text-foreground outline-none ring-0 transition-shadow placeholder:text-muted focus:shadow-[0_0_0_2px_var(--accent-solid)]"
                />
                <motion.button
                  type="button"
                  onClick={handleSend}
                  whileTap={{ scale: 0.9 }}
                  disabled={loading || input.trim().length === 0}
                  aria-label="Enviar"
                  className="accent-gradient flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white shadow-lg shadow-black/30 disabled:opacity-40"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                  </svg>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-5 right-5 z-40 sm:right-6">
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle, var(--ice), transparent 70%)" }}
          animate={{ scale: [1, 1.7, 1], opacity: [0.35, 0, 0.35] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            playToggle();
          }}
          onMouseEnter={playHover}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          aria-label={`Abrir a ${siteConfig.assistantName}`}
          className="panel relative flex h-16 w-16 items-center justify-center rounded-full border border-ice/25 shadow-xl shadow-black/50"
        >
          <Orb active={false} size={34} />
        </motion.button>
      </div>

      <ConfirmDialog
        open={confirmingClear}
        title="Borrar conversación"
        message={`Esto borra el historial de esta conversación con ${siteConfig.assistantName} (los mensajes que ves aquí). Lo que recuerda de ti a largo plazo (gustos, cómo prefieres que te trate) no se toca — eso se borra aparte, desde Ajustes → Privacidad. No se puede deshacer.`}
        onConfirm={handleClearChat}
        onCancel={() => setConfirmingClear(false)}
      />
    </>
  );
}
