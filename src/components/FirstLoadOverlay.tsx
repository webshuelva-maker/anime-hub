"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getPreferences } from "@/lib/storage";
import { runExclusive, waitForTokenBudget, recordTokenUsage } from "@/lib/apiQueue";
import { siteConfig } from "@/config/site";

const ROTATE_MS = 4500;
const REFILL_THRESHOLD = 5;
const SHOWN_KEY = "anime-hub:trivia-shown";
const MAX_SHOWN_REMEMBERED = 150; // no hace falta guardar un historial infinito

function loadShownFacts(): string[] {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveShownFacts(facts: string[]) {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(facts.slice(-MAX_SHOWN_REMEMBERED)));
  } catch {
    // localStorage lleno o no disponible — no pasa nada, solo se pierde la deduplicación entre sesiones
  }
}

const FALLBACK_FACTS = [
  "El anime más largo en emisión continua lleva más de 900 episodios.",
  "La palabra \"anime\" en Japón se usa para cualquier animación, no solo la japonesa.",
  "Studio Ghibli nunca ha usado guiones completos tradicionales para algunas películas — Miyazaki dibuja escenas sin saber cómo termina la historia.",
  "El primer anime de televisión japonés fue Otogi Manga Calendar, en 1961.",
];

/**
 * Pantalla de carga a pantalla completa — SOLO en la primera visita real
 * (sin nada en caché todavía). Iteración 3: la barra ya NO depende solo
 * de datos reales a saltos (33%→67%) ni de una espera fija — calcula un
 * tiempo estimado según cuánto trabajo hay (estimatedDurationMs, lo pasa
 * NewsFeed) y avanza de forma continua y asintótica hacia el 99% durante
 * ese tiempo; si la traducción real termina antes, salta a 100 y se
 * cierra; si tarda más de lo estimado, sigue acercándose al 99% sin
 * quedarse nunca clavada. El cierre (onComplete) lo decide ESTE
 * componente, cuando su propio contador llega de verdad a 100 — así
 * nunca desaparece la pantalla a mitad de cuenta.
 */
