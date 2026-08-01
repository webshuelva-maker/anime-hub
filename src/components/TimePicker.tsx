"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { playToggle, playClick } from "@/lib/sound";

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

/**
 * Selector de hora — reescrito desde cero. Antes eran dos <select>
 * nativos del navegador, sin ningún estilo propio más allá del fondo.
 * Ahora: un botón que abre un panel flotante con las horas y minutos en
 * dos columnas desplazables, con la selección actual resaltada con el
 * degradado de acento — más en línea con el resto de la interfaz.
 */
export function TimePicker({
  value,
  onChange,
}: {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [h, m] = value.split(":");
  const closestMinute = MINUTES.reduce((best, opt) =>
    Math.abs(Number(opt) - Number(m || "0")) < Math.abs(Number(best) - Number(m || "0")) ? opt : best
  , "00");
  const hour = h || "08";

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          playToggle();
        }}
        className="panel-elevated flex items-center gap-2 rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-ice/40"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ice">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" strokeLinecap="round" />
        </svg>
        {hour}:{closestMinute} h
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="panel absolute left-0 top-full z-20 mt-2 flex overflow-hidden rounded-xl border border-panel-border shadow-xl shadow-black/40"
          >
            <div className="max-h-52 w-16 overflow-y-auto scrollbar-thin border-r border-panel-border py-1">
              {HOURS.map((hh) => (
                <button
                  key={hh}
                  type="button"
                  onClick={() => {
                    onChange(`${hh}:${closestMinute}`);
                    playClick();
                  }}
                  className={`block w-full px-4 py-1.5 text-center text-sm transition-colors ${
                    hh === hour ? "accent-gradient font-semibold text-white" : "text-muted hover:bg-panel-soft hover:text-foreground"
                  }`}
                >
                  {hh}
                </button>
              ))}
            </div>
            <div className="w-16 py-1">
              {MINUTES.map((mm) => (
                <button
                  key={mm}
                  type="button"
                  onClick={() => {
                    onChange(`${hour}:${mm}`);
                    playClick();
                  }}
                  className={`block w-full px-4 py-1.5 text-center text-sm transition-colors ${
                    mm === closestMinute ? "accent-gradient font-semibold text-white" : "text-muted hover:bg-panel-soft hover:text-foreground"
                  }`}
                >
                  {mm}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
