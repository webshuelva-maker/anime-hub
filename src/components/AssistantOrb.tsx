"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { getPreferences } from "@/lib/storage";
import { buildAssistantContext } from "@/lib/assistantContext";
import { parseAndRunActions, AssistantAction } from "@/lib/assistantActions";
import { UserPreferences } from "@/types/news";

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];
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

export function AssistantOrb() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !prefs) {
      const p = getPreferences();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefs(p);
      if (messages.length === 0) {
        const name = p.displayName ? `, ${p.displayName}` : "";
        setMessages([
          {
            role: "assistant",
            content: `Hola${name}. Soy ${siteConfig.assistantName} — puedo ponerte al día de las noticias, hablarte de lo que sigues, o simplemente charlar de anime. ¿Qué te apetece?`,
          },
        ]);
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

    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const currentPrefs = getPreferences();
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          context: buildAssistantContext(currentPrefs),
        }),
      });
      const data = await res.json();
      const rawReply: string = data.reply || data.error || "No he podido responder.";
      const { cleanText, actions } = parseAndRunActions(rawReply);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: cleanText || rawReply, actions },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Se ha cortado la conexión. Inténtalo otra vez." },
      ]);
    } finally {
      setLoading(false);
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
                    {loading ? "escribiendo…" : "en línea · Llama 3.1 vía NVIDIA"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  className="relative ml-auto flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-soft hover:text-foreground"
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
                    <div className="flex items-end gap-2">
                      <Orb active={false} size={16} />
                      <div className="panel-elevated flex items-center rounded-2xl border border-panel-border/70 px-2 py-1">
                        <TypingDots />
                      </div>
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
          onClick={() => setOpen((v) => !v)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          aria-label={`Abrir a ${siteConfig.assistantName}`}
          className="panel relative flex h-16 w-16 items-center justify-center rounded-full border border-ice/25 shadow-xl shadow-black/50"
        >
          <Orb active={false} size={34} />
        </motion.button>
      </div>
    </>
  );
}
