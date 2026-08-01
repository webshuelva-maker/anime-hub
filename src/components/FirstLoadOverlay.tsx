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
 * (sin nada en caché todavía). Iteración 2: fuera el círculo giratorio
 * (además de la manía de "se ve rapidísimo", cualquier animación con
 * "infinite" corre el riesgo de reventar con prefers-reduced-motion mal
 * gestionado, ver globals.css). En su lugar, una barra de progreso REAL
 * que crece desde el centro hacia los lados según cuántas noticias del
 * primer lote ya se han traducido — no es decorativa, informa de verdad
 * — más dos resplandores ambientales muy suaves a los lados para que se
 * sienta más cuidado, y las curiosidades de siempre.
 */
export function FirstLoadOverlay({ progress }: { progress: number }) {
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
        await waitForTokenBudget(estimatedTokens);
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

  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 text-center"
      style={{ background: "var(--background)" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Resplandores ambientales — muy lentos y suaves, decoración pura */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/3 h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, var(--ice) 0%, transparent 70%)", filter: "blur(60px)" }}
        animate={{ opacity: [0.08, 0.18, 0.08] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-1/3 h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, var(--accent-from) 0%, transparent 70%)", filter: "blur(60px)" }}
        animate={{ opacity: [0.06, 0.16, 0.06] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
      />

      <p className="font-heading text-lg tracking-[0.15em] text-foreground/90">{siteConfig.name}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">Preparando tu feed</p>

      {/* Barra de progreso real, crece desde el centro hacia los lados */}
      <div className="relative mt-8 h-[3px] w-56 overflow-hidden rounded-full" style={{ background: "var(--panel-border)" }}>
        <motion.div
          className="absolute inset-y-0 left-1/2 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--accent-from), var(--ice))", x: "-50%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <p className="mt-2 text-[11px] tabular-nums text-muted">{pct}%</p>

      <div className="mt-8 h-20 w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="text-[15px] leading-relaxed text-foreground/85"
          >
            {facts[index] ?? ""}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
