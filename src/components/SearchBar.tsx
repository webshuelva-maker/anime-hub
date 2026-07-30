"use client";

import { useMemo, useState } from "react";
import { NewsItem } from "@/types/news";

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

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const seen = new Set<string>();
    const matches: string[] = [];
    for (const item of items) {
      const t = item.relatedTitle;
      if (t.toLowerCase().includes(q) && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        matches.push(t);
      }
      if (matches.length >= 6) break;
    }
    return matches;
  }, [query, items]);

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

      {focused && suggestions.length > 0 && (
        <div className="panel absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl shadow-xl shadow-black/40">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={() => runSearch(s)}
              className="block w-full truncate px-4 py-2.5 text-left text-sm text-foreground hover:bg-panel-soft"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
