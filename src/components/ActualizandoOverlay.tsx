"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "./BrandMark";

/**
 * Pantalla de "trayendo contenido nuevo".
 *
 * El feed se refrescaba cada 15 minutos en silencio: las tarjetas se
 * cambiaban por debajo y lo único que lo delataba era un "Actualizando…"
 * diminuto en la esquina. El resultado era desconcertante — te cambiaba
 * lo que estabas mirando sin explicación aparente.
 *
 * Ahora se avisa. Y se avisa DEL RESULTADO, no solo del proceso: si no
 * había nada nuevo, lo dice, en vez de dejar la sensación de que ha
 * pasado algo cuando no ha pasado nada.
 *
 * Se cierra sola. Nunca se queda esperando a que alguien la toque, y
 * tiene un tope duro por si la petición no vuelve nunca: una pantalla de
 * carga atascada es peor que no haberla puesto.
 */

const MINIMO_VISIBLE_MS = 1000; // que no sea un parpadeo
const LECTURA_RESULTADO_MS = 1300; // tiempo para leer "3 noticias nuevas"
const TOPE_MS = 9000; // red de seguridad

export function ActualizandoOverlay({
  fase,
  nuevas,
  onClose,
}: {
  fase: "buscando" | "listo";
  nuevas: number;
  onClose: () => void;
}) {
  const [minimoCumplido, setMinimoCumplido] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinimoCumplido(true), MINIMO_VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fase !== "listo" || !minimoCumplido) return;
    const t = setTimeout(onClose, LECTURA_RESULTADO_MS);
    return () => clearTimeout(t);
  }, [fase, minimoCumplido, onClose]);

  // Pase lo que pase, esto se quita.
  useEffect(() => {
    const t = setTimeout(onClose, TOPE_MS);
    return () => clearTimeout(t);
  }, [onClose]);

  const listo = fase === "listo" && minimoCumplido;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed inset-0 z-[55] flex items-center justify-center px-6"
      style={{
        /*
          Antes esto llevaba backdrop-filter: blur(12px), que obliga al
          navegador a desenfocar TODA la página que hay detrás en cada
          fotograma mientras la pantalla está puesta. Es de lo más caro
          que se puede pedir, y encima el fondo ya está casi tapado: el
          desenfoque apenas se veía. Un fondo casi opaco da el mismo
          resultado y no cuesta nada.
        */
        background: "color-mix(in srgb, var(--background) 97%, transparent)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xs text-center"
      >
        {/* La marca late mientras se busca y se queda quieta al terminar:
            el movimiento es lo que distingue "trabajando" de "hecho" sin
            tener que leer nada. */}
        <motion.span
          animate={
            listo
              ? { scale: 1, opacity: 1 }
              : { scale: [1, 1.08, 1], opacity: [0.75, 1, 0.75] }
          }
          transition={
            listo
              ? { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
              : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
          }
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-panel-border"
          style={{ background: "color-mix(in srgb, var(--ice) 8%, transparent)" }}
        >
          <BrandMark size={24} />
        </motion.span>

        <motion.p
          key={listo ? "listo" : "buscando"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="font-heading text-base font-semibold text-foreground"
        >
          {listo
            ? nuevas > 0
              ? `${nuevas} ${nuevas === 1 ? "noticia nueva" : "noticias nuevas"}`
              : "Ya estabas al día"
            : "Trayendo contenido nuevo"}
        </motion.p>

        <p className="mt-1.5 text-xs leading-snug text-muted">
          {listo
            ? nuevas > 0
              ? "Ya están arriba del todo."
              : "No ha salido nada desde la última vez."
            : "Buscando lo último en los medios."}
        </p>

        {/* Barra: indefinida mientras busca (nadie sabe cuánto tardan los
            medios), completa de golpe al terminar. */}
        <div className="mt-5 h-[3px] w-full overflow-hidden rounded-full bg-panel-border">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, var(--accent-from), var(--ice))" }}
            animate={listo ? { x: "0%", width: "100%" } : { x: ["-100%", "100%"], width: "60%" }}
            transition={
              listo
                ? { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
                : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
            }
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
