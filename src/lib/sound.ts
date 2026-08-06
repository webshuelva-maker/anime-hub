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

/* ===================== Sonidos de ambiente ===================== */

/**
 * Melodía de arranque, sobre la pantalla de carga.
 *
 * Cuatro notas de un acorde mayor séptima (Do–Mi–Sol–Si), entrando una
 * detrás de otra y solapándose, con el filtro muy cerrado y volúmenes
 * bajísimos. Es la diferencia entre una firma sonora y un jingle: no
 * llama la atención, se queda debajo.
 *
 * Sube y baja en volumen (la última nota es la más floja) para que se
 * perciba como algo que se aleja, y no como un anuncio de que algo ha
 * terminado.
 */
export function playArranque() {
  tone(261.63, 1.6, 0.05, "sine", 0, 900);
  tone(329.63, 1.5, 0.042, "sine", 0.16, 900);
  tone(392.0, 1.4, 0.034, "sine", 0.32, 900);
  tone(493.88, 1.8, 0.024, "sine", 0.52, 1100);
}

/**
 * Al terminar de cargar y aparecer el contenido. Dos notas muy suaves
 * que resuelven hacia arriba: cierra la melodía de arranque en vez de
 * quedarse colgada.
 */
export function playEntrada() {
  tone(523.25, 0.7, 0.035, "sine", 0, 1500);
  tone(659.25, 0.9, 0.022, "sine", 0.1, 1500);
}

/**
 * Cuando aparecen los resultados de una búsqueda. Una sola nota corta y
 * clara, apenas audible: acompaña a la animación de entrada para que el
 * cambio de pantalla se note también sin mirar.
 */
export function playResultados() {
  tone(587.33, 0.45, 0.03, "sine", 0, 1600);
}

/*
 * Ambiente de fondo: un acorde muy grave y muy flojo que respira.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ ESTÁ APAGADO POR DEFECTO
 *
 * Un sonido continuo es lo más fácil de convertir en molestia: quien
 * llega a una web y oye un zumbido que no ha pedido, lo primero que hace
 * es cerrarla o silenciar la pestaña. Además, muchos navegadores
 * bloquean el audio que empieza solo, y forzarlo es justo lo que activa
 * el icono de "esta página hace ruido".
 *
 * Así que existe, suena bien, y se enciende a mano. El interruptor de
 * sonido de Ajustes lo apaga como a todo lo demás.
 * ---------------------------------------------------------------------
 */
let ambiente: { osc: OscillatorNode[]; gain: GainNode } | null = null;

export function ambienteActivo(): boolean {
  return ambiente !== null;
}

export function pararAmbiente() {
  if (!ambiente) return;
  const audioCtx = getContext();
  const { osc, gain } = ambiente;
  ambiente = null;
  if (!audioCtx) return;
  // Se apaga en dos segundos, no de golpe: cortar un sonido continuo en
  // seco produce un chasquido bastante desagradable.
  gain.gain.cancelScheduledValues(audioCtx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2);
  osc.forEach((o) => o.stop(audioCtx.currentTime + 2.1));
}

export function arrancarAmbiente() {
  const audioCtx = getContext();
  if (!audioCtx || !isEnabled() || ambiente) return;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  // Entra en seis segundos: si apareciera de golpe se notaría, y todo el
  // sentido de un fondo es que no se note.
  gain.gain.linearRampToValueAtTime(0.02, audioCtx.currentTime + 6);

  const filtro = audioCtx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.value = 420;

  // Un movimiento lentísimo del filtro hace que el acorde "respire" en
  // vez de quedarse plano como un zumbido de nevera.
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 90;
  lfo.connect(lfoGain);
  lfoGain.connect(filtro.frequency);
  lfo.start();

  // Do y Sol graves, más una quinta por encima: sin tercera, para que no
  // suene ni alegre ni triste y no compita con nada.
  const osc = [130.81, 196.0, 261.63].map((f, i) => {
    const o = audioCtx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    // Desafinar unos céntimos entre sí ensancha el sonido.
    o.detune.value = i === 1 ? 4 : i === 2 ? -5 : 0;
    o.connect(filtro);
    o.start();
    return o;
  });
  osc.push(lfo);

  filtro.connect(gain);
  gain.connect(audioCtx.destination);

  ambiente = { osc, gain };
}
