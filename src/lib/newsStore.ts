import { NewsItem } from "@/types/news";

const STORAGE_KEY = "anime-hub:news-cache";
// Si el navegador "descarga" la pestaña en segundo plano y la recarga al
// volver, esto evita tener que esperar y traducir todo otra vez — solo si
// lo guardado no es demasiado viejo.
const MAX_CACHE_AGE_MS = 20 * 60 * 1000;

let current: NewsItem[] = [];
let hydrated = false;

function loadFromSession(): NewsItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: { items: NewsItem[]; savedAt: number } = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > MAX_CACHE_AGE_MS) return [];
    return parsed.items ?? [];
  } catch {
    return [];
  }
}

export function getNewsItems(): NewsItem[] {
  if (!hydrated) {
    hydrated = true;
    if (current.length === 0) current = loadFromSession();
  }
  return current;
}

export function setNewsItems(items: NewsItem[]): void {
  current = items;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ items, savedAt: Date.now() }));
  } catch {
    // si sessionStorage está lleno o no disponible, no pasa nada — sigue
    // funcionando, solo sin este atajo
  }
}

export function hasFreshCache(): boolean {
  return getNewsItems().length > 0;
}
