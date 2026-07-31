"use client";

import { motion } from "framer-motion";
import { NewsItem } from "@/types/news";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { PlatformBadge } from "./PlatformBadge";
import { NewsCover } from "./NewsCover";
import { formatRelativeDate } from "@/lib/date";
import { recordNewsInteraction } from "@/lib/learning";

function HeartButton({ liked, onToggle }: { liked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={liked ? "Quitar me gusta" : "Me gusta"}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-150 active:scale-90 ${
        liked
          ? "border-ice bg-ice/15 text-ice"
          : "border-white/25 bg-black/40 text-white/80"
      }`}
    >
      <span className="relative block h-[15px] w-[15px]">
        <svg
          className="absolute inset-0 transition-opacity duration-150"
          style={{ opacity: liked ? 0 : 1 }}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 21s-7.5-4.6-10-9.3C.4 8.1 2 4.5 5.6 4c2-.3 3.8.6 5 2.2C11.8 4.6 13.6 3.7 15.6 4c3.6.5 5.2 4.1 3.6 7.7C21 16.4 12 21 12 21Z" />
        </svg>
        <svg
          className="absolute inset-0 transition-opacity duration-150"
          style={{ opacity: liked ? 1 : 0 }}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 21s-7.5-4.6-10-9.3C.4 8.1 2 4.5 5.6 4c2-.3 3.8.6 5 2.2C11.8 4.6 13.6 3.7 15.6 4c3.6.5 5.2 4.1 3.6 7.7C21 16.4 12 21 12 21Z" />
        </svg>
      </span>
    </button>
  );
}

export function NewsCard({
  item,
  highlight = false,
  liked = false,
  onToggleLike,
  onOpenDetail,
  featured = false,
  pending = false,
  translating = false,
}: {
  item: NewsItem;
  highlight?: boolean;
  liked?: boolean;
  onToggleLike?: () => void;
  onOpenDetail?: () => void;
  featured?: boolean;
  pending?: boolean;
  translating?: boolean;
}) {
  return (
    <motion.article
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`panel card-hover flex cursor-pointer overflow-hidden rounded-xl ${
        highlight ? "ring-1 ring-ice/40" : ""
      } ${featured ? "flex-col sm:flex-row" : "flex-col"}`}
      onClick={onOpenDetail}
    >
      <div className={`relative ${featured ? "sm:w-2/5" : ""}`}>
        <NewsCover category={item.category} relatedTitle={item.relatedTitle} coverImageUrl={item.coverImageUrl} pending={pending} tall={featured} />
        <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
          {onToggleLike && <HeartButton liked={liked} onToggle={onToggleLike} />}
          {highlight && (
            <span
              className="flex items-center gap-1.5 pr-0.5 text-[11px] font-semibold uppercase tracking-wide text-white"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
            >
              Para ti
              <span className="h-[5px] w-[5px] rounded-full bg-ice" />
            </span>
          )}
        </div>
        {item.prominence === "indie" && (
          <span
            className="absolute left-3 top-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/90"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
          >
            <span className="h-[5px] w-[5px] rounded-full bg-white/70" />
            Independiente
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ReliabilityBadge reliability={item.reliability} />
          <PlatformBadge platform={item.source.platform} />
          {item.crossConfirmedBy && item.crossConfirmedBy.length > 0 && (
            <span className="text-xs text-muted">
              + confirmado por {item.crossConfirmedBy.join(", ")}
            </span>
          )}
          {translating && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-ice"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
              Traduciendo…
            </span>
          )}
        </div>

        <h3 className={`font-heading font-semibold leading-snug text-foreground ${featured ? "text-xl" : "text-base"}`}>
          {item.title}
        </h3>

        <p className="text-sm leading-relaxed text-muted">{item.summary}</p>

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-xs text-muted">{formatRelativeDate(item.publishedAt)}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted">Leer más →</span>
            <a
              href={item.source.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                recordNewsInteraction(item);
              }}
              className="rounded-full border border-panel-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ice/50 hover:text-ice"
            >
              Fuente ↗
            </a>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
