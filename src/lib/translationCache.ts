/*
 * La versión va en el nombre. Las traducciones guardadas antes de la
 * v140 llevaban el artículo recortado a 1500 caracteres, y al estar en
 * caché seguían saliendo cortadas por mucho que ahora se descargue
 * entero. Cambiar el nombre las deja atrás sin tener que borrar nada a
 * mano.
 */
const CACHE_KEY = "anime-hub:translation-cache:v2";
const MAX_ENTRIES = 200; // límite razonable para no llenar localStorage

interface CachedTranslation {
  title?: string;
  summary?: string;
  body?: string;
  // Artículo original en inglés ya descargado (sin traducir). Se guarda
  // aparte de "body" para que, si la traducción falla, reabrir la misma
  // noticia no tenga que volver a descargar el artículo de la web
  // original — solo reintentar la traducción, y solo si el usuario lo
  // pide explícitamente (botón "Reintentar").
  articleText?: string;
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
