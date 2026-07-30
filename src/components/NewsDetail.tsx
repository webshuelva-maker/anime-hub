"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NewsItem } from "@/types/news";
import { NewsCover } from "./NewsCover";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { PlatformBadge } from "./PlatformBadge";
import { formatRelativeDate } from "@/lib/date";
import { recordNewsInteraction } from "@/lib/learning";

export function NewsDetail({
  item,
  onClose,
}: {
  item: NewsItem | null;
  onClose: () => void;
}) {
  // Bloquea el scroll de la página de fondo mientras el modal está abierto
  // (html + body, y overscroll-behavior para que la rueda del ratón no
  // "atraviese" el fondo aunque el modal esté encima).
  useEffect(() => {
    if (!item) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevOverscroll = body.style.overscrollBehavior;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "contain";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevOverscroll;
    };
  }, [item]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/85 p-4 py-10 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={onClose}
        >
          <motion.div
            className="panel w-full max-w-2xl overflow-hidden rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <NewsCover category={item.category} relatedTitle={item.relatedTitle} coverImageUrl={item.coverImageUrl} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto scrollbar-thin overscroll-contain p-6 sm:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <ReliabilityBadge reliability={item.reliability} />
                <PlatformBadge platform={item.source.platform} />
                <span className="text-xs text-muted">{formatRelativeDate(item.publishedAt)}</span>
              </div>

              <h2 className="font-heading text-2xl font-semibold leading-tight text-foreground">
                {item.title}
              </h2>

              <p className="font-heading mt-3 text-sm text-muted">{item.relatedTitle}</p>

              <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
                {item.body}
              </p>

              <div className="rule-line my-6" />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted">
                  Fuente original: {item.source.platform}
                </span>
                <a
                  href={item.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => recordNewsInteraction(item)}
                  className="accent-gradient rounded-full px-4 py-2 text-xs font-semibold text-white transition-transform hover:scale-105 active:scale-95"
                >
                  {item.source.label} →
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
