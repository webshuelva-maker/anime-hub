"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { NewsItem } from "@/types/news";

/**
 * Sugerencia con carátula, igual que en "Animes favoritos".
 *
 * Antes esto era una lista de títulos sueltos en texto plano. Con la
 * portada, el formato y el año se reconoce la serie de un vistazo, que
 * es justo lo que se pide a un buscador de anime: casi nadie recuerda el
 * título exacto, pero todo el mundo reconoce la carátula.
 */
interface Sugerencia {
  titulo: string;
  cover: string | null;
  formato: string | null;
  anio: number | null;
  /** true si viene del feed ya cargado (aparece al instante). */
  local: boolean;
}

export function SearchBar({
  items,
  onSearch,
  onClear,
}: {
  items: NewsItem[];
  onSearch: (term: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [dbSuggestions, setDbSuggestions] = useState<Sugerencia[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Sugerencias de lo que ya está cargado en el feed (aparecen al instante)
  const localSuggestions = useMemo<Sugerencia[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const seen = new Set<string>();
    const matches: Sugerencia[] = [];
    for (const item of items) {
      const t = item.relatedTitle;
      if (t.toLowerCase().includes(q) && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        matches.push({
          titulo: t,
          // Si esa noticia ya tiene carátula cargada, se reutiliza: sale
          // al instante y sin pedir nada.
          cover: item.coverImageUrl ?? null,
          formato: null,
          anio: null,
          local: true,
        });
      }
      if (matches.length >= 3) break;
    }
    return matches;
  }, [query, items]);

  // Sugerencias de la base de datos completa de AniList (con un pequeño
  // retraso mientras escribes, para no lanzar una petición por cada letra)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDbSuggestions([]);
      return;
    }
    setLoadingSuggestions(true);
    const timer = setTimeout(() => {
      fetch(`/api/anime-search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then(
          (data: {
            results?: {
              title: string;
              coverImage?: string | null;
              format?: string | null;
              startYear?: number | null;
            }[];
          }) => {
            setDbSuggestions(
              (data.results ?? []).map((r) => ({
                titulo: r.title,
                cover: r.coverImage ?? null,
                formato: r.format ?? null,
                anio: r.startYear ?? null,
                local: false,
              }))
            );
          }
        )
        .catch(() => setDbSuggestions([]))
        .finally(() => setLoadingSuggestions(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const suggestions = useMemo<Sugerencia[]>(() => {
    const seen = new Set<string>();
    const combined: Sugerencia[] = [];
    for (const sug of [...localSuggestions, ...dbSuggestions]) {
      const clave = sug.titulo.toLowerCase();
      if (seen.has(clave)) continue;
      seen.add(clave);
      combined.push(sug);
    }
    return combined.slice(0, 6);
  }, [localSuggestions, dbSuggestions]);

  const runSearch = (term: string) => {
    setQuery(term);
    setFocused(false);
    if (term.trim()) onSearch(term.trim());
    else onClear();
  };

  return (
    <div className="relative w-full max-w-sm">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch(query);
            if (e.key === "Escape") runSearch("");
          }}
          placeholder="Busca un anime…"
          className="panel-elevated w-full rounded-full py-2 pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted focus:shadow-[0_0_0_2px_var(--accent-solid)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => runSearch("")}
            aria-label="Borrar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      <AnimatePresence>
        {focused && (suggestions.length > 0 || loadingSuggestions) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="panel absolute left-0 right-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-xl border border-panel-border shadow-xl shadow-black/40"
          >
            {/*
              Las sugerencias entran escalonadas, igual que en el buscador
              de "Tus favoritos".

              Aquí no había ninguna animación: el panel aparecía y dentro
              ya estaba todo puesto. Con esto se ve de dónde sale cada
              línea, y además tapa el momento en que llegan las de la base
              de datos y se suman a las que ya había — que antes era un
              parpadeo con la lista cambiando de golpe.

              El escalón está topado: con seis sugerencias, un retraso sin
              límite dejaría la última entrando cuando ya has movido el
              ratón hasta ella.
            */}
            {suggestions.map((sug, i) => (
              <motion.button
                key={sug.titulo}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.22,
                  delay: Math.min(i * 0.035, 0.18),
                  ease: [0.16, 1, 0.3, 1],
                }}
                onMouseDown={() => runSearch(sug.titulo)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-panel-soft"
              >
                {sug.cover ? (
                  <Image
                    src={sug.cover}
                    alt=""
                    width={32}
                    height={44}
                    unoptimized
                    className="h-11 w-8 flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <span
                    className="h-11 w-8 flex-shrink-0 rounded"
                    style={{ background: "var(--panel-soft)" }}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{sug.titulo}</span>
                  <span className="text-[11px] text-muted">
                    {sug.local
                      ? "En tu feed"
                      : [sug.formato, sug.anio].filter(Boolean).join(" · ") || "Base de datos"}
                  </span>
                </span>
              </motion.button>
            ))}
            <AnimatePresence mode="wait" initial={false}>
              {loadingSuggestions && suggestions.length === 0 && (
                <motion.p
                  key="buscando"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  exit={{ opacity: 0 }}
                  transition={{ opacity: { duration: 1.3, repeat: Infinity, ease: "easeInOut" } }}
                  className="px-4 py-3 text-xs text-muted"
                >
                  Buscando…
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
