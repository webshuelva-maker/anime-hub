"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NewsItem } from "@/types/news";
import { NewsCover } from "./NewsCover";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { PlatformBadge } from "./PlatformBadge";
import { formatRelativeDate } from "@/lib/date";
import { recordNewsInteraction } from "@/lib/learning";
import { ANIME_TRIVIA } from "@/lib/trivia";

// Si tarda más de esto, se deja de esperar y se enseña lo que haya (mejor
// eso que quedarte mirando curiosidades para siempre).
const MAX_WAIT_MS = 14000;

function LoadingTrivia() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % ANIME_TRIVIA.length), 3200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 px-8 py-16 text-center">
      <motion.span
        className="h-2.5 w-2.5 rounded-full bg-ice"
        animate={{ scale: [1, 1.6, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <p className="text-sm text-muted">Preparando el artículo completo, en español…</p>
      <div className="relative h-14 w-full max-w-sm">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 text-xs italic leading-relaxed text-muted"
          >
            {ANIME_TRIVIA[index]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function NewsDetail({
  item,
  onClose,
}: {
  item: NewsItem | null;
  onClose: () => void;
}) {
  const [fullBody, setFullBody] = useState<string | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [detailCover, setDetailCover] = useState<string | null>(null);
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);

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

  // El artículo completo (más lento) solo se pide cuando se abre ESTA
  // noticia en concreto, no para todas a la vez. Mientras llega, se
  // muestra una pantalla de espera en vez de dejar ver el inglés a medias.
  useEffect(() => {
    if (!item) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFullBody(null);
      setDetailCover(null);
      setGaveUpWaiting(false);
      return;
    }
    setFullBody(null);
    setDetailCover(null);
    setGaveUpWaiting(false);
    setLoadingArticle(true);
    const params = new URLSearchParams({ title: item.title, summary: item.summary, url: item.source.url });
    const url = `/api/enrich-detail?${params.toString()}`;

    const giveUpTimer = setTimeout(() => setGaveUpWaiting(true), MAX_WAIT_MS);

    (async () => {
      try {
        let data: { coverImageUrl?: string | null; body?: string | null } = await (await fetch(url)).json();
        if (!data.body) {
          await new Promise((r) => setTimeout(r, 1200));
          data = await (await fetch(url)).json();
        }
        if (data.body) setFullBody(data.body);
        if (data.coverImageUrl) setDetailCover(data.coverImageUrl);
      } catch {
        // se queda con el resumen corto que ya tenía
      } finally {
        clearTimeout(giveUpTimer);
        setLoadingArticle(false);
      }
    })();

    return () => clearTimeout(giveUpTimer);
  }, [item]);

  const stillWaiting = loadingArticle && !fullBody && !gaveUpWaiting;

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

            {stillWaiting ? (
              <LoadingTrivia />
            ) : (
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

                  <h2 className="font-heading text-2xl font-semibold leading-tight text-foreground">
                    {item.title}
                  </h2>

                  <p className="font-heading mt-3 text-sm text-muted">{item.relatedTitle}</p>

                  <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
                    {fullBody || item.body}
                  </p>
                  {gaveUpWaiting && !fullBody && (
                    <p className="mt-3 text-xs text-muted">
                      Está tardando más de lo normal — de momento se ve el resumen corto.
                    </p>
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
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
