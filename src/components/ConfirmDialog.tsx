"use client";

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
  return (
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
            <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
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
    </AnimatePresence>
  );
}
