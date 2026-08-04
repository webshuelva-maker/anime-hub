"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Borrar",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  /*
   * Va colgado del <body> y no de donde se use, a propósito.
   *
   * "position: fixed" solo se refiere a la ventana si no hay ningún
   * antepasado con transform. Y framer-motion pone transform en todo lo
   * que anima — así que dentro de un panel animado (por ejemplo la ficha
   * de un miembro, que además recorta con overflow-hidden) este diálogo
   * dejaba de cubrir la pantalla y se abría recortado dentro de esa caja,
   * o directamente no se veía. Con el portal, esté donde esté puesto,
   * siempre se dibuja arriba del todo.
   */
  // "¿estamos ya en el navegador?" sin efectos ni estado: en el servidor
  // devuelve false y en el cliente true, que es justo lo que necesita
  // createPortal (no existe document mientras se genera el HTML).
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  if (!enNavegador) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
        >
          <motion.div
            className="panel w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl shadow-black/60"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{message}</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <motion.button
                type="button"
                onClick={onCancel}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="rounded-full border border-panel-border px-5 py-2 text-sm font-medium text-foreground"
              >
                Cancelar
              </motion.button>
              <motion.button
                type="button"
                onClick={onConfirm}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="accent-gradient rounded-full px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-black/30"
              >
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
