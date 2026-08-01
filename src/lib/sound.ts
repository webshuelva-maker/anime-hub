// Sonidos de interfaz — generados con Web Audio (osciladores + envolvente
// de volumen), no archivos de audio de por medio, así que no hay que
// preocuparse de licencias ni de peso descargado. Se pueden desactivar
// del todo desde Ajustes (prefs.soundEnabled).
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  // Los navegadores exigen un gesto del usuario para arrancar el audio —
  // como esto siempre se llama desde un click/tap, ya vale, pero por si
  // el contexto se había quedado "suspended" se reactiva aquí.
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("anime-hub:preferences");
    if (!raw) return true; // por defecto activado
    const parsed = JSON.parse(raw);
    return parsed.soundEnabled !== false;
  } catch {
    return true;
  }
}

function tone(freq: number, duration: number, volume: number, type: OscillatorType = "sine", delay = 0) {
  const audioCtx = getContext();
  if (!audioCtx || !isEnabled()) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const start = audioCtx.currentTime + delay;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Clic suave — botones normales, cambiar de pestaña. */
export function playClick() {
  tone(720, 0.06, 0.05);
}

/** Confirmación — guardar, dar a "me gusta", completar una acción. */
export function playSuccess() {
  tone(600, 0.09, 0.05);
  tone(900, 0.12, 0.045, "sine", 0.05);
}

/** Desplegar/plegar — acordeones, "ver más", abrir el chat de Ren. */
export function playToggle() {
  tone(500, 0.05, 0.04);
}

/** Aviso suave — errores de formulario, algo que no se ha podido hacer. */
export function playError() {
  tone(220, 0.12, 0.045, "triangle");
}
