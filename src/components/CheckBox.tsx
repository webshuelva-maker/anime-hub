"use client";

import { motion } from "framer-motion";
import { playToggle } from "@/lib/sound";

/**
 * Casilla de verificación propia. La nativa del navegador se pinta con
 * los colores del sistema —fondo blanco y un tick azul de Windows— que
 * en una interfaz oscura canta muchísimo. Esta es un cuadrado con el
 * borde de la app que se rellena con el degradado de acento y dibuja el
 * tick trazándolo, no apareciendo de golpe.
 */
export function CheckBox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-left">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => {
          onChange(!checked);
          playToggle();
        }}
        className={`mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
          checked ? "border-transparent" : "border-panel-border bg-panel-soft/60 hover:border-ice/50"
        }`}
        style={checked ? { background: "linear-gradient(135deg, var(--ice), var(--accent-from))" } : undefined}
      >
        <motion.svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.6 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <motion.path
            d="M20 6 9 17l-5-5"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          />
        </motion.svg>
      </button>
      <span className="text-[11px] leading-relaxed text-muted">{children}</span>
    </label>
  );
}
