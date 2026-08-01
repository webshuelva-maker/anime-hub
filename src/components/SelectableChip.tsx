"use client";

import { motion } from "framer-motion";
import { playClick } from "@/lib/sound";

export function SelectableChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => {
        onClick();
        playClick();
      }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-200 ${
        selected
          ? "accent-gradient border-transparent text-white shadow-lg shadow-black/30"
          : "border-panel-border bg-panel text-muted hover:border-accent/50 hover:text-foreground"
      }`}
    >
      {label}
    </motion.button>
  );
}
