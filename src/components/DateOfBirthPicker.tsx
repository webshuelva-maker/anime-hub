"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { playToggle, playClick } from "@/lib/sound";

/**
 * Selector de fecha de nacimiento propio, en la línea del TimePicker.
 *
 * El campo de fecha nativo del navegador se ve distinto en cada sistema,
 * suele estar en inglés, y para una fecha de nacimiento es incómodo:
 * abre por el mes actual y hay que retroceder treinta años a golpe de
 * flecha. Aquí van tres columnas —día, mes y año— con el año ordenado del
 * más reciente al más antiguo y arrancando en una edad razonable.
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function diasDelMes(mes: number, anio: number): number {
  return new Date(anio, mes, 0).getDate();
}

export function DateOfBirthPicker({
  value,
  onChange,
}: {
  value: string; // "AAAA-MM-DD" o cadena vacía
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear();
  // Se empieza a ofrecer desde hace 18 años porque es el mínimo del
  // apartado, y se llega hasta 100 atrás.
  const YEARS = Array.from({ length: 83 }, (_, i) => currentYear - 18 - i);

  const [y, m, d] = value ? value.split("-").map(Number) : [0, 0, 0];
  const anio = y || currentYear - 20;
  const mes = m || 1;
  const dia = d || 1;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const emit = (nd: number, nm: number, ny: number) => {
    // Si venías del 31 y cambias a un mes de 30, se ajusta solo en vez de
    // dejar una fecha imposible.
    const maxDia = diasDelMes(nm, ny);
    const diaValido = Math.min(nd, maxDia);
    onChange(
      `${ny}-${String(nm).padStart(2, "0")}-${String(diaValido).padStart(2, "0")}`
    );
    playClick();
  };

  const DIAS = Array.from({ length: diasDelMes(mes, anio) }, (_, i) => i + 1);

  return (
    <div ref={wrapRef} className="relative inline-block w-full">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          playToggle();
        }}
        className="panel-elevated flex w-full items-center gap-2 rounded-xl border border-panel-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-ice/40"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-ice"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
        {value ? (
          <span>
            {dia} de {MESES[mes - 1]} de {anio}
          </span>
        ) : (
          <span className="text-muted">Elige tu fecha de nacimiento</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="panel absolute left-0 top-full z-20 mt-2 flex w-full overflow-hidden rounded-xl border border-panel-border shadow-xl shadow-black/40"
          >
            <div className="scrollbar-thin max-h-56 flex-1 overflow-y-auto border-r border-panel-border py-1">
              {DIAS.map((dd) => (
                <button
                  key={dd}
                  type="button"
                  onClick={() => emit(dd, mes, anio)}
                  className={`block w-full px-3 py-1.5 text-center text-sm transition-colors ${
                    dd === dia && value
                      ? "accent-gradient font-semibold text-white"
                      : "text-muted hover:bg-panel-soft hover:text-foreground"
                  }`}
                >
                  {dd}
                </button>
              ))}
            </div>

            <div className="scrollbar-thin max-h-56 flex-[1.6] overflow-y-auto border-r border-panel-border py-1">
              {MESES.map((nombre, i) => (
                <button
                  key={nombre}
                  type="button"
                  onClick={() => emit(dia, i + 1, anio)}
                  className={`block w-full px-3 py-1.5 text-center text-sm capitalize transition-colors ${
                    i + 1 === mes && value
                      ? "accent-gradient font-semibold text-white"
                      : "text-muted hover:bg-panel-soft hover:text-foreground"
                  }`}
                >
                  {nombre}
                </button>
              ))}
            </div>

            <div className="scrollbar-thin max-h-56 flex-1 overflow-y-auto py-1">
              {YEARS.map((yy) => (
                <button
                  key={yy}
                  type="button"
                  onClick={() => emit(dia, mes, yy)}
                  className={`block w-full px-3 py-1.5 text-center text-sm transition-colors ${
                    yy === anio && value
                      ? "accent-gradient font-semibold text-white"
                      : "text-muted hover:bg-panel-soft hover:text-foreground"
                  }`}
                >
                  {yy}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