export function FirstLoadOverlay({
  progress,
  estimatedDurationMs,
  onComplete,
}: {
  progress: number;
  estimatedDurationMs: number;
  onComplete: () => void;
}) {
  const [facts, setFacts] = useState<string[]>(FALLBACK_FACTS);
  const [index, setIndex] = useState(0);
  const shownRef = useRef<string[]>([]);
  const fetchingRef = useRef(false);

  const fetchBatch = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const prefs = getPreferences();
      const estimatedTokens = 1000;
      const data: { facts?: string[] } = await runExclusive(async () => {
        await waitForTokenBudget(estimatedTokens, "normal");
        const res = await fetch("/api/trivia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exclude: shownRef.current,
            genres: prefs.genres,
            favoriteTitles: prefs.favoriteTitles,
          }),
        });
        const json = await res.json();
        recordTokenUsage(estimatedTokens);
        return json;
      }, "normal");
      if (data.facts && data.facts.length > 0) {
        setFacts((prev) => {
          // La primera vez se descartan los fallback estáticos en cuanto
          // llega contenido real de verdad.
          const base = prev === FALLBACK_FACTS ? [] : prev;
          return [...base, ...data.facts!];
        });
      }
    } catch {
      // Si falla, se sigue con lo que ya haya (fallback o lote anterior) — nunca se bloquea la pantalla por esto.
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    shownRef.current = loadShownFacts();
    fetchBatch();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % Math.max(facts.length, 1));
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [facts.length]);

  useEffect(() => {
    const current = facts[index];
    if (current && !shownRef.current.includes(current)) {
      shownRef.current.push(current);
      saveShownFacts(shownRef.current);
    }
    const remaining = facts.length - index;
    if (remaining <= REFILL_THRESHOLD) fetchBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Contador animado dirigido por TIEMPO ESTIMADO, no por los saltos
  // discretos de "progress" (que solo cambia cuando un lote entero
  // termina, ej. de 33% a 67% de golpe). Se acerca al 99% de forma
  // asintótica durante estimatedDurationMs — nunca lo alcanza del todo
  // por sí solo, así que si el trabajo real tarda más de lo estimado, la
  // barra sigue viéndose avanzar (cada vez más despacio) en vez de
  // quedarse clavada esperando. En cuanto progress llega a 1 (traducción
  // real terminada), el objetivo pasa a ser 100 de verdad, y al
  // alcanzarlo se avisa a NewsFeed (onComplete) para cerrar la pantalla
  // — el cierre queda así atado al contador, nunca antes.
  const [displayPct, setDisplayPct] = useState(0);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let raf: number;
    let finished = false;
    const startTime = performance.now();
    const tick = (now: number) => {
      if (finished) return;
      const elapsed = now - startTime;
      const asymptotic = 99 * (1 - Math.exp(-elapsed / estimatedDurationMs));
      const done = progressRef.current >= 1;
      const value = done ? 100 : Math.min(99, asymptotic);
      setDisplayPct((prev) => (value > prev ? value : prev));
      if (value >= 100) {
        finished = true;
        onCompleteRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Solo se reinicia si cambia la duración estimada (ej. porque llegó
    // más trabajo a traducir) — nunca por progress, que se lee siempre
    // fresco vía la ref de arriba.
  }, [estimatedDurationMs]);

  const pct = Math.round(displayPct);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 text-center"
      style={{ background: "var(--background)" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Resplandores ambientales — se mueven despacio Y laten, sensación
          de "respiración" en vez de simple parpadeo de opacidad */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/3 h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, var(--ice) 0%, transparent 70%)", filter: "blur(60px)" }}
        animate={{ opacity: [0.08, 0.2, 0.08], x: [0, 30, -10, 0], y: [0, -20, 15, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-1/3 h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, var(--accent-from) 0%, transparent 70%)", filter: "blur(60px)" }}
        animate={{ opacity: [0.06, 0.18, 0.06], x: [0, -25, 15, 0], y: [0, 20, -15, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="font-heading text-lg tracking-[0.15em] text-foreground/90"
      >
        {siteConfig.name}
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
        className="mt-1 text-xs uppercase tracking-[0.2em] text-muted"
      >
        Preparando tu feed
      </motion.p>

      {/* Barra de progreso real, crece desde el centro hacia los lados.
          El ancho sigue a "pct" (el contador animado de arriba, no el
          dato en crudo) — así avanza número a número de forma continua
          en vez de saltar directamente al siguiente valor real. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative mt-8 h-[3px] w-56 overflow-hidden rounded-full"
        style={{ background: "var(--panel-border)" }}
      >
        <motion.div
          className="absolute inset-y-0 left-1/2 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--accent-from), var(--ice))", x: "-50%", width: `${pct}%` }}
        />
      </motion.div>
      <p className="mt-2 text-[11px] tabular-nums text-muted">{pct}%</p>

      <div className="mt-8 h-20 w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
            className="text-[15px] leading-relaxed text-foreground/85"
          >
            {facts[index] ?? ""}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Botón de omitir: aparece una vez hay avance real de sobra (35%)
          — para entonces lo esencial ya suele estar listo. Deja entrar
          ya, con lo que haya; seguir esperando trae más noticias
          traducidas y personalizadas de una sentada. */}
      <AnimatePresence>
        {pct >= 35 && (
          <motion.button
            type="button"
            onClick={onComplete}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute bottom-6 right-6 flex flex-col items-end gap-1"
          >
            <span className="rounded-full border border-panel-border bg-panel px-4 py-2 text-xs font-medium text-foreground/90 transition-colors hover:border-ice/40 hover:text-foreground">
              Omitir →
            </span>
            <span className="max-w-[180px] text-right text-[10px] leading-tight text-muted">
              Esperar un poco más trae más noticias ya traducidas
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
