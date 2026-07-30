"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { NewsCard } from "./NewsCard";
import { NewsThumb } from "./NewsThumb";
import { NewsDetail } from "./NewsDetail";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { getPreferences, DEFAULT_PREFERENCES } from "@/lib/storage";
import { NewsItem, UserPreferences } from "@/types/news";
import { scoreNewsItem, toggleLike, recordNewsInteraction, recordSearch } from "@/lib/learning";
import { formatRelativeDate } from "@/lib/date";
import { Avatar } from "./AvatarPicker";
import { getNewsItems, setNewsItems } from "@/lib/newsStore";
import { SearchBar } from "./SearchBar";
import { AnimeSearchResult } from "@/lib/anilist";

type FeedStatus = "loading" | "live" | "offline" | "down";

export function NewsFeed() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [visibleTail, setVisibleTail] = useState(6);
  const [items, setItems] = useState<NewsItem[]>(getNewsItems());
  const [status, setStatus] = useState<FeedStatus>("loading");
  const [searchTerm, setSearchTerm] = useState("");
  const [animeResults, setAnimeResults] = useState<AnimeSearchResult[]>([]);
  const [searchingAnime, setSearchingAnime] = useState(false);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());

  const loadNews = (silent = false) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    if (!silent) setStatus("loading");
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
      });
  };

  /**
   * Pide, noticia a noticia y por separado (no todas de golpe), la
   * carátula real, el artículo completo y la traducción. El navegador ya
   * limita solo cuántas peticiones van a la vez, así que no hace falta
   * ningún límite manual — y si una falla, las demás siguen sin problema.
   * Si la primera respuesta no trae traducción, se reintenta una vez.
   */
  const enrichItems = (loadedItems: NewsItem[]) => {
    const targets = loadedItems.slice(0, 16);
    setEnrichingIds(new Set(targets.map((i) => i.id)));

    targets.forEach(async (item) => {
      const params = new URLSearchParams({
        relatedTitle: item.relatedTitle,
        title: item.title,
        summary: item.summary,
        url: item.source.url,
        hasImage: item.coverImageUrl ? "1" : "0",
      });
      const url = `/api/enrich?${params.toString()}`;

      type EnrichResponse = { coverImageUrl?: string | null; title?: string | null; summary?: string | null };
      let data: EnrichResponse = {};
      try {
        data = await (await fetch(url)).json();
        if (!data.title) {
          await new Promise((r) => setTimeout(r, 1200));
          data = await (await fetch(url)).json();
        }
      } catch {
        // se queda con lo que ya había, el resto de noticias sigue igual
      }

      setItems((prev) => {
        const next = prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                coverImageUrl: data.coverImageUrl || it.coverImageUrl,
                title: data.title || it.title,
                summary: data.summary || it.summary,
              }
            : it
        );
        setNewsItems(next);
        return next;
      });

      setEnrichingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    });
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(getPreferences());
    loadNews();

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
    recordNewsInteraction(item);
  };

  return (
    <div>
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
              {status === "live" && "En directo · ANN"}
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
                  <NewsThumb relatedTitle={item.relatedTitle} coverImageUrl={item.coverImageUrl} />
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
                    <p className="mt-1 text-xs text-muted">
                      {item.relatedTitle} · {formatRelativeDate(item.publishedAt)}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>

            {visibleTail < tail.length && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleTail((n) => n + 8)}
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

      <NewsDetail item={openItem} onClose={() => setOpenItemId(null)} />
    </div>
  );
}
