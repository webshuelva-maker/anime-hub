"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NewsItem } from "@/types/news";
import { NewsCover } from "./NewsCover";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { PlatformBadge } from "./PlatformBadge";
import { formatRelativeDate } from "@/lib/date";
import { recordNewsInteraction } from "@/lib/learning";
import { getCachedTranslation, saveCachedTranslation } from "@/lib/translationCache";

export function NewsDetail({
  item,
  onClose,
}: {
  item: NewsItem | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [detailCover, setDetailCover] = useState<string | null>(null);
  const [translatingBody, setTranslatingBody] = useState(false);

  // Bloquea el scroll de la página de fondo mientras el modal está abierto
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

  // Se ve el artículo original al instante. Si ya hay una traducción en
  // caché, se aplica de inmediato sin llamar a la IA. Si no, se traduce en
  // segundo plano y se sustituye con un fundido — nunca se bloquea la
  // pantalla esperando.
  useEffect(() => {
    if (!item) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(null);
      setBody(null);
      setDetailCover(null);
      return;
    }

    const cached = getCachedTranslation(item.source.url);
    setTitle(cached?.title ?? null);
    setBody(cached?.body ?? null);
    setDetailCover(null);

    if (cached?.body) return; // ya está todo, no hace falta pedir nada

    setTranslatingBody(true);
    const params = new URLSearchParams({ title: item.title, summary: item.summary, url: item.source.url });
    fetch(`/api/enrich-detail?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { coverImageUrl?: string | null; title?: string | null; body?: string | null }) => {
        if (data.coverImageUrl) setDetailCover(data.coverImageUrl);
        if (data.title) setTitle(data.title);
        if (data.body) {
          setBody(data.body);
          saveCachedTranslation(item.source.url, { title: data.title ?? undefined, body: data.body });
        }
      })
      .catch(() => {})
      .finally(() => setTranslatingBody(false));
  }, [item]);

  return (
    <AnimatePresence mode="wait">
      {item && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/85 p-4 py-10 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            key="panel"
            className="panel relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white"
            >
              ✕
            </button>

            <div className="max-h-[85vh] overflow-y-auto scrollbar-thin overscroll-contain">
              <NewsCover
                category={item.category}
                relatedTitle={item.relatedTitle}
                coverImageUrl={item.coverImageUrl || detailCover || undefined}
              />

              <div className="p-6 sm:p-8">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <ReliabilityBadge reliability={item.reliability} />
                  <PlatformBadge platform={item.source.platform} />
                  <span className="text-xs text-muted">{formatRelativeDate(item.publishedAt)}</span>
                </div>

                <AnimatePresence mode="wait">
                  <motion.h2
                    key={title || item.title}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35 }}
                    className="font-heading text-2xl font-semibold leading-tight text-foreground"
                  >
                    {title || item.title}
                  </motion.h2>
                </AnimatePresence>

                <p className="font-heading mt-3 text-sm text-muted">{item.relatedTitle}</p>

                <AnimatePresence mode="wait">
                  <motion.p
                    key={body || item.body}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90"
                  >
                    {body || item.body}
                  </motion.p>
                </AnimatePresence>
                {translatingBody && !body && (
                  <p className="mt-3 text-xs text-muted">Traduciendo el artículo completo…</p>
                )}

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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
