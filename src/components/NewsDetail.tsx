"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NewsItem } from "@/types/news";
import { NewsCover } from "./NewsCover";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { PlatformBadge } from "./PlatformBadge";
import { formatRelativeDate } from "@/lib/date";
import { recordNewsInteraction } from "@/lib/learning";
import { getCachedTranslation, saveCachedTranslation } from "@/lib/translationCache";
import { runExclusive, waitForTokenBudget, recordTokenUsage } from "@/lib/apiQueue";

export function NewsDetail({
  item,
  onClose,
}: {
  item: NewsItem | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  // Solo se rellena si la traducción del artículo falla de verdad (no si
  // simplemente tarda) — se muestra como último recurso y SIEMPRE con una
  // nota visible, nunca como sustitución silenciosa.
  const [englishFallback, setEnglishFallback] = useState<string | null>(null);
  const [detailCover, setDetailCover] = useState<string | null>(null);
  const [translatingBody, setTranslatingBody] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const runDetailFetch = useCallback((targetItem: NewsItem, forceRefetch: boolean) => {
    let cancelled = false;
    const cached = getCachedTranslation(targetItem.source.url);

    setTitle(cached?.title ?? null);
    setBody(cached?.body ?? null);
    setEnglishFallback(null);
    setDetailCover(null);
    setLoadFailed(false);

    if (cached?.body) return () => {}; // ya está todo, no hace falta pedir nada

    // Si ya se descargó el artículo antes (aunque la traducción fallara
    // en su momento), reabrir la noticia lo muestra al instante — nada de
    // spinner ni de repetir la descarga — y solo se reintenta la
    // traducción en red si el usuario lo pide explícitamente.
    if (cached?.articleText && !forceRefetch) {
      setEnglishFallback(cached.articleText);
      return () => {};
    }

    setTranslatingBody(true);

    const callTranslateDetail = (articleText: string | null | undefined, preferFallback: boolean) =>
      runExclusive(async () => {
        const estimatedTokens = 400 + (articleText?.length ?? 0) / 3; // artículo completo, más caro que un lote de tarjetas
        await waitForTokenBudget(estimatedTokens, "high");
        const result = await fetch("/api/translate-detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: targetItem.title, summary: targetItem.summary, articleText, preferFallback }),
        }).then((res) => res.json());
        recordTokenUsage(estimatedTokens);
        return result;
      }, "high") as Promise<{ title?: string | null; body?: string | null }>;

    const params = new URLSearchParams({ url: targetItem.source.url });
    fetch(`/api/enrich-detail?${params.toString()}`)
      .then((res) => res.json())
      .then(async (data: { coverImageUrl?: string | null; articleText?: string | null }) => {
        if (cancelled) return;
        if (data.coverImageUrl) setDetailCover(data.coverImageUrl);
        if (data.articleText) {
          saveCachedTranslation(targetItem.source.url, { articleText: data.articleText });
        }

        // Fuentes que ya vienen en español (ver "language" en NewsItem):
        // el artículo descargado se usa tal cual, sin pasar por Groq —
        // no hace falta traducir lo que ya está en el idioma correcto.
        if (targetItem.language === "es") {
          if (data.articleText) {
            setBody(data.articleText);
            saveCachedTranslation(targetItem.source.url, { title: targetItem.title, body: data.articleText });
          } else {
            setLoadFailed(true);
          }
          return;
        }

        // Cada invocación de /api/translate-detail hace como mucho UNA
        // llamada a Groq. Hasta 3 intentos automáticos (modelo principal,
        // luego respaldo, luego principal otra vez con más margen) antes
        // de pedirle al usuario que reintente a mano — reduce cuántas
        // veces hace falta tocar el botón "Reintentar".
        let translated = await callTranslateDetail(data.articleText, false);
        if (cancelled) return;
        if (!translated.body) {
          await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;
          translated = await callTranslateDetail(data.articleText, true);
          if (cancelled) return;
        }
        if (!translated.body) {
          await new Promise((r) => setTimeout(r, 3000));
          if (cancelled) return;
          translated = await callTranslateDetail(data.articleText, false);
          if (cancelled) return;
        }

        if (translated.title) setTitle(translated.title);
        if (translated.body) {
          setBody(translated.body);
          saveCachedTranslation(targetItem.source.url, { title: translated.title ?? undefined, body: translated.body });
        } else if (data.articleText) {
          setEnglishFallback(data.articleText);
        } else {
          setLoadFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setTranslatingBody(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    if (!item) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(null);
      setBody(null);
      setEnglishFallback(null);
      setDetailCover(null);
      setLoadFailed(false);
      return;
    }
    return runDetailFetch(item, false);
  }, [item, runDetailFetch]);

  const handleRetry = useCallback(() => {
    if (item) runDetailFetch(item, true);
  }, [item, runDetailFetch]);

  const shownBody = body || englishFallback || item?.summary || item?.body || "";

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

                {translatingBody && !body && (
                  <p className="mt-3 text-xs text-muted">Traduciendo el artículo…</p>
                )}
                {!translatingBody && englishFallback && !body && (
                  <p className="mt-3 text-xs text-muted">
                    No se pudo traducir el artículo — se muestra en inglés.{" "}
                    <button type="button" onClick={handleRetry} className="underline hover:text-foreground">
                      Reintentar
                    </button>
                  </p>
                )}
                {!translatingBody && loadFailed && !body && !englishFallback && (
                  <p className="mt-3 text-xs text-muted">
                    No se pudo cargar el artículo — se muestra el resumen.{" "}
                    <button type="button" onClick={handleRetry} className="underline hover:text-foreground">
                      Reintentar
                    </button>
                  </p>
                )}

                <AnimatePresence mode="wait">
                  <motion.p
                    key={shownBody}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90"
                  >
                    {shownBody}
                  </motion.p>
                </AnimatePresence>

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
