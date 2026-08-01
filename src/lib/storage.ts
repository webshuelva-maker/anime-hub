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
  searchHistory: [],
  soundEnabled: true,
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

export function savePreferences(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
}

export function clearPreferences(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
