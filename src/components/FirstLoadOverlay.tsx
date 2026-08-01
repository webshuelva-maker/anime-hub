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
 * (sin nada en caché todavía). Iteración 4: la barra respeta SIEMPRE el
 * tiempo mínimo calculado (estimatedDurationMs, lo pasa NewsFeed según
 * cuánto hay que traducir) para ir de 0 a 100 — si el trabajo real
 * termina antes, la barra NO se acelera ni salta, sigue su ritmo normal
 * (antes hacía eso, y si la traducción iba rápida la pantalla
 * desaparecía casi al instante, sin dar tiempo ni a ver el botón de
 * omitir). Si el trabajo real tarda más de lo estimado, sigue
 * acercándose al 99% sin quedarse nunca clavada. Solo llega a 100 (y
 * cierra, vía onComplete) cuando se cumplen LAS DOS cosas: ya pasó el
 * tiempo mínimo Y el trabajo real terminó de verdad.
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
      const t = elapsed / estimatedDurationMs;
      const done = progressRef.current >= 1;
      const minTimeElapsed = t >= 1;

      let value: number;
      if (done && minTimeElapsed) {
        // Las dos condiciones cumplidas: trabajo real terminado Y ya ha
        // pasado el tiempo mínimo calculado — ahora sí, a 100 y se cierra.
        value = 100;
      } else if (t <= 1) {
        // Fase normal: curva de frenado suave hacia 99%, ritmo fijado
        // por el tiempo estimado — NUNCA se acelera solo porque el
        // trabajo real ya haya terminado (eso es justo lo que hacía que
        // la pantalla desapareciera de golpe sin llegar a enseñar nada,
        // ni el botón de omitir, si la traducción iba rápida).
        value = 99 * (1 - Math.pow(1 - t, 2));
      } else {
        // Se pasó del tiempo estimado y el trabajo real AÚN no ha
        // terminado — sigue acercándose muy despacio a ~99.7% en vez de
        // quedarse clavada esperando.
        const overtime = elapsed - estimatedDurationMs;
        value = 99 + 0.7 * (1 - Math.exp(-overtime / 4000));
      }

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

  // En vez de un foco de luz suelto seguiendo al cursor 1:1 (se sentía
  // como "arrastrar un círculo por la pantalla", repetitivo) — un
  // paralaje sutil: los DOS resplandores que ya respiran solos también
  // se desplazan un poco según dónde esté el ratón, en direcciones
  // opuestas entre sí, dando sensación de profundidad/reacción real de
  // la escena en vez de un elemento nuevo pegado al puntero.
  const glow1WrapRef = useRef<HTMLDivElement>(null);
  const glow2WrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const relX = e.clientX / window.innerWidth - 0.5; // -0.5 a 0.5
      const relY = e.clientY / window.innerHeight - 0.5;
      if (glow1WrapRef.current) {
        glow1WrapRef.current.style.transform = `translate(${relX * 50}px, ${relY * 35}px)`;
      }
      if (glow2WrapRef.current) {
        glow2WrapRef.current.style.transform = `translate(${relX * -40}px, ${relY * -30}px)`;
      }
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  const [skipHovered, setSkipHovered] = useState(false);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 text-center"
      style={{ background: "var(--background)" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Resplandores ambientales — respiran solos (opacidad + deriva
          propia vía framer-motion) Y además reaccionan al ratón (el
          div contenedor de fuera, movido directamente por ref para que
          vaya fino a 60fps sin generar un render por cada movimiento). */}
      <div ref={glow1WrapRef} className="pointer-events-none absolute -left-32 top-1/3">
        <motion.div
          aria-hidden
          className="h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, var(--ice) 0%, transparent 70%)", filter: "blur(60px)" }}
          animate={{ opacity: [0.08, 0.2, 0.08], x: [0, 30, -10, 0], y: [0, -20, 15, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <div ref={glow2WrapRef} className="pointer-events-none absolute -right-32 bottom-1/3">
        <motion.div
          aria-hidden
          className="h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, var(--accent-from) 0%, transparent 70%)", filter: "blur(60px)" }}
          animate={{ opacity: [0.06, 0.18, 0.06], x: [0, -25, 15, 0], y: [0, 20, -15, 0] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        />
      </div>

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
          traducidas y personalizadas de una sentada. La explicación solo
          aparece al pasar el ratón, como una etiqueta flotante — así no
          hay texto pequeño permanente compitiendo con el resto. */}
      <AnimatePresence>
        {pct >= 35 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute bottom-6 right-6 flex flex-col items-end gap-2"
            onMouseEnter={() => setSkipHovered(true)}
            onMouseLeave={() => setSkipHovered(false)}
          >
            <AnimatePresence>
              {skipHovered && (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.25 }}
                  className="max-w-[190px] rounded-lg border border-panel-border bg-panel px-3 py-2 text-right text-[11px] leading-snug text-muted shadow-lg"
                >
                  Esperar un poco más trae más noticias ya traducidas y personalizadas
                </motion.span>
              )}
            </AnimatePresence>
            <motion.button
              type="button"
              onClick={onComplete}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="rounded-full border border-panel-border bg-panel px-4 py-2 text-xs font-medium text-foreground/90 hover:border-ice/40 hover:text-foreground"
            >
              Omitir →
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
