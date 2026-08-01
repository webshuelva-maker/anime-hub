"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/**
 * Fondo ambiental, montado una vez en el layout raíz — se ve siempre,
 * en toda la app, en cualquier visita (no solo la primera). Dos cosas
 * DISTINTAS, que no hay que confundir:
 *
 * 1. Los dos resplandores grandes de los lados: se mueven y respiran
 *    SOLOS, con su propia animación — NO tienen nada que ver con el
 *    ratón. Antes tenían además un paralaje ligado al cursor; se quitó
 *    a petición expresa — ese comportamiento no es lo que se pedía.
 * 2. El foco de luz que va pegado al cursor: ese sí seguía al ratón, es
 *    justo lo que se pedía que volviera a haber siempre.
 */
export function AmbientGlow() {
  const cursorGlowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (cursorGlowRef.current) {
        cursorGlowRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      }
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Resplandores de los lados — autónomos, sin ninguna relación con el ratón */}
      <motion.div
        className="absolute -left-32 top-1/3 h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, var(--ice) 0%, transparent 70%)", filter: "blur(60px)" }}
        animate={{ opacity: [0.08, 0.2, 0.08], x: [0, 30, -10, 0], y: [0, -20, 15, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-32 bottom-1/3 h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, var(--accent-from) 0%, transparent 70%)", filter: "blur(60px)" }}
        animate={{ opacity: [0.06, 0.18, 0.06], x: [0, -25, 15, 0], y: [0, 20, -15, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />

      {/* Foco que sigue al cursor — este SÍ se mueve pegado al ratón,
          moviendo el estilo directamente vía ref (sin pasar por estado
          de React) para que vaya fino a 60fps. Oculto en móvil, donde no
          hay cursor real que seguir. */}
      <div
        ref={cursorGlowRef}
        className="hidden h-80 w-80 rounded-full sm:block"
        style={{ background: "radial-gradient(circle, var(--platinum) 0%, transparent 65%)", filter: "blur(70px)", opacity: 0.12 }}
      />
    </div>
  );
}
