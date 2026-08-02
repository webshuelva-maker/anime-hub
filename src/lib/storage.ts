import { UserPreferences } from "@/types/news";

const STORAGE_KEY = "anime-hub:preferences";

export const DEFAULT_PREFERENCES: UserPreferences = {
  genres: [],
  studios: [],
  platforms: [],
  customPlatforms: [],
  favoriteTitles: [],
  contentFormat: "ambos",
  onboardingCompleted: false,
  digestTime: "08:00",
  spoilerFreeMode: false,
  displayName: "",
  avatarId: "a1",
  avatarPhotoDataUrl: null,
  genreInteractionCounts: {},
  studioInteractionCounts: {},
  likedNewsIds: [],
  titleInterestCounts: {},
  genreExamples: {},
  studioExamples: {},
  searchHistory: [],
  soundEnabled: true,
  updatedAt: null,
  acceptedLegalAt: null,
  acceptedLegalVersion: null,
};

export function getPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export const PREFERENCES_CHANGED_EVENT = "anime-hub:preferences-changed";

/**
 * Guarda SOLO en el navegador, sin tocar la nube ni la marca de tiempo.
 * La usa la sincronización cuando baja el estado de Supabase: si pasara
 * por savePreferences se marcaría como cambio nuevo y volvería a subirse
 * en bucle.
 */
export function savePreferencesLocal(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
}

export function savePreferences(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  // La marca de tiempo es la que decide quién gana cuando el móvil y el
  // ordenador tienen versiones distintas.
  const stamped: UserPreferences = { ...prefs, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));

  // Import diferido para no arrastrar el cliente de Supabase a cualquier
  // sitio que solo quiera leer preferencias.
  void import("./cloudSync").then((m) => m.scheduleCloudPush());
}

export function clearPreferences(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  // Borrar de verdad quiere decir borrar también la copia de la nube: si
  // no, al recargar volvería a bajarse todo lo que acabas de borrar.
  void import("./cloudSync").then((m) => m.clearCloudState());
}
