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

function tone(
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  delay = 0,
  /** Corta los agudos: es lo que separa un "bip" de una nota suave. */
  lowpass?: number
) {
  const audioCtx = getContext();
  if (!audioCtx || !isEnabled()) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const start = audioCtx.currentTime + delay;
  // Ataque más lento (30ms en vez de 8ms): un sonido que "entra" en vez
  // de golpear. Es la diferencia entre una campanita cara y un pitido de
  // microondas, y era la queja con los sonidos de Ren.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);

  if (lowpass) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    gain.connect(filter);
    filter.connect(audioCtx.destination);
  } else {
    gain.connect(audioCtx.destination);
  }

  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Clic normal — botones, cambiar de pestaña, seleccionar chips. */
export function playClick() {
  tone(720, 0.08, 0.2);
}

/** Confirmación — guardar, dar a "me gusta", completar una acción. */
export function playSuccess() {
  tone(600, 0.11, 0.2);
  tone(900, 0.15, 0.18, "sine", 0.05);
}

/** Desplegar/plegar — acordeones, "ver más", abrir el chat de Ren. */
export function playToggle() {
  tone(500, 0.07, 0.17);
}

/** Aviso suave — errores de formulario, algo que no se ha podido hacer. */
export function playError() {
  tone(220, 0.14, 0.18, "triangle");
}

/** Muy suave, casi subliminal — pasar el ratón por encima de algo interactivo. */
export function playHover() {
  tone(1100, 0.035, 0.035);
}

/**
 * Al mandarle un mensaje a Ren. Una sola nota grave, muy floja, filtrada
 * y con caída larga: se percibe como un "toc" de aire más que como un
 * aviso. Antes eran dos notas ascendentes bastante marcadas, que era
 * justo lo que sonaba a app gratuita.
 */
export function playSend() {
  tone(392, 0.32, 0.055, "sine", 0, 1400);
}

/**
 * Cuando Ren responde. Dos notas a distancia de quinta, la segunda casi
 * inaudible, con filtro y caída larga — más cerca de una nota de arpa
 * que de una notificación.
 */
export function playReceive() {
  tone(523.25, 0.4, 0.05, "sine", 0, 1600);
  tone(784, 0.5, 0.03, "sine", 0.09, 1600);
}
