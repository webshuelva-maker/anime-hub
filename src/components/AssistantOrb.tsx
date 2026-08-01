"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { getPreferences } from "@/lib/storage";
import { buildAssistantContext } from "@/lib/assistantContext";
import { parseAndRunActions, AssistantAction } from "@/lib/assistantActions";
import { UserPreferences } from "@/types/news";
import { ConfirmDialog } from "./ConfirmDialog";
import { playToggle, playSend, playReceive } from "@/lib/sound";
import { runExclusive, setBackgroundPaused, waitForTokenBudget, recordTokenUsage } from "@/lib/apiQueue";

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];
  ts?: number;
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
          content: `Hola${name}. Soy ${siteConfig.assistantName} — puedo ponerte al día de las noticias, hablarte de lo que sigues, o simplemente charlar de anime. ¿Qué te apetece?`,
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
    const slowTimer = setTimeout(() => setSlowResponse(true), 4000);

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

      // Alta prioridad: Ren pasa por la misma cola que la traducción de
      // tarjetas y de detalle (ver apiQueue.ts), pero se cuela delante
      // de cualquier traducción de fondo que aún no
      // haya empezado — el usuario está esperando la respuesta ahora
      // mismo, no es una tarea de fondo.
      // Groq valida el formato de los mensajes de forma estricta: SOLO
      // acepta "role" y "content", nada más. Los mensajes de la interfaz
      // llevan además "ts" (y a veces "actions") para uso interno — si
      // se mandan tal cual, Groq responde 400 "property 'ts' is
      // unsupported" en cuanto hay más de un mensaje en la conversación.
      // Esto es lo que llevaba rompiendo a Ren desde el principio, no el
      // presupuesto de tokens.
      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));

      const callAssistant = (preferFallback: boolean) =>
        runExclusive(async () => {
          const estimatedTokens = 500 + nextMessages.reduce((sum, m) => sum + m.content.length / 3, 0);
          await waitForTokenBudget(estimatedTokens, "high");
          const result = await fetch("/api/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: apiMessages, context: contextText, preferFallback }),
          }).then((r) => r.json());
          recordTokenUsage(estimatedTokens);
          return result;
        }, "high") as Promise<{ reply?: string; error?: string; debug?: string }>;

      let data = await callAssistant(false);
      // Si el primer intento no trae respuesta útil (falló la llamada a
      // Groq), un segundo intento con el modelo de respaldo antes de
      // rendirse — antes un solo fallo ya mostraba "se ha cortado".
      if (!data.reply) {
        await new Promise((r) => setTimeout(r, 1500));
        data = await callAssistant(true);
      }

      // Temporal, para poder ver por fin el motivo real sin mirar los
      // logs de Vercel — quitar esta línea cuando Ren vaya fino.
      // Temporal, para poder ver por fin el motivo real sin mirar los
      // logs de Vercel — quitar esta línea cuando Ren vaya fino.
      const debugSuffix = data.debug ? `\n\n(detalle técnico: ${data.debug})` : "";
      const rawReply: string = data.reply
        ? data.reply
        : `Los servidores están más llenos de lo normal ahora mismo y no consigo responder. Prueba otra vez en un momento.${debugSuffix}`;
      const { cleanText, actions } = parseAndRunActions(rawReply);
      const assistantMessage: Message = { role: "assistant", content: cleanText || rawReply, actions, ts: Date.now() };
      setMessages((prev) => [...prev, assistantMessage]);
      appendToArchive([assistantMessage]);
      playReceive();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Se ha cortado la conexión. Inténtalo otra vez." },
      ]);
    } finally {
      clearTimeout(slowTimer);
      setSlowResponse(false);
      setLoading(false);
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
                    {loading ? "escribiendo…" : "en línea"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(true)}
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
                  onClick={() => setOpen(false)}
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
                      </div>
                    </motion.div>
                  ))}
                  {loading && (
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex items-end gap-2">
                        <Orb active={false} size={16} />
                        <div className="panel-elevated flex items-center rounded-2xl border border-panel-border/70 px-2 py-1">
                          <TypingDots />
                        </div>
                      </div>
                      {slowResponse && (
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
