// Memoria a largo plazo de Ren — vive en localStorage (por navegador,
// no hay backend real todavía), así que se recuerda entre sesiones EN
// ESTE MISMO dispositivo/navegador, pero no si el usuario entra desde
// otro. Guarda tanto hechos sobre el usuario como preferencias de trato
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

export function addRenMemory(fact: string): void {
  if (typeof window === "undefined" || !fact.trim()) return;
  const current = getRenMemory();
  // Evita duplicados casi idénticos sin ser demasiado estricto.
  const normalized = fact.trim().toLowerCase();
  if (current.some((m) => m.trim().toLowerCase() === normalized)) return;
  const next = [...current, fact.trim()].slice(-MAX_MEMORIES);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearRenMemory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
