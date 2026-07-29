"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { NEWS_ITEMS } from "@/data/news";
import { NewsCard } from "./NewsCard";
import { NewsThumb } from "./NewsThumb";
import { NewsDetail } from "./NewsDetail";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { getPreferences, DEFAULT_PREFERENCES } from "@/lib/storage";
import { NewsItem, UserPreferences } from "@/types/news";
import { scoreNewsItem, toggleLike, recordNewsInteraction } from "@/lib/learning";
import { formatRelativeDate } from "@/lib/date";
import { Avatar } from "./AvatarPicker";

export function NewsFeed() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [visibleTail, setVisibleTail] = useState(6);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(getPreferences());
  }, []);

  const hasLearned =
    Object.keys(prefs.genreInteractionCounts).length > 0 ||
    Object.keys(prefs.studioInteractionCounts).length > 0;

  const ranked = useMemo(() => {
    return NEWS_ITEMS.map((item) => ({
      item,
      score: scoreNewsItem(item, prefs),
    })).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime();
    });
  }, [prefs]);

  const [featured, second, third, ...tail] = ranked;
  const mainStories = [second, third].filter(Boolean) as typeof ranked;
  const openItem: NewsItem | null = NEWS_ITEMS.find((n) => n.id === openItemId) ?? null;

  const handleToggleLike = (itemId: string) => {
    const item = NEWS_ITEMS.find((n) => n.id === itemId);
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
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        {prefs.customPlatforms.length > 0 && (
          <p className="mb-6 rounded-xl border border-panel-border bg-panel/50 px-4 py-3 text-xs text-muted">
            Guardamos tus plataformas personalizadas ({prefs.customPlatforms.join(", ")}) — muy pronto buscaremos noticias también ahí.
          </p>
        )}

        {featured && (
          <div className="mb-10">
            <p className="font-heading mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Portada
            </p>
            <NewsCard
              item={featured.item}
              featured
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
                  <NewsThumb relatedTitle={item.relatedTitle} />
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
      </div>

      <NewsDetail item={openItem} onClose={() => setOpenItemId(null)} />
    </div>
  );
}
