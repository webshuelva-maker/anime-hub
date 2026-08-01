"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getPreferences } from "@/lib/storage";

const ROTATE_MS = 4500;
const REFILL_THRESHOLD = 5;

const FALLBACK_FACTS = [
  "El anime más largo en emisión continua lleva más de 900 episodios.",
  "La palabra \"anime\" en Japón se usa para cualquier animación, no solo la japonesa.",
  "Studio Ghibli nunca ha usado guiones completos tradicionales para algunas películas — Miyazaki dibuja escenas sin saber cómo termina la historia.",
  "El primer anime de televisión japonés fue Otogi Manga Calendar, en 1961.",
];

/**
 * Pantalla de carga a pantalla completa — SOLO en la primera visita real
 * (sin nada en caché todavía). Mientras se cargan y traducen las
 * primeras noticias, se muestran curiosidades de anime generadas por IA,
 * en lotes, sin repetirse — cuando quedan pocas por mostrar, se pide un
 * lote nuevo evitando las ya vistas.
 */
export function FirstLoadOverlay() {
  const [facts, setFacts] = useState<string[]>(FALLBACK_FACTS);
  const [index, setIndex] = useState(0);
  const shownRef = useRef<string[]>([]);
  const fetchingRef = useRef(false);

  const fetchBatch = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const prefs = getPreferences();
      const res = await fetch("/api/trivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exclude: shownRef.current,
          genres: prefs.genres,
          favoriteTitles: prefs.favoriteTitles,
        }),
      });
      const data: { facts?: string[] } = await res.json();
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
    if (current && !shownRef.current.includes(current)) shownRef.current.push(current);
    const remaining = facts.length - index;
    if (remaining <= REFILL_THRESHOLD) fetchBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--background)" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div
        className="mb-8 h-9 w-9 rounded-full"
        style={{
          border: "3px solid rgba(255,255,255,0.15)",
          borderTopColor: "rgba(255,255,255,0.8)",
          animation: "spin 1.1s linear infinite",
        }}
      />

      <p className="font-heading text-sm uppercase tracking-[0.2em] text-muted">Preparando tu feed</p>

      <div className="mt-6 h-20 w-full max-w-md">
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
