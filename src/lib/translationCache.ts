const CACHE_KEY = "anime-hub:translation-cache";
const MAX_ENTRIES = 200; // límite razonable para no llenar localStorage

interface CachedTranslation {
  title?: string;
  summary?: string;
  body?: string;
  savedAt: number;
}

type CacheShape = Record<string, CachedTranslation>;

function cacheKey(url: string): string {
  return `${url}::es`;
}

function readCache(): CacheShape {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(cache: CacheShape): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage lleno u otro fallo — simplemente se deja de cachear,
    // no rompe nada del resto de la app
  }
}

export function getCachedTranslation(url: string): CachedTranslation | null {
  const cache = readCache();
  return cache[cacheKey(url)] ?? null;
}

export function saveCachedTranslation(url: string, patch: Partial<Omit<CachedTranslation, "savedAt">>): void {
  const cache = readCache();
  const key = cacheKey(url);
  cache[key] = { ...cache[key], ...patch, savedAt: Date.now() };

  // Si se pasa del límite, se quita la entrada más antigua para no crecer sin fin.
  const entries = Object.entries(cache);
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => a[1].savedAt - b[1].savedAt);
    delete cache[entries[0][0]];
  }

  writeCache(cache);
}
