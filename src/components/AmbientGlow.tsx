"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/**
 * Resplandores ambientales de fondo — antes vivían dentro de
 * FirstLoadOverlay (la pantalla de carga), pero esa pantalla solo se ve
 * en la primera visita real. Se saca aquí como capa de fondo SIEMPRE
 * presente (montada una vez en el layout raíz), para que se vea en toda
 * la app y en todas las visitas, no solo la primera. Respiran solos
 * (opacidad + deriva propia) y además reaccionan con un paralaje sutil
 * a la posición del ratón — pointer-events-none, así que nunca estorba
 * al hacer clic en nada por debajo.
 */
export function AmbientGlow() {
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

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div ref={glow1WrapRef} className="absolute -left-32 top-1/3">
        <motion.div
          className="h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, var(--ice) 0%, transparent 70%)", filter: "blur(60px)" }}
          animate={{ opacity: [0.08, 0.2, 0.08], x: [0, 30, -10, 0], y: [0, -20, 15, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <div ref={glow2WrapRef} className="absolute -right-32 bottom-1/3">
        <motion.div
          className="h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, var(--accent-from) 0%, transparent 70%)", filter: "blur(60px)" }}
          animate={{ opacity: [0.06, 0.18, 0.06], x: [0, -25, 15, 0], y: [0, 20, -15, 0] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        />
      </div>
    </div>
  );
}
