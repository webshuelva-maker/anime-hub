"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NewsCard } from "./NewsCard";
import { NewsThumb } from "./NewsThumb";
import { NewsDetail } from "./NewsDetail";
import { FirstLoadOverlay } from "./FirstLoadOverlay";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { getPreferences, DEFAULT_PREFERENCES } from "@/lib/storage";
import { NewsItem, UserPreferences } from "@/types/news";
import { scoreNewsItem, toggleLike, recordNewsInteraction, recordSearch } from "@/lib/learning";
import { formatRelativeDate } from "@/lib/date";
import { Avatar } from "./AvatarPicker";
import { getNewsItems, setNewsItems } from "@/lib/newsStore";
import { SearchBar } from "./SearchBar";
import { AnimeSearchResult } from "@/lib/anilist";
import { getCachedTranslation, saveCachedTranslation } from "@/lib/translationCache";
import { runExclusive, waitWhileBackgroundPaused, waitForTokenBudget, recordTokenUsage } from "@/lib/apiQueue";

type FeedStatus = "loading" | "live" | "offline" | "down";

export function NewsFeed() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [openItemId, setOpenItemId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem("anime-hub:open-item")
  );
  const [visibleTail, setVisibleTail] = useState(6);
  const [items, setItems] = useState<NewsItem[]>(getNewsItems());
  const [status, setStatus] = useState<FeedStatus>(() => (getNewsItems().length > 0 ? "live" : "loading"));
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [animeResults, setAnimeResults] = useState<AnimeSearchResult[]>([]);
  const [searchingAnime, setSearchingAnime] = useState(false);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const pendingItemsRef = useRef<NewsItem[]>([]);
  // IDs cuya traducción ya está en curso ahora mismo. enrichItems() se
  // dispara desde varios sitios (carga inicial, refresco silencioso cada
  // 15 min, y al volver a la pestaña) y podían solaparse: si dos
  // llamadas arrancaban casi a la vez, las dos lanzaban su propio
  // "primer lote" de 3 noticias en el mismo instante, duplicando
  // peticiones a Groq justo para esas primeras tarjetas — por eso eran
  // las que peor iban. Este set evita que una noticia ya en traducción
  // se vuelva a encolar hasta que termine.
  const translatingLockRef = useRef<Set<string>>(new Set());

  // Pantalla de carga a pantalla completa: SOLO si de verdad no había
  // nada en caché al entrar (primera visita real, o caché borrada). En
  // cualquier otro caso (visita normal, refresco silencioso cada 15 min)
  // no se muestra — eso ya lo cubre el aviso pequeño "Actualizando…".
  const [showInitialLoader, setShowInitialLoader] = useState(() => getNewsItems().length === 0);
  // Estable (no cambia con el tiempo, a diferencia de showInitialLoader):
  // si esta carga era de verdad la primera visita, para poder exigir un
  // mínimo de permanencia SOLO en ese caso (ver más abajo) — en cargas
  // normales o refrescos silenciosos no debe añadir ningún retraso.
  const isFirstEverLoadRef = useRef(getNewsItems().length === 0);
  // Cuántas noticias tenía el primer lote a traducir — junto con
  // translatingIds.size (cuántas quedan) da el progreso real de la
  // pantalla de carga, en vez de un giro indefinido sin información.
  // Es estado (no ref) porque se usa para renderizar la barra de progreso.
  const [initialBatchTotal, setInitialBatchTotal] = useState(0);
  // Ids concretos del lote inicial (las 9 visibles) — translatingIds
  // ahora también incluye la traducción de fondo (más allá de esas 9),
  // así que el progreso de la pantalla de carga necesita saber
  // exactamente cuáles de esos ids son "las que cuentan". Es estado (no
  // ref) porque se lee durante el render para calcular la barra.
  const [initialBatchIds, setInitialBatchIds] = useState<Set<string>>(new Set());
  // Duración estimada para que la barra de la pantalla de carga vaya de
  // 0 a 100 — calculada según cuánto hay que traducir (ver donde se
  // fija, más abajo). FirstLoadOverlay decide sola cuándo cerrarse en
  // función de esto y del progreso real.
  const [estimatedDurationMs, setEstimatedDurationMs] = useState(6000);

  useEffect(() => {
    if (!showInitialLoader) return;
    // Red de seguridad: si Groq está teniendo un mal día y la traducción
    // no termina nunca, no se puede dejar al usuario atrapado en la
    // pantalla de carga para siempre.
    const safety = setTimeout(() => setShowInitialLoader(false), 18000);
    return () => clearTimeout(safety);
  }, [showInitialLoader]);

  const loadNews = (silent = false) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    if (!silent) setStatus("loading");
    if (silent) setRefreshing(true);
    fetch("/api/news")
      .then(async (res) => {
        const data: { items?: NewsItem[] } = await res.json();
        if (res.ok && data.items && data.items.length > 0) {
          setNewsItems(data.items);
          setItems(data.items);
          setStatus("live");
          enrichItems(data.items);
        } else if (!silent) {
          setStatus("down");
        }
      })
      .catch(() => {
        if (!silent) {
          setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "down");
        }
      })
      .finally(() => {
        if (silent) setRefreshing(false);
      });
  };

  /**
   * Pide, noticia a noticia y por separado (no todas de golpe), la
   * carátula real, el artículo completo y la traducción. El navegador ya
   * limita solo cuántas peticiones van a la vez, así que no hace falta
   * ningún límite manual — y si una falla, las demás siguen sin problema.
   * La imagen y la traducción se piden EN PARALELO, cada una por su lado —
   * así una traducción lenta nunca retiene una imagen que ya está lista.
   */
  const enrichItems = (loadedItems: NewsItem[]) => {
    // BUG encontrado: esto tomaba los primeros 9 en el orden en que
    // llegan del feed (RSS combinado), que NO es el mismo orden en que
    // se muestran en pantalla — "ranked" reordena por afinidad/fecha más
    // abajo. Por eso lo primero en traducirse a veces no coincidía con
    // "Portada" ni "Historias principales", que podían tocarles lotes
    // posteriores (más lentos o sujetos al límite de Groq). Se ordena
    // aquí con el MISMO criterio que "ranked" antes de recortar, para
    // que lo que se traduce primero sea justo lo que se ve primero.
    const sorted = [...loadedItems].sort((a, b) => {
      const scoreDiff = scoreNewsItem(b, prefs) - scoreNewsItem(a, prefs);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    // Antes eran 16 de golpe — con el límite de tokens/minuto del plan
    // gratuito de Groq, traducir tantas de una sentada agotaba el
    // presupuesto antes de terminar. 9 cubre justo lo que se ve sin
    // desplegar "Ver más" (portada + 2 historias + 6 de la cola) — eso
    // sigue siendo lo único que carga carátula/imagen por adelantado.
    // Pero la TRADUCCIÓN (más barata, sin imágenes de por medio) sigue
    // en segundo plano bastante más allá de esas 9, a un ritmo mucho más
    // lento (no hay prisa, nadie lo está esperando) — así, cuando el
    // usuario despliega "Ver más" o abre una noticia, con suerte ya
    // estaba traducida de fondo mientras leía otra cosa.
    const VISIBLE_CAP = 9;
    const BACKGROUND_TRANSLATE_CAP = 30;
    const targets = sorted.slice(0, VISIBLE_CAP);
    const backgroundTargets = sorted.slice(VISIBLE_CAP, BACKGROUND_TRANSLATE_CAP);
    pendingItemsRef.current = targets;
    setEnrichingIds(new Set(targets.map((i) => i.id)));

    // Solo se traducen las que no estén YA traduciéndose por una llamada
    // anterior todavía en vuelo (ver comentario de translatingLockRef).
    const needTranslation = targets.filter((i) => !translatingLockRef.current.has(i.id));
    const needTranslationBackground = backgroundTargets.filter((i) => !translatingLockRef.current.has(i.id));
    [...needTranslation, ...needTranslationBackground].forEach((i) => translatingLockRef.current.add(i.id));
    setTranslatingIds((prev) => new Set([...prev, ...needTranslation.map((i) => i.id), ...needTranslationBackground.map((i) => i.id)]));
    if (isFirstEverLoadRef.current && initialBatchTotal === 0) {
      setInitialBatchTotal(needTranslation.length);
      setInitialBatchIds(new Set(needTranslation.map((i) => i.id)));
      // ~3.8s por lote de 3 (pausa entre lotes + tiempo de respuesta de
      // Groq), redondeando hacia arriba lotes parciales. Mínimo 3s para
      // que la barra nunca se sienta instantánea incluso con pocas
      // noticias.
      const estimatedChunks = Math.max(1, Math.ceil(needTranslation.length / 3));
      setEstimatedDurationMs(Math.max(3000, estimatedChunks * 3800));
    }

    const updateItem = (id: string, patch: Partial<NewsItem>) => {
      setItems((prev) => {
        const next = prev.map((it) => (it.id === id ? { ...it, ...patch } : it));
        setNewsItems(next);
        return next;
      });
    };

    targets.forEach(async (item, index) => {
      // La imagen es barata — se reparte poco.
      await new Promise((r) => setTimeout(r, index * 150));
      try {
        const params = new URLSearchParams({
          relatedTitle: item.relatedTitle,
          url: item.source.url,
          hasImage: item.coverImageUrl ? "1" : "0",
        });
        const data: { coverImageUrl?: string | null } = await (await fetch(`/api/enrich?${params.toString()}`)).json();
        if (data.coverImageUrl) {
          updateItem(item.id, { coverImageUrl: data.coverImageUrl });
          pendingItemsRef.current = pendingItemsRef.current.filter((p) => p.id !== item.id);
        }
      } catch {
        // se queda con la imagen de respaldo; el resto sigue igual
      } finally {
        setEnrichingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    });

    // Traducción por MINI-LOTES: en vez de un único lote grande (que hace
    // esperar a que TODO termine antes de ver nada), se divide en grupos
    // pequeños — así las primeras tarjetas se actualizan enseguida y el
    // resto va llegando con progreso visible. Cada llamada a Groq pasa
    // por runExclusive (ver apiQueue.ts) y los lotes se
    // procesan EN SERIE (uno espera a que el anterior termine de verdad,
    // nada de "esperar 1s y lanzar el siguiente igualmente"): lanzarlos
    // en paralelo con un simple retraso fijo es lo que hacía que solo el
    // primer lote (el único sin contienda) llegara a traducirse, y todos
    // los demás chocaran entre sí contra un límite de concurrencia de la
    // clave de Groq — de ahí la cola en serie (ver apiQueue.ts).
    const CHUNK_SIZE = 3;

    const callTranslateBatch = (
      items: NewsItem[],
      preferFallback: boolean
    ): Promise<Map<string, { title?: string; summary?: string }>> =>
      runExclusive(async () => {
        // Estimación aproximada (prompt del sistema + contenido +
        // respuesta) — no exacta, pero suficiente para no lanzar la
        // petición a ciegas cuando el presupuesto ya está casi agotado.
        const estimatedTokens = 300 + items.length * 200;
        await waitForTokenBudget(estimatedTokens, "normal");
        try {
          const res = await fetch("/api/translate-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: items.map((it) => ({ id: it.id, title: it.title, summary: it.summary })),
              preferFallback,
            }),
          });
          const data: { results?: { id: string; title?: string; summary?: string }[] } = await res.json();
          recordTokenUsage(estimatedTokens);
          return new Map((data.results ?? []).map((r) => [r.id, r]));
        } catch {
          recordTokenUsage(estimatedTokens);
          return new Map();
        }
      }, "normal");

    const translateChunk = async (chunk: NewsItem[]) => {
      const stillNeeded: NewsItem[] = [];
      chunk.forEach((item) => {
        const cached = getCachedTranslation(item.source.url);
        if (cached?.title) {
          updateItem(item.id, { title: cached.title, summary: cached.summary || item.summary });
        } else {
          stillNeeded.push(item);
        }
      });

      let pending = stillNeeded;
      // Hasta 2 intentos por lote: cada invocación de /api/translate-batch
      // hace como mucho UNA llamada a Groq. Si el primer
      // intento falla, este segundo intento usa el modelo de RESPALDO
      // (preferFallback), no el mismo que ya falló — antes un solo fallo
      // dejaba esas noticias sin traducir para siempre en esa sesión.
      for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
        const byId = await callTranslateBatch(pending, attempt > 0);
        const stillMissing: NewsItem[] = [];
        pending.forEach((item) => {
          const translated = byId.get(item.id);
          if (translated?.title) {
            updateItem(item.id, { title: translated.title, summary: translated.summary || item.summary });
            saveCachedTranslation(item.source.url, { title: translated.title, summary: translated.summary });
          } else {
            stillMissing.push(item);
          }
        });
        pending = stillMissing;
      }

      setTranslatingIds((prev) => {
        const next = new Set(prev);
        chunk.forEach((item) => next.delete(item.id));
        return next;
      });
      chunk.forEach((item) => translatingLockRef.current.delete(item.id));
    };

    (async () => {
      for (let i = 0; i < needTranslation.length; i += CHUNK_SIZE) {
        const chunk = needTranslation.slice(i, i + CHUNK_SIZE);
        await waitWhileBackgroundPaused();
        // Se espera a que termine cada lote (incluido su reintento) antes
        // de pasar al siguiente — así solo hay una petición a Groq en
        // vuelo a la vez desde toda la app (esto también sirve de cola
        // compartida con la traducción del detalle, ver NewsDetail.tsx).
        await translateChunk(chunk);
        // Además, una pausa fija entre lotes: Groq responde tan rápido
        // (menos de 1s) que sin esto se podían encadenar 5-6 peticiones
        // en el mismo minuto y agotar su límite de tokens/minuto del
        // plan gratuito — eso hacía que solo el primer lote (y a veces
        // Ren, si tenía la mala suerte de pedir justo entonces) fueran
        // los únicos que cabían antes de que el límite se llenara.
        if (i + CHUNK_SIZE < needTranslation.length) {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
      // El cierre de la pantalla de carga inicial ya NO se decide aquí
      // con una espera fija — lo decide el propio FirstLoadOverlay,
      // cuando su barra (calculada según el tiempo estimado del trabajo)
      // llega de verdad al 100%, vía la prop onComplete. Así nunca
      // desaparece a mitad de cuenta.

      // A partir de aquí, lo visible ya está — se sigue traduciendo el
      // resto EN SEGUNDO PLANO, más despacio (nadie lo está esperando),
      // mientras el usuario lee tranquilo. Así, para cuando despliegue
      // "Ver más" o abra una noticia de más abajo, con suerte ya está
      // traducida de fondo en vez de tener que esperar en ese momento.
      for (let i = 0; i < needTranslationBackground.length; i += CHUNK_SIZE) {
        const chunk = needTranslationBackground.slice(i, i + CHUNK_SIZE);
        await waitWhileBackgroundPaused();
        await translateChunk(chunk);
        await new Promise((r) => setTimeout(r, 6000));
      }
    })();
  };

  // Los navegadores frenan las pestañas en segundo plano, así que si vuelves
  // a mirarla y todavía quedan noticias sin carátula/traducción real, se
  // reintentan solas.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && pendingItemsRef.current.length > 0) {
        enrichItems(pendingItemsRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(getPreferences());

    // Si ya teníamos una copia guardada (p. ej. el navegador recargó la
    // pestaña en segundo plano, o simplemente volviste a entrar), se ve
    // al instante — pero además se comprueba en segundo plano si hay algo
    // nuevo, sin esperar a los 15 minutos ni interrumpir lo que ya se ve.
    if (getNewsItems().length) {
      loadNews(true);
    } else {
      loadNews();
    }

    // Refresco silencioso cada 15 minutos: si ya estás viendo noticias, no se
    // interrumpe la vista ni aunque este refresco puntual falle.
    const interval = setInterval(() => loadNews(true), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const hasLearned =
    Object.keys(prefs.genreInteractionCounts).length > 0 ||
    Object.keys(prefs.studioInteractionCounts).length > 0;

  const ranked = useMemo(() => {
    return items.map((item) => ({
      item,
      score: scoreNewsItem(item, prefs),
    })).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime();
    });
  }, [items, prefs]);

  const [featured, second, third, ...tail] = ranked;
  const mainStories = [second, third].filter(Boolean) as typeof ranked;
  const openItem: NewsItem | null = items.find((n) => n.id === openItemId) ?? null;

  const searchResults = useMemo(() => {
    if (!searchTerm) return null;
    const q = searchTerm.toLowerCase();
    return ranked.filter(
      ({ item }) => item.title.toLowerCase().includes(q) || item.relatedTitle.toLowerCase().includes(q)
    );
  }, [ranked, searchTerm]);

  const handleToggleLike = (itemId: string) => {
    const item = items.find((n) => n.id === itemId);
    if (!item) return;
    toggleLike(item);
    setPrefs(getPreferences());
  };

  const handleOpenDetail = (itemId: string, item: NewsItem) => {
    setOpenItemId(itemId);
    window.sessionStorage.setItem("anime-hub:open-item", itemId);
    recordNewsInteraction(item);
  };

  return (
    <div>
      <AnimatePresence>
        {showInitialLoader && (
          <FirstLoadOverlay
            key="first-load"
            progress={
              initialBatchTotal > 0
                ? Math.min(
                    1,
                    (initialBatchTotal - [...translatingIds].filter((id) => initialBatchIds.has(id)).length) /
                      initialBatchTotal
                  )
                : 0
            }
            estimatedDurationMs={estimatedDurationMs}
            onComplete={() => setShowInitialLoader(false)}
          />
        )}
      </AnimatePresence>

      <div className="border-b border-panel-border/70">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex items-center gap-3">
            <Avatar avatarId={prefs.avatarId} photoDataUrl={prefs.avatarPhotoDataUrl} size="md" rounded="full" />
            <div>
              <p className="font-heading text-lg font-semibold">
                {prefs.displayName ? `Hola, ${prefs.displayName}` : "Hola de nuevo"}
              </p>
              <p className="text-sm text-muted">
                {hasLearned
                  ? "Ordenado según lo que has leído y marcado"
                  : "Marca ♡ en lo que te interese y el orden se ajustará solo"}
              </p>
            </div>
            <span
              className={`ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                status === "live" ? "border-ice/30 text-ice" : "border-panel-border text-muted"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-ice" : "bg-muted"}`} />
              {status === "loading" && "Conectando…"}
              {status === "live" && (refreshing ? "Actualizando…" : "En directo")}
              {status === "offline" && "Sin conexión"}
              {status === "down" && "Feed caído"}
            </span>
          </div>

          <div className="mt-4">
            <SearchBar
              items={items}
              onSearch={(term) => {
                setSearchTerm(term);
                recordSearch(term);
                setSearchingAnime(true);
                fetch(`/api/anime-search?q=${encodeURIComponent(term)}`)
                  .then((res) => res.json())
                  .then((data: { results?: AnimeSearchResult[] }) => setAnimeResults(data.results ?? []))
                  .catch(() => setAnimeResults([]))
                  .finally(() => setSearchingAnime(false));
              }}
              onClear={() => {
                setSearchTerm("");
                setAnimeResults([]);
              }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        {prefs.customPlatforms.length > 0 && (
          <p className="mb-6 rounded-xl border border-panel-border bg-panel/50 px-4 py-3 text-xs text-muted">
            Guardamos tus plataformas personalizadas ({prefs.customPlatforms.join(", ")}) — muy pronto buscaremos noticias también ahí.
          </p>
        )}

        {status === "loading" && (
          <div className="panel flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center">
            <motion.span
              className="h-3 w-3 rounded-full bg-ice"
              animate={{ scale: [1, 1.6, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            <p className="text-sm text-muted">Cargando noticias en directo…</p>
          </div>
        )}

        {status === "offline" && (
          <div className="panel flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center">
            <p className="font-heading text-lg font-semibold">No hay conexión a internet</p>
            <p className="max-w-sm text-sm text-muted">
              Conéctate a internet para cargar las noticias. En cuanto vuelvas a tener señal, pulsa reintentar.
            </p>
            <button
              type="button"
              onClick={() => loadNews()}
              className="mt-2 rounded-full border border-panel-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:border-ice/40"
            >
              Reintentar
            </button>
          </div>
        )}

        {status === "down" && (
          <div className="panel flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center">
            <p className="font-heading text-lg font-semibold">El feed está caído temporalmente</p>
            <p className="max-w-sm text-sm text-muted">
              No hemos podido traer las noticias de Anime News Network ahora mismo. Puede ser cosa de un momento — inténtalo de nuevo en un rato.
            </p>
            <button
              type="button"
              onClick={() => loadNews()}
              className="mt-2 rounded-full border border-panel-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:border-ice/40"
            >
              Reintentar
            </button>
          </div>
        )}

        {status === "live" && searchResults && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                Resultados para &quot;{searchTerm}&quot;
              </p>
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-xs font-medium text-muted transition-colors hover:text-foreground"
              >
                Volver al feed
              </button>
            </div>

            {searchingAnime && (
              <p className="mb-4 text-xs text-muted">Buscando en la base de datos de anime…</p>
            )}

            {animeResults.length > 0 && (
              <div className="mb-8">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Contenido — información general, no son noticias
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {animeResults.slice(0, 4).map((a) => (
                    <div key={a.id} className="panel flex cursor-default gap-4 rounded-xl p-4">
                      {a.coverImage && (
                        // eslint-disable-next-line @next/next/no-img-element -- fuente externa (AniList)
                        <img src={a.coverImage} alt="" className="h-24 w-16 flex-shrink-0 rounded-lg object-cover" />
                      )}
                      <div className="min-w-0">
                        <p className="font-heading text-sm font-semibold text-foreground">{a.title}</p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ice">
                          {[a.format, a.status, a.startYear ? (a.endYear && a.endYear !== a.startYear ? `${a.startYear}–${a.endYear}` : `${a.startYear}`) : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {a.description && (
                          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted">{a.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
              Noticias recientes
            </p>
            {searchResults.length === 0 ? (
              <p className="panel rounded-xl p-8 text-center text-sm text-muted">
                {(() => {
                  const known = animeResults[0];
                  if (known?.status === "FINISHED" && known.endYear) {
                    return `No hay noticias recientes sobre "${searchTerm}". La serie terminó en ${known.endYear}, así que ya no suelen salir noticias nuevas sobre ella. No tienes que estar pendiente. Si sale algo, lo verás solo en la sección de Noticias.`;
                  }
                  if (known?.status === "NOT_YET_RELEASED") {
                    return `"${searchTerm}" todavía no se ha estrenado, así que de momento no hay noticias recientes sobre ella. Cuando se acerque la fecha, deberían empezar a salir en la sección de Noticias.`;
                  }
                  return `No hay noticias recientes disponibles sobre "${searchTerm}" ahora mismo.`;
                })()}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map(({ item, score }) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    pending={enrichingIds.has(item.id)}
                    translating={translatingIds.has(item.id)}
                    highlight={hasLearned && score > 0}
                    liked={prefs.likedNewsIds.includes(item.id)}
                    onToggleLike={() => handleToggleLike(item.id)}
                    onOpenDetail={() => handleOpenDetail(item.id, item)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {status === "live" && !searchResults && (
          <>
        {featured && (
          <div className="mb-10">
            <p className="font-heading mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Portada
            </p>
            <NewsCard
              item={featured.item}
              featured
              pending={enrichingIds.has(featured.item.id)}
              highlight={hasLearned && featured.score > 0}
              translating={translatingIds.has(featured.item.id)}
              liked={prefs.likedNewsIds.includes(featured.item.id)}
              onToggleLike={() => handleToggleLike(featured.item.id)}
              onOpenDetail={() => handleOpenDetail(featured.item.id, featured.item)}
            />
          </div>
        )}

        {mainStories.length > 0 && (
          <div className="mb-10">
            <p className="font-heading mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Historias principales
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {mainStories.map(({ item, score }) => (
                <NewsCard
                  key={item.id}
                  item={item}
                  pending={enrichingIds.has(item.id)}
                  translating={translatingIds.has(item.id)}
                  highlight={hasLearned && score > 0}
                  liked={prefs.likedNewsIds.includes(item.id)}
                  onToggleLike={() => handleToggleLike(item.id)}
                  onOpenDetail={() => handleOpenDetail(item.id, item)}
                />
              ))}
            </div>
          </div>
        )}

        {tail.length > 0 && (
          <div>
            <p className="font-heading mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Más noticias
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tail.slice(0, visibleTail).map(({ item }) => (
                <motion.button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenDetail(item.id, item)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="card-hover panel flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left hover:border-ice/30"
                >
                  <NewsThumb relatedTitle={item.relatedTitle} coverImageUrl={item.coverImageUrl} pending={enrichingIds.has(item.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <ReliabilityBadge reliability={item.reliability} />
                      {item.prominence === "indie" && (
                        <span className="text-[10px] uppercase tracking-wide text-muted">Indie</span>
                      )}
                    </div>
                    <p className="font-heading truncate text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-muted">
                      {item.summary || item.relatedTitle} · {formatRelativeDate(item.publishedAt)}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>

            {visibleTail < tail.length && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const newlyVisible = tail.slice(visibleTail, visibleTail + 8).map(({ item }) => item);
                    setVisibleTail((n) => n + 8);
                    enrichItems(newlyVisible);
                  }}
                  className="rounded-full border border-panel-border px-5 py-2 text-sm font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
                >
                  Ver {Math.min(8, tail.length - visibleTail)} más
                </button>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      <NewsDetail
        item={openItem}
        onClose={() => {
          setOpenItemId(null);
          window.sessionStorage.removeItem("anime-hub:open-item");
        }}
      />
    </div>
  );
}
