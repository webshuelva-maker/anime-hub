"use client";

import { MotionConfig } from "framer-motion";
import { ReactNode, useEffect, useState } from "react";
import { PREFERENCES_CHANGED_EVENT, getPreferences } from "@/lib/storage";

/**
 * Cuántas animaciones enseña la app.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE INTERRUPTOR (v180)
 *
 * Hasta ahora esto era fijo: framer-motion obedecía al "Reducir
 * movimiento" del sistema y el CSS aplastaba todas las transiciones a
 * 0,08 s cuando esa preferencia estaba activada.
 *
 * Obedecer está bien —quien activa esa opción suele hacerlo por mareos o
 * migrañas y merece que se le haga caso—, pero deja sin salida a quien la
 * tiene puesta y sí quiere ver las animaciones de ESTA app. Y ese era
 * justo el caso del dueño del proyecto: durante varias versiones estuvo
 * pidiendo arreglos de animaciones que en su pantalla no se iban a ver
 * nunca, mientras al resto del mundo se le enseñaban enteras.
 *
 * Tres opciones, y la de por defecto sigue siendo hacer caso al sistema:
 *
 *   sistema   → lo de siempre, obedecer al sistema operativo.
 *   completas → todas las animaciones, aunque el sistema pida reducir.
 *   mínimas   → sin animaciones, aunque el sistema no pida nada.
 *
 * El valor se pone también en el <html> como atributo, porque el CSS
 * necesita saberlo: la regla que acorta las transiciones vive en una
 * consulta de medios y no se puede desactivar desde JavaScript, así que
 * se escribe condicionada a este atributo.
 * ---------------------------------------------------------------------
 */
export function Movimiento({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<"sistema" | "completas" | "minimas">("sistema");

  useEffect(() => {
    const leer = () => {
      const valor = getPreferences().animaciones ?? "sistema";
      setModo(valor);
      document.documentElement.setAttribute("data-animaciones", valor);
    };
    const id = setTimeout(leer, 0);
    window.addEventListener(PREFERENCES_CHANGED_EVENT, leer);
    return () => {
      clearTimeout(id);
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, leer);
    };
  }, []);

  return (
    <MotionConfig
      reducedMotion={modo === "completas" ? "never" : modo === "minimas" ? "always" : "user"}
    >
      {children}
    </MotionConfig>
  );
}
