"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { vibrar } from "@/lib/haptics";
import { repartirEnParrafos } from "@/lib/parrafos";
import { NewsItem } from "@/types/news";
import { NewsCover } from "./NewsCover";
import { HeartButton } from "./NewsCard";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { PlatformBadge } from "./PlatformBadge";
import { formatRelativeDate } from "@/lib/date";
import { recordNewsInteraction } from "@/lib/learning";
import { getCachedTranslation, saveCachedTranslation } from "@/lib/translationCache";
import { runExclusive, waitForTokenBudget, recordTokenUsage } from "@/lib/apiQueue";

export function NewsDetail({
  item,
  onClose,
  liked,
  onToggleLike,
}: {
  item: NewsItem | null;
  onClose: () => void;
  /*
   * El me gusta también aquí, y no solo en las tarjetas grandes.
   * Las noticias de "Más noticias" se dibujan con NewsThumb, que no
   * tiene corazón, así que hasta ahora no había NINGUNA forma de marcar
   * como favorita una noticia que no fuera de las destacadas — ni
   * abriéndola. Desde el detalle se puede marcar cualquiera.
   */
  liked?: boolean;
  onToggleLike?: () => void;
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

    /*
     * Si el propio RSS ya trajo el artículo entero (la mayoría de los
     * medios españoles lo incluyen), se enseña directamente y no se pide
     * nada: ni descarga de la web, ni espera, ni posibilidad de que
     * falle. Es lo que arregla el "no se pudo cargar el artículo" en la
     * mayoría de las noticias.
     */
    if (targetItem.language === "es" && targetItem.body && targetItem.body.length > 400) {
      setBody(targetItem.body);
      return () => {};
    }

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

    // Se avisa del idioma para que el servidor devuelva el artículo
    // entero cuando no haya que traducirlo.
    const params = new URLSearchParams({
      url: targetItem.source.url,
      lang: targetItem.language ?? "en",
    });
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

  /*
   * Se reparte en párrafos también AQUÍ, al pintarlo, y no solo al
   * traducir. Las traducciones se guardan en el navegador, así que los
   * artículos traducidos antes de este arreglo seguirían saliendo como
   * un muro de texto por mucho que ahora se traduzca bien. Aplicarlo al
   * mostrar arregla también los que ya estaban guardados.
   */
  /** ¿Esta noticia ya viene en español? Entonces no hay nada que traducir. */
  const esEspanol = item?.language === "es";

  const shownBody = repartirEnParrafos(body || englishFallback || item?.summary || item?.body || "");

  /*
   * En móvil el detalle deja de ser una ventana centrada y pasa a ser una
   * hoja que sube desde abajo y se cierra arrastrándola. Es el gesto que
   * espera cualquiera que use el móvil, y evita tener que apuntar a una
   * ✕ diminuta en una esquina.
   *
   * El arrastre se inicia SOLO desde el asa de arriba (por eso
   * dragListener={false} y los controles manuales). Si se pudiera
   * arrastrar desde cualquier parte, el gesto pelearía con el
   * desplazamiento del texto y cerrar sin querer sería constante.
   */
  const [isMobile, setIsMobile] = useState(false);
  const dragControls = useDragControls();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {item && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/85 p-0 sm:items-center sm:p-4 sm:py-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            key="panel"
            className="panel relative max-h-[90dvh] w-full max-w-2xl overflow-hidden rounded-t-3xl sm:max-h-[85vh] sm:rounded-2xl"
            initial={isMobile ? { y: "100%" } : { opacity: 0 }}
            animate={isMobile ? { y: 0 } : { opacity: 1 }}
            exit={isMobile ? { y: "100%" } : { opacity: 0 }}
            transition={isMobile ? { type: "spring", stiffness: 320, damping: 34 } : { duration: 0.18 }}
            drag={isMobile ? "y" : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              // Se cierra si has arrastrado lo bastante O si has hecho un
              // gesto rápido hacia abajo, aunque sea corto: soltar con
              // impulso es como se cierra una hoja en cualquier app.
              if (info.offset.y > 110 || info.velocity.y > 600) {
                vibrar(8);
                onClose();
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Asa de arrastre: solo en móvil, y es el único sitio desde
                el que se puede tirar de la hoja. */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="absolute inset-x-0 top-0 z-20 flex touch-none justify-center py-3 sm:hidden"
              style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)" }}
            >
              <span className="h-1 w-10 rounded-full bg-white/45" />
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              // 40px de área en móvil: la de 32px se fallaba con el dedo.
              className="absolute right-3 top-3 z-30 hidden h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white sm:right-3 sm:flex sm:h-8 sm:w-8"
            >
              ✕
            </button>

            <div className="max-h-[90dvh] overflow-y-auto scrollbar-thin overscroll-contain sm:max-h-[85vh]">
              <NewsCover
                category={item.category}
                relatedTitle={item.relatedTitle}
                coverImageUrl={item.coverImageUrl || detailCover || undefined}
              />

              <div className="p-6 sm:p-8">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  {onToggleLike && (
                    <HeartButton liked={!!liked} onToggle={onToggleLike} />
                  )}
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

                {/* Nada de mensajes de traducción cuando la noticia ya
                    viene en español: no hay nada que traducir y el aviso
                    solo confunde. */}
                {esEspanol ? null : translatingBody && !body ? (
                  <p className="mt-3 text-xs text-muted">Traduciendo el artículo…</p>
                ) : null}
                {!esEspanol && !translatingBody && englishFallback && !body && (
                  <p className="mt-3 text-xs text-muted">
                    No se pudo traducir el artículo — se muestra en inglés.{" "}
                    <button type="button" onClick={handleRetry} className="underline hover:text-foreground">
                      Reintentar
                    </button>
                  </p>
                )}
                {/* Antes aquí ponía "No se pudo cargar el artículo", en
                    rojo y a la vista. Para el lector eso es un fallo de la
                    app, cuando la mayoría de las veces solo significa que
                    ese medio no deja leer su web desde fuera. Se enseña lo
                    que hay y se ofrece terminar de leerlo en la fuente,
                    que es lo útil. */}
                {!translatingBody && loadFailed && !body && !englishFallback && (
                  <p className="mt-3 text-xs text-muted">
                    Este medio no permite leer el artículo completo aquí.{" "}
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
