// Memoria a largo plazo de Ren. Vive en localStorage y, desde v91, se
// sincroniza además con Supabase cuando hay sesión iniciada, así que te
// sigue del móvil al ordenador. Sin cuenta funciona igual que siempre,
// solo que en ese navegador. Guarda tanto hechos sobre el usuario como preferencias de trato
// ("háblame de tú", "sé más breve", "no me hagas bromas") — Ren decide
// qué merece la pena recordar y lo etiqueta con [[ACTION:remember:...]]
// en su respuesta (ver assistantActions.ts), y luego esa lista se le
// vuelve a inyectar en el contexto en cada conversación futura.
const STORAGE_KEY = "anime-hub:ren-memory";
const MAX_MEMORIES = 40; // no hace falta un historial infinito en el prompt

export function getRenMemory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Escribe la lista tal cual, sin subirla. La usa la sincronización al bajar. */
export function setRenMemoryLocal(memories: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memories.slice(-MAX_MEMORIES)));
}

function syncUp(): void {
  void import("./cloudSync").then((m) => m.scheduleCloudPush());
}

export function addRenMemory(fact: string): void {
  if (typeof window === "undefined" || !fact.trim()) return;
  const current = getRenMemory();
  // Evita duplicados casi idénticos sin ser demasiado estricto.
  const normalized = fact.trim().toLowerCase();
  if (current.some((m) => m.trim().toLowerCase() === normalized)) return;
  const next = [...current, fact.trim()].slice(-MAX_MEMORIES);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  syncUp();
}

/** Borra un recuerdo concreto (desde la lista de Ajustes). */
export function removeRenMemory(fact: string): void {
  if (typeof window === "undefined") return;
  const next = getRenMemory().filter((m) => m !== fact);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  syncUp();
}

export function clearRenMemory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  syncUp();
}
