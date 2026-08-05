"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { playClick } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";

/**
 * Botón con reacción al pulsar.
 *
 * Los botones de la app respondían solo con un cambio de color, y en una
 * pantalla oscura eso casi no se ve: pulsabas y no sabías si había
 * pasado algo. Aquí la reacción es física — se hunde al apretar y vuelve
 * con un rebote corto — porque el movimiento se percibe aunque no estés
 * mirando el botón directamente.
 *
 * Todo lo que se anima es `scale`, que la tarjeta gráfica resuelve sin
 * repintar nada. Es deliberado: la app ya iba justa de pintado, y unos
 * botones bonitos que hagan ir a tirones el resto no compensan.
 *
 * Tres tonos, y el color no es decorativo:
 *  - principal: la acción que se espera que hagas.
 *  - neutro: alternativas sin consecuencia.
 *  - peligro: lo que corta algo o afecta a otra persona. Se separa a
 *    propósito para que no se pulse por inercia.
 */

const MUELLE = { type: "spring" as const, stiffness: 420, damping: 26, mass: 0.7 };

export function BotonAccion({
  children,
  onClick,
  tono = "neutro",
  disabled = false,
  ancho = false,
  sonido = true,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  tono?: "principal" | "neutro" | "peligro";
  disabled?: boolean;
  ancho?: boolean;
  sonido?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const estilos: Record<string, string> = {
    principal: "accent-gradient text-white",
    neutro:
      "border border-panel-border text-foreground hover:border-ice/40 hover:bg-panel-soft/50",
    peligro: "border text-rumor",
  };

  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        if (sonido) playClick();
        vibrar(8);
        onClick?.();
      }}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={MUELLE}
      style={
        tono === "peligro"
          ? {
              borderColor: "color-mix(in srgb, var(--rumor) 45%, transparent)",
              background: "color-mix(in srgb, var(--rumor) 8%, transparent)",
            }
          : undefined
      }
      className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-200 disabled:opacity-40 ${
        estilos[tono]
      } ${ancho ? "w-full" : ""} ${className}`}
    >
      {children}
    </motion.button>
  );
}
