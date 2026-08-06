"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { getPreferences } from "@/lib/storage";
import { buildAssistantContext } from "@/lib/assistantContext";
import { useRouter } from "next/navigation";
import { parseAndRunActions, AssistantAction, AssistantLink } from "@/lib/assistantActions";
import { ResearchSource } from "@/lib/sourceTiers";
import { AvisoProactivo } from "./AvisoProactivo";
import { Confidence } from "@/lib/confidence";
import { recordAnimeInterest } from "@/lib/learning";
import { savePreferences } from "@/lib/storage";
import { UserPreferences } from "@/types/news";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  playToggle,
  playSend,
  playReceive,
  playHover,
  playAbrirAsistente,
  playCerrarAsistente,
} from "@/lib/sound";
import { setBackgroundPaused, waitForTokenBudget, recordTokenUsage } from "@/lib/apiQueue";

interface Message {
  role: "user" | "assistant";
  content: string;
  /*
   * Marca los mensajes que el usuario YA ha visto aparecer letra a letra
   * mientras se escribían en directo.
   *
   * Mientras Iris responde, el texto se pinta en una burbuja temporal. Al
   * terminar, esa burbuja se sustituye por el mensaje definitivo, que es
   * un elemento NUEVO y por tanto reproducía su animación de entrada: el
   * mensaje ya escrito parpadeaba y volvía a entrar desde abajo. Con esta
   * marca, el definitivo aparece sin animación y el relevo no se nota.
   */
  streamed?: boolean;
  actions?: AssistantAction[];
  /** Fuentes reales consultadas si esta respuesta salió de una investigación. */
  sources?: ResearchSource[];
  /** Nivel de confianza calculado con reglas fijas (ver lib/confidence.ts). */
  confidence?: Confidence;
  /** Pasos que dio Ren, guardados para poder repasarlos después. */
  steps?: Step[];
  /** Botones para ir a una sección de la app. */
  links?: AssistantLink[];
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
  webFailed?: boolean;
  canonicalTitle?: string | null;
  debug?: string;
}

/**
 * ¿El resultado de AniList se corresponde de verdad con lo que se buscó?
 * Se comparan las palabras significativas: basta con que compartan una.
 * Es tosco a propósito — solo hace falta descartar los casos en los que
 * la base devuelve una serie que no tiene nada que ver con lo preguntado.
 */
