"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AvisoProactivo as Aviso, calcularAviso, marcarAvisoVisto } from "@/lib/proactivo";
import { getNewsItems } from "@/lib/newsStore";
import { getPreferences } from "@/lib/storage";
import { siteConfig } from "@/config/site";
import { playReceive, playToggle } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";

/**
 * Burbuja de aviso de Iris, junto a su orbe.
 *
 * Aparece sola al entrar cuando hay novedades de algo que sigues. Es lo
 * más parecido a que el asistente te dé un toque: "oye, ha salido algo
 * de esa serie por la que preguntaste".
 *
 * Espera unos segundos antes de aparecer a propósito. Saltar encima del
 * usuario en cuanto abre la app es intrusivo; darle tiempo a mirar el
 * feed y entonces asomarse se siente como un aviso y no como un anuncio.
 */
export function AvisoProactivo({ onAbrirChat }: { onAbrirChat: (texto: string) => void }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      const items = getNewsItems();
      if (items.length === 0) return;

      const encontrado = calcularAviso(items, getPreferences());
      if (!encontrado) return;

      setAviso(encontrado);
      setVisible(true);
      playReceive();
      vibrar(10);
    }, 4000);

    return () => clearTimeout(id);
  }, []);

  const cerrar = () => {
    setVisible(false);
    marcarAvisoVisto();
    playToggle();
  };

  return (
    <AnimatePresence>
      {visible && aviso && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          // Justo encima del botón de Iris, apoyado en la misma variable
          // que lo coloca a él, para que no se pisen en el móvil.
          style={{ bottom: "calc(var(--orb-offset) + 4.5rem)" }}
          className="panel-elevated fixed right-4 z-40 w-[17rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-ice/25 p-4 shadow-2xl shadow-black/50 sm:right-6"
        >
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar aviso"
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs text-muted transition-colors hover:bg-panel-soft hover:text-foreground"
          >
            ✕
          </button>

          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {siteConfig.assistantName}
          </p>
          <p className="mt-1.5 pr-4 text-sm leading-snug text-foreground">{aviso.texto}</p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                marcarAvisoVisto();
                setVisible(false);
                onAbrirChat(`¿Qué ha pasado con ${aviso.series[0]}?`);
              }}
              className="accent-gradient rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-105 active:scale-95"
            >
              Cuéntamelo
            </button>
            <button
              type="button"
              onClick={cerrar}
              className="rounded-full border border-panel-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
            >
              Ahora no
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
