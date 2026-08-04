"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Aviso, escucharMisAvisos, marcarAvisoLeido, misAvisosSinLeer } from "@/lib/moderacion";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "./BrandMark";
import { playError } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";

/**
 * Avisos de moderación, tal como los ve quien los recibe.
 *
 * Se monta en toda la app: da igual en qué sección esté, el aviso baja
 * desde arriba en el momento en que se envía. No tapa la pantalla entera
 * a propósito — un aviso no es una expulsión, y bloquearlo todo por un
 * "no vuelvas a hacer eso" convierte una corrección en un castigo. Pero
 * sí exige tocar "Entendido": si se pudiera ignorar deslizando, no
 * serviría como constancia de que se le comunicó.
 *
 * Se quedan en cola: si hay tres sin leer, se ven de uno en uno.
 */

function estilo(gravedad: Aviso["gravedad"]): { color: string; titulo: string } {
  if (gravedad === "grave") return { color: "var(--rumor)", titulo: "Último aviso" };
  if (gravedad === "leve") return { color: "var(--ice)", titulo: "Un apunte de moderación" };
  return { color: "var(--ice)", titulo: "Aviso de moderación" };
}

export function AvisoModeracion() {
  const [cola, setCola] = useState<Aviso[]>([]);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    let vivo = true;
    let dejarDeEscuchar: (() => void) | null = null;

    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !vivo) return;

      // Lo que quedó pendiente de otras sesiones: un aviso enviado con la
      // app cerrada tiene que salir igualmente al volver.
      const pendientes = await misAvisosSinLeer();
      if (vivo && pendientes.length > 0) {
        setCola(pendientes);
        playError();
        vibrar([12, 60, 12]);
      }

      dejarDeEscuchar = escucharMisAvisos(auth.user.id, (nuevo) => {
        setCola((prev) => (prev.some((a) => a.id === nuevo.id) ? prev : [...prev, nuevo]));
        playError();
        vibrar([12, 60, 12]);
      });
    })();

    return () => {
      vivo = false;
      dejarDeEscuchar?.();
    };
  }, []);

  const actual = cola[0] ?? null;

  const entendido = async () => {
    if (!actual) return;
    setCerrando(true);
    await marcarAvisoLeido(actual.id);
    setCola((prev) => prev.slice(1));
    setCerrando(false);
  };

  const { color, titulo } = estilo(actual?.gravedad ?? "normal");

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <AnimatePresence>
        {actual && (
          <motion.div
            key={actual.id}
            initial={{ opacity: 0, y: -80, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -60, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="panel pointer-events-auto w-full max-w-md rounded-2xl p-5 shadow-2xl shadow-black/60"
            style={{ borderColor: `color-mix(in srgb, ${color} 45%, var(--panel-border))` }}
          >
            <div className="flex items-start gap-3">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.45, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{
                  border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
                  background: `color-mix(in srgb, ${color} 12%, transparent)`,
                }}
              >
                <BrandMark size={18} />
              </motion.span>

              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-semibold" style={{ color }}>
                  {titulo}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-foreground">
                  {actual.motivo}
                </p>
                <p className="mt-2 text-[11px] leading-snug text-muted">
                  Puedes repasar las{" "}
                  <a href="/legal/normas" className="ice-text hover:underline">
                    normas de convivencia
                  </a>
                  . Si crees que es un error, contesta desde{" "}
                  <a href="/soporte" className="ice-text hover:underline">
                    soporte
                  </a>
                  .
                </p>
              </div>
            </div>

            {/* Barra de gravedad: se llena sola al entrar, para que el
                nivel se note antes de leer nada. */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 h-px w-full origin-left"
              style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
            />

            {cola.length > 1 && (
              <p className="mt-3 text-[11px] text-muted">
                Tienes {cola.length - 1} {cola.length - 1 === 1 ? "aviso más" : "avisos más"} por
                leer.
              </p>
            )}

            <motion.button
              type="button"
              onClick={entendido}
              disabled={cerrando}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="mt-4 w-full rounded-full border px-4 py-2.5 text-sm font-medium text-foreground transition-colors disabled:opacity-50"
              style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}
            >
              Entendido
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
