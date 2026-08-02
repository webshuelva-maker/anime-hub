"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "./BrandMark";
import { vibrar } from "@/lib/haptics";

/**
 * Tirar hacia abajo para actualizar, con animación propia.
 *
 * El gesto nativo del navegador no se puede tocar: pinta una flechita
 * gris de Android en mitad de una app que no tiene nada de gris. Aquí se
 * desactiva (overscroll-behavior en globals.css) y se hace a mano, con
 * el emblema de la app girando según cuánto tiras.
 *
 * Detalles que hacen que se sienta bien y no a "web con un div que se
 * mueve":
 * - Resistencia progresiva: cuanto más tiras, menos avanza. Un
 *   desplazamiento lineal se nota falso enseguida.
 * - Vibración corta al cruzar el umbral, para saber que ya puedes soltar
 *   sin mirar.
 * - Solo se activa si la página está arriba del todo y el dedo va claramente
 *   hacia abajo, para no secuestrar un desplazamiento normal.
 */

const UMBRAL = 72; // píxeles de tirón necesarios para que dispare
const MAXIMO = 120; // tope visual, por mucho que sigas tirando

export function PullToRefresh({
  onRefresh,
  refreshing,
  children,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  children: React.ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [armado, setArmado] = useState(false);
  const startY = useRef<number | null>(null);
  const activo = useRef(false);
  const armadoRef = useRef(false);

  useEffect(() => {
    // Solo con dedo: en escritorio no existe este gesto y no hay que
    // escuchar nada.
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) return;
      startY.current = e.touches[0].clientY;
      activo.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;

      // Hacia arriba o con la página ya desplazada: es un scroll normal.
      if (delta <= 0 || window.scrollY > 0) {
        startY.current = null;
        setPull(0);
        return;
      }

      // A partir de 8px se da por bueno el gesto y se toma el control.
      if (!activo.current && delta > 8) activo.current = true;
      if (!activo.current) return;

      if (e.cancelable) e.preventDefault();

      // Raíz cuadrada: los primeros píxeles responden mucho y los
      // últimos casi nada, como si el contenido tirara de vuelta.
      const resistido = Math.min(MAXIMO, Math.sqrt(delta) * 9);
      setPull(resistido);

      const listo = resistido >= UMBRAL;
      if (listo !== armadoRef.current) {
        armadoRef.current = listo;
        setArmado(listo);
        if (listo) vibrar(12);
      }
    };

    const onTouchEnd = () => {
      if (activo.current && armadoRef.current) {
        vibrar([10, 30, 10]);
        onRefresh();
      }
      startY.current = null;
      activo.current = false;
      armadoRef.current = false;
      setArmado(false);
      setPull(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    // passive:false es imprescindible: sin él no se puede impedir que la
    // página haga su propio rebote mientras tiramos.
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onRefresh, refreshing]);

  const visible = pull > 0 || refreshing;
  const progreso = Math.min(1, pull / UMBRAL);
  const desplazamiento = refreshing ? 56 : pull;

  return (
    <div className="relative">
      {/* Indicador. Vive por encima del contenido y baja con el dedo. */}
      <div
        aria-hidden={!visible}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          height: 0,
          opacity: visible ? 1 : 0,
          transform: `translateY(${Math.max(0, desplazamiento - 34)}px)`,
          transition: pull === 0 ? "transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.2s" : "none",
        }}
      >
        <div className="panel-elevated mt-2 flex h-11 w-11 items-center justify-center rounded-full border border-panel-border shadow-lg shadow-black/40">
          {/* Anillo que se va dibujando con el tirón. */}
          <svg width="34" height="34" viewBox="0 0 36 36" className="absolute -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="var(--panel-border)"
              strokeWidth="2"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="var(--ice)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={94.2}
              strokeDashoffset={94.2 * (1 - (refreshing ? 1 : progreso))}
              style={{ transition: "stroke-dashoffset 0.08s linear" }}
            />
          </svg>
          <motion.span
            className="ice-text"
            animate={
              refreshing
                ? { rotate: 360, scale: 1 }
                : { rotate: progreso * 180, scale: armado ? 1.15 : 0.9 }
            }
            transition={
              refreshing
                ? { rotate: { duration: 1.1, repeat: Infinity, ease: "linear" } }
                : { type: "spring", stiffness: 300, damping: 22 }
            }
          >
            <BrandMark size={15} />
          </motion.span>
        </div>
      </div>

      {/* El contenido acompaña al dedo, no se queda quieto. */}
      <div
        style={{
          transform: `translateY(${desplazamiento * 0.55}px)`,
          transition: pull === 0 ? "transform 0.4s cubic-bezier(0.16,1,0.3,1)" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