function titlesMatch(asked: string, found: string): boolean {
  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3);

  const a = norm(asked);
  const b = norm(found);
  if (a.length === 0 || b.length === 0) return false;
  return a.some((w) => b.includes(w)) || b.some((w) => a.includes(w));
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
  onStep: (step: Step) => void;
  onSources: (payload: {
    sources: ResearchSource[];
    topic?: string | null;
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
      body: JSON.stringify({ messages: opts.apiMessages, context: opts.contextText }),
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
            topic?: string | null;
            facts: { title: string; genres: string[]; studios: string[] } | null;
          };
          sources = payload.sources ?? [];
          opts.onSources(payload);
        } else if (event === "token") {
          const chunk = String(data.text ?? "");
          visible += chunk;
          opts.onToken(chunk);
        } else if (event === "done") {
          raw = String(data.raw ?? "");
          // La confianza llega al final, con la respuesta ya escrita:
          // enseñarla antes es valorar algo que todavía no se ha dicho.
          if (data.confidence) confidence = data.confidence as Confidence;
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

const SPARKLE_PATH =
  "M12 1.8C12.9 8.4 15.6 11.1 22.2 12C15.6 12.9 12.9 15.6 12 22.2C11.1 15.6 8.4 12.9 1.8 12C8.4 11.1 11.1 8.4 12 1.8Z";

/**
 * La marca de Ren: un destello de cuatro puntas, del tipo que se dibuja
 * en el anime para señalar algo brillante. Sustituye al círculo anterior,
 * que no decía nada y parecía un icono de sistema.
 */
function Sparkle({ active, size = 24 }: { active: boolean; size?: number }) {
  return (
    <div
      className="relative flex flex-shrink-0 items-center justify-center"
      style={{ height: size, width: size }}
    >
      <motion.div
        className="absolute inset-0 rounded-full blur-md"
        style={{ background: "radial-gradient(circle, var(--ice), transparent 65%)" }}
        animate={{
          opacity: active ? [0.45, 0.85, 0.45] : [0.25, 0.45, 0.25],
          scale: active ? [1, 1.28, 1] : [1, 1.1, 1],
        }}
        transition={{ duration: active ? 1.3 : 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="relative"
        animate={{
          rotate: active ? [0, 10, -6, 0] : [0, 4, 0],
          scale: active ? [1, 1.1, 0.97, 1] : [1, 1.04, 1],
        }}
        transition={{ duration: active ? 1.6 : 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="ren-sparkle" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ice)" />
            <stop offset="100%" stopColor="var(--accent-via)" />
          </linearGradient>
        </defs>
        <path d={SPARKLE_PATH} fill="url(#ren-sparkle)" />
      </motion.svg>
      {/* Destello pequeño de acompañamiento: el detalle que lo hace parecer
          dibujado a mano y no un icono suelto. */}
      <motion.svg
        viewBox="0 0 24 24"
        width={size * 0.36}
        height={size * 0.36}
        className="absolute"
        style={{ top: size * 0.02, right: -size * 0.06 }}
        animate={{ opacity: active ? [0.3, 1, 0.3] : [0.2, 0.6, 0.2], scale: [0.85, 1.1, 0.85] }}
        transition={{ duration: active ? 1.3 : 3.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      >
        <path d={SPARKLE_PATH} fill="var(--ice)" />
      </motion.svg>
    </div>
  );
}

/** Tres destellos que titilan por turnos mientras Ren piensa. */
function ThinkingSparkles() {
  return (
    <div className="flex items-center gap-1.5 px-1.5 py-1">
      {[0, 1, 2].map((i) => (
        <motion.svg
          key={i}
          viewBox="0 0 24 24"
          width={9 - i}
          height={9 - i}
          animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.15, 0.8], rotate: [0, 25, 0] }}
          transition={{ duration: 1.25, repeat: Infinity, delay: i * 0.22, ease: "easeInOut" }}
        >
          <path d={SPARKLE_PATH} fill="var(--ice)" />
        </motion.svg>
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

/**
 * Convierte los pasos que llegan del servidor en UNA frase corta para la
 * cabecera. Antes esto era un panel con pasos, fuentes y un medidor de
 * confianza dentro de la conversación: demasiada cosa para algo que el
 * usuario solo quiere saber de un vistazo mientras espera.
 */
function statusPhrases(steps: Step[], loading: boolean): string[] {
  if (!loading) return ["en línea"];

  const running = new Set(steps.filter((s) => s.status === "running").map((s) => s.id));

  if (running.has("write")) return ["redactando la respuesta…"];

  const phrases: string[] = [];
  if (running.has("search")) phrases.push("consultando fuentes oficiales…");
  if (running.has("rumors")) phrases.push("rastreando rumores…");
  if (running.has("db")) phrases.push("contrastando fichas…");
  if (phrases.length > 0) return phrases;

  if (running.has("intent")) return ["entendiendo la pregunta…"];
  return ["pensando…"];
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
  const [statusTick, setStatusTick] = useState(0);
  const [slowResponse, setSlowResponse] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const router = useRouter();
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
          content: `Hola${name}. Soy ${siteConfig.assistantName}, tu asistente. ¿Qué quieres saber?`,
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

  // Cuando hay varias cosas en marcha a la vez (buscar, rumores,
  // contrastar), la cabecera las va rotando en vez de quedarse en una:
  // así se ve que sigue trabajando y en qué.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setStatusTick((t) => t + 1), 1700);
    return () => clearInterval(id);
  }, [loading]);

  /**
   * Guarda el mensaje de Ren en la conversación y en el archivo, ejecuta
   * sus acciones y refuerza la afinidad de las series mencionadas.
   * Lo comparten la vía en directo y la de respaldo.
   */
  const commitAssistantReply = (
    rawReply: string,
    extras: { sources?: ResearchSource[]; confidence?: Confidence | null; steps?: Step[] },
    boostedTitles: Set<string>,
    // true cuando el texto ya se ha visto escribirse en directo: entonces
    // el mensaje definitivo no debe animarse otra vez.
    yaVistoEnDirecto = false
  ) => {
    const boostedTitlesGlobal = boostedTitles;
    const { cleanText, actions, interests, links, follows } = parseAndRunActions(rawReply);
    const assistantMessage: Message = {
      role: "assistant",
      content: cleanText || rawReply,
      streamed: yaVistoEnDirecto,
      actions,
      sources: extras.sources && extras.sources.length > 0 ? extras.sources : undefined,
      confidence: extras.confidence ?? undefined,
      steps: extras.steps && extras.steps.length > 0 ? extras.steps : undefined,
      links: links.length > 0 ? links : undefined,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMessage]);
    appendToArchive([assistantMessage]);
    playReceive();

    /*
     * Series que el asistente ha pedido añadir a favoritos.
     *
     * Se comprueba PRIMERO contra AniList que existan, y solo entonces se
     * guardan — y la confirmación aparece después, cuando ya está hecho.
     * Este orden es deliberado: la queja era justamente que decía "ya he
     * actualizado tus preferencias" sin haber tocado nada. Si la serie no
     * existe, no se guarda y se dice que no se ha encontrado.
     */
    follows.slice(0, 4).forEach(async (title) => {
      let confirmacion = `No he encontrado ningún anime llamado "${title}"`;
      try {
        // Se usa el buscador, no la ficha: devuelve varios candidatos y
        // tolera nombres a medias ("sao", "re zero"), que es como los
        // escribe la gente al hablar.
        const res = await fetch(`/api/anime-search?q=${encodeURIComponent(title)}`);
        const data = (await res.json()) as {
          results?: { title: string; genres?: string[]; studios?: string[] }[];
        };
        const mejor =
          data.results?.find((r) => titlesMatch(title, r.title)) ?? data.results?.[0] ?? null;
        if (mejor) {
          const canonico = mejor.title;
          const prefs = getPreferences();
          const yaEstaba = prefs.favoriteTitles.some(
            (t) => t.toLowerCase() === canonico.toLowerCase()
          );
          if (!yaEstaba) {
            savePreferences({ ...prefs, favoriteTitles: [...prefs.favoriteTitles, canonico] });
          }
          recordAnimeInterest(canonico, mejor.genres ?? [], mejor.studios ?? []);
          boostedTitlesGlobal.add(canonico.toLowerCase());
          confirmacion = yaEstaba
            ? `${canonico} ya estaba en tus favoritos`
            : `${canonico} añadido a tus favoritos`;
        }
      } catch {
        confirmacion = "No he podido comprobar ese título ahora mismo";
      }

      // La confirmación se añade al mensaje que ya está en pantalla, para
      // que se vea junto a lo que dijo y no como un aviso suelto.
      setMessages((prev) =>
        prev.map((m) =>
          m === assistantMessage
            ? {
                ...m,
                actions: [
                  ...(m.actions ?? []),
                  { type: "seguir" as const, value: title, result: confirmacion },
                ],
              }
            : m
        )
      );
    });

    // Series que Ren ha marcado como interesantes durante la charla. El
    // título ya se ha guardado al leer la etiqueta; aquí solo se
    // se comprueba primero que existan de verdad como anime.
    interests
      .filter((title) => !boostedTitles.has(title.toLowerCase()))
      .slice(0, 2)
      .forEach(async (title) => {
        try {
          const res = await fetch(`/api/anime-search?q=${encodeURIComponent(title)}`);
          const data = (await res.json()) as {
            results?: { title: string; genres?: string[]; studios?: string[] }[];
          };
          const facts = data.results?.find((r) => titlesMatch(title, r.title)) ?? null;
          // AniList siempre devuelve ALGO parecido de nombre, aunque le
          // preguntes por un videojuego. Si lo que vuelve no se parece a
          // lo pedido, no era un anime y no se apunta nada: por eso
          // acababa "Valorant" en la lista de series seguidas.
          if (facts) recordAnimeInterest(facts.title, facts.genres ?? [], facts.studios ?? []);
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
      // Ya no se decide aquí si hay que investigar: lo decide el servidor
      // con un modelo que lee la conversación. El cliente solo enseña los
      // pasos que le van llegando.
      setPhase("research");

      /*
       * El prompt de sistema de Iris ocupa unos 16.000 caracteres — unos
       * 4.000 tokens — y se manda ENTERO en cada mensaje. Aquí se
       * estimaba 1.200 y por eso el control de presupuesto dejaba pasar
       * peticiones que se salían del límite: Groq devolvía 429 con
       * "Limit 6000, Used 2677, Requested 4020" y el usuario veía un
       * error sin motivo aparente.
       *
       * 4.200 es lo que de verdad cuesta la base; a eso se le suma la
       * conversación (aprox. un token por cada 3 caracteres).
       */
      const estimatedTokens =
        4200 + nextMessages.reduce((sum, m) => sum + m.content.length / 3, 0);

      // ---- VÍA PRINCIPAL: respuesta en directo -----------------------
      // Un único stream que va contando los pasos reales (buscar,
      // contrastar, redactar) y luego escribe la respuesta trozo a
      // trozo. Todo dentro de la misma cola de peticiones que el resto
      // de la app, con prioridad alta.
      // Ren YA NO pasa por la cola de tareas de fondo. Esa cola existe
      // para que las traducciones de la lista no se pisen entre ellas; si
      // Ren entra en ella, se queda esperando a que termine lo que
      // hubiera en marcha, y el usuario ve veinte segundos de nada
      // aunque solo haya dicho "hola". La traducción de fondo ya se pausa
      // aparte mientras Ren responde.
      const streamed = await (async () => {
        await waitForTokenBudget(estimatedTokens, "high", 2000);
        const result = await runStreamingTurn({
          apiMessages,
          contextText,
          onStep: (step) => {
            // Si el clasificador dice que no hace falta buscar, se pasa
            // ya a "escribiendo" en vez de dejar "investigando" puesto.
            if (step.id === "intent" && step.status === "done" && step.detail === "no hace falta buscar") {
              setPhase("writing");
            }
            setSteps((prev) => {
              const idx = prev.findIndex((s) => s.id === step.id);
              if (idx === -1) return [...prev, step];
              const copy = [...prev];
              copy[idx] = step;
              return copy;
            });
          },
          onSources: (payload) => {
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
      })();

      if (streamed.ok) {
        commitAssistantReply(
          streamed.raw,
          { sources: streamed.sources, confidence: streamed.confidence, steps: streamed.steps },
          boostedTitles,
          true
        );
        return;
      }

      // ---- RESPALDO: el mismo trabajo, pero de golpe -----------------
      // Si el streaming no llega (proxy que lo corta, hosting que lo
      // acumula, red rara), se repite por las rutas clásicas en vez de
      // dejar al usuario sin respuesta.
      setSteps([]);
      setStreamText("");

      let research:
        | { dossier: string; factsText: string; confidenceLine: string; webFailed: boolean }
        | undefined;
      let researchSources: ResearchSource[] = [];
      let confidence: Confidence | null = null;

      {
        setPhase("research");
        try {
          const r = (await (async () => {
            await waitForTokenBudget(1600, "high", 2000);
            const res = await fetch("/api/assistant/research", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ question: text, messages: apiMessages }),
            }).then((res) => res.json());
            recordTokenUsage(1600);
            return res;
          })()) as ResearchResponse;

          research = {
            dossier: r?.dossier ?? "",
            factsText: r?.factsText ?? "",
            confidenceLine: r?.confidenceLine ?? "",
            webFailed: r?.webFailed === true,
          };
          researchSources = r?.sources ?? [];
          confidence = r?.confidence ?? null;

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
        (async () => {
          await waitForTokenBudget(estimatedTokens, "high", 2000);
          const result = await fetch("/api/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: apiMessages, context: contextText, preferFallback, research }),
          }).then((r) => r.json());
          recordTokenUsage(estimatedTokens);
          return result;
        })() as Promise<{ reply?: string; error?: string; debug?: string }>;

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
            // En el móvil, 29rem fijos + el hueco de abajo se salían de la
            // pantalla visible (la barra del navegador se come parte de
            // 100vh). Con dvh y un máximo calculado, el panel siempre cabe.
            style={{
              transformOrigin: "bottom right",
              // Justo encima del botón, que a su vez se aparta de la
              // barra inferior en móvil (ver --orb-offset en globals.css).
              bottom: "calc(var(--orb-offset) + 4.5rem)",
              height: "min(29rem, calc(100dvh - var(--orb-offset) - 6rem))",
            }}
            className="fixed right-4 z-40 w-[23rem] max-w-[calc(100vw-2rem)] rounded-[1.75rem] p-[1px] shadow-2xl shadow-black/60 sm:right-6"
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
                <Sparkle active={false} size={32} />
                <div className="relative">
                  <p className="font-heading text-sm font-semibold">{siteConfig.assistantName}</p>
                  <p className="text-[11px] text-muted">
                    {(() => {
                      const phrases = statusPhrases(steps, loading || streamText.length > 0);
                      return phrases[statusTick % phrases.length];
                    })()}
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
                      // Clave estable: con el índice, al añadir o quitar un
                      // mensaje React reutilizaba el elemento de otro y las
                      // animaciones se disparaban donde no tocaba.
                      key={m.ts ? `${m.ts}-${m.role}` : `i-${i}`}
                      // Sin animación de entrada si ya se vio escribirse en
                      // directo (ver el comentario del campo "streamed").
                      initial={m.streamed ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex items-end gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      {m.role === "assistant" && <Sparkle active={false} size={16} />}
                      <div className="flex max-w-[78%] flex-col gap-1.5">
                        <div
                          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
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
                        {/* Botones para ir a donde te acaba de explicar. Al
                            pulsarlos se cierra el chat: lo que quieres ver
                            está detrás del panel. */}
                        {m.links?.map((l) => (
                          <motion.button
                            key={l.href}
                            type="button"
                            onClick={() => {
                              playToggle();
                              setOpen(false);
                              router.push(l.href);
                            }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: "spring", stiffness: 400, damping: 22 }}
                            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-ice/40 bg-ice/10 px-3 py-1.5 text-[11px] font-semibold text-ice transition-colors hover:bg-ice/20"
                          >
                            {l.label}
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            >
                              <path d="M5 12h14M13 6l6 6-6 6" />
                            </svg>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                  {loading && (
                    <div className="flex w-full flex-col items-start gap-2">
                      {/* Sin paneles de pasos, fuentes ni confianza: lo que
                          está haciendo se cuenta arriba, en una línea, y
                          aquí solo se ve que está pensando. */}
                      {streamText ? (
                        <div className="flex items-end gap-2">
                          <Sparkle active={false} size={16} />
                          <div className="panel-elevated max-w-[78%] whitespace-pre-wrap rounded-2xl border border-panel-border/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground">
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
                          <Sparkle active size={16} />
                          <div className="panel-elevated flex items-center rounded-2xl border border-panel-border/70 px-2 py-1">
                            <ThinkingSparkles />
                          </div>
                        </div>
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

      {/* Aviso proactivo: si hay novedades de algo que sigue, Iris se
          asoma solo. Al pulsar "Cuéntamelo" se abre el chat con la
          pregunta ya escrita, para no tener que teclearla. */}
      {!open && (
        <AvisoProactivo
          onAbrirChat={(texto) => {
            setOpen(true);
            setInput(texto);
          }}
        />
      )}

      <div
        data-chrome-app
        style={{ bottom: "var(--orb-offset)" }}
        className="fixed right-4 z-40 sm:right-6"
      >
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle, var(--ice), transparent 70%)" }}
          animate={{ scale: [1, 1.7, 1], opacity: [0.35, 0, 0.35] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.button
          type="button"
          onClick={() => {
            /*
               Abrir y cerrar suenan distinto: las mismas notas, al
               revés. Antes los dos usaban el sonido de desplegar y no se
               distinguían.

               El sonido va FUERA del actualizador de estado: React puede
               llamar a esa función dos veces mientras comprueba cosas, y
               el sonido se oiría duplicado.
            */
            if (open) playCerrarAsistente();
            else playAbrirAsistente();
            setOpen((v) => !v);
          }}
          onMouseEnter={playHover}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          aria-label={`Abrir a ${siteConfig.assistantName}`}
          className="panel relative flex h-14 w-14 items-center justify-center rounded-full border border-ice/25 shadow-xl shadow-black/50 sm:h-16 sm:w-16"
        >
          <Sparkle active={false} size={34} />
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
