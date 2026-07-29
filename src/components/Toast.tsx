"use client";

import { AnimatePresence, motion } from "framer-motion";

export function Toast({ message }: { message: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="panel-elevated max-w-md rounded-full px-5 py-2.5 text-sm text-foreground shadow-xl shadow-black/40"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
