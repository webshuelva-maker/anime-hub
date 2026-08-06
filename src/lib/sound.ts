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
/*
 * ---------------------------------------------------------------------
 * SOBRE EL ACABADO DE ESTOS SONIDOS
 *
 * Los de aquí abajo eran los primeros que se hicieron, y se notaba al
 * lado de los de ambiente: notas cortas, a bastante volumen y SIN
 * filtrar. Un tono sin filtrar deja pasar todos sus agudos, y eso es
 * exactamente lo que separa un "bip" de electrodoméstico de una nota
 * suave. Encima sonaban al triple de volumen que el resto, así que
 * pegaban un respingo en medio de un fondo tranquilo.
 *
 * Lo que se ha hecho con todos, sin cambiar cuándo suenan:
 *  - Filtro de agudos, para quitarles el filo.
 *  - Volumen bajado a un tercio: se oyen, no se imponen.
 *  - Caída más larga, para que se apaguen en vez de cortarse.
 *  - Una segunda nota por encima, mucho más floja, a distancia de
 *    quinta o de octava. Es lo que da sensación de instrumento en vez de
 *    generador de tonos, y cuesta una línea.
 * ---------------------------------------------------------------------
 */

/** Clic normal — botones, cambiar de pestaña, seleccionar chips. */
export function playClick() {
  tone(659.25, 0.22, 0.06, "sine", 0, 1700);
  tone(987.77, 0.18, 0.022, "sine", 0.02, 1700);
}

/** Confirmación — guardar, dar a "me gusta", completar una acción. */
export function playSuccess() {
  // Tercera mayor ascendente: se percibe como "hecho" sin necesidad de
  // subir el volumen.
  tone(587.33, 0.34, 0.055, "sine", 0, 1800);
  tone(880.0, 0.42, 0.038, "sine", 0.07, 1800);
  tone(1174.66, 0.36, 0.016, "sine", 0.12, 2000);
}

/** Desplegar/plegar — acordeones, "ver más", abrir el chat de Ren. */
export function playToggle() {
  tone(493.88, 0.2, 0.05, "sine", 0, 1500);
  tone(740.0, 0.16, 0.018, "sine", 0.025, 1500);
}

/**
 * Aviso suave — errores de formulario, algo que no se ha podido hacer.
 *
 * Grave y muy filtrado a propósito: un error no debe sobresaltar. Dos
 * notas a distancia de segunda, que es lo que se percibe como "algo no
 * encaja" sin llegar a sonar a alarma.
 */
export function playError() {
  tone(207.65, 0.4, 0.06, "sine", 0, 700);
  tone(233.08, 0.34, 0.03, "sine", 0.06, 700);
}

/** Muy suave, casi subliminal — pasar el ratón por encima de algo interactivo. */
export function playHover() {
  // Casi inaudible y muy filtrado: se dispara decenas de veces al mover
  // el ratón, así que cualquier cosa con filo se vuelve insoportable a
  // los diez segundos.
  tone(1046.5, 0.09, 0.018, "sine", 0, 2200);
}

/**
 * Al mandarle un mensaje a Ren. Una sola nota grave, muy floja, filtrada
 * y con caída larga: se percibe como un "toc" de aire más que como un
 * aviso. Antes eran dos notas ascendentes bastante marcadas, que era
 * justo lo que sonaba a app gratuita.
 */
export function playSend() {
  tone(392, 0.42, 0.05, "sine", 0, 1300);
  // Una octava por debajo, apenas perceptible: da cuerpo, como la caja
  // de un instrumento.
  tone(196, 0.5, 0.022, "sine", 0.03, 700);
}

/**
 * Cuando Ren responde. Dos notas a distancia de quinta, la segunda casi
 * inaudible, con filtro y caída larga — más cerca de una nota de arpa
 * que de una notificación.
 */
export function playReceive() {
  tone(523.25, 0.5, 0.048, "sine", 0, 1600);
  tone(784, 0.62, 0.028, "sine", 0.09, 1600);
  // Tercera nota muy lejana y flojísima: hace que la respuesta "se
  // abra" en vez de terminar en seco.
  tone(1046.5, 0.7, 0.012, "sine", 0.2, 2000);
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

/**
 * Melodía de fondo: notas sueltas sobre el acorde de ambiente.
 *
 * El ambiente solo es un acorde sostenido; esto le pone encima una nota
 * de vez en cuando, para que haya algo que seguir sin que llegue a ser
 * una canción. Las notas salen de una escala pentatónica, que es la que
 * no tiene intervalos ásperos: cualquier orden suena bien, así que no
 * hace falta componer nada y nunca se repite igual.
 *
 * Los huecos entre notas son largos y desiguales (de 4 a 11 segundos) a
 * propósito. Un patrón regular se convierte en un tictac y acaba
 * cansando; uno irregular se percibe como algo vivo de fondo.
 */
const PENTATONICA = [523.25, 587.33, 698.46, 783.99, 880.0, 1046.5];
let melodia: ReturnType<typeof setTimeout> | null = null;

function siguienteNota() {
  if (!isEnabled()) return pararMelodia();

  const nota = PENTATONICA[Math.floor(Math.random() * PENTATONICA.length)];
  // Muy floja y muy filtrada: tiene que quedar por debajo de todo lo
  // demás, incluida cualquier otra pestaña con música.
  tone(nota, 2.6, 0.018, "sine", 0, 2000);
  // Y a veces una quinta por encima, aún más floja, como un eco.
  if (Math.random() < 0.4) tone(nota * 1.5, 3.0, 0.009, "sine", 0.6, 2000);

  melodia = setTimeout(siguienteNota, 4000 + Math.random() * 7000);
}

export function arrancarMelodia() {
  if (melodia || !isEnabled()) return;
  melodia = setTimeout(siguienteNota, 3000);
}

export function pararMelodia() {
  if (melodia) clearTimeout(melodia);
  melodia = null;
}

/**
 * Enciende el fondo sonoro entero (acorde + melodía) en cuanto la
 * persona toca algo por primera vez.
 *
 * Se espera a ese primer gesto porque los navegadores bloquean el audio
 * que arranca solo, y forzarlo es lo que hace que salga el icono de
 * "esta pestaña hace ruido". Con esperar al primer clic o tecla, arranca
 * sin pelearse con nadie.
 *
 * Devuelve una función para desengancharlo.
 */
export function fondoAlPrimerGesto(): () => void {
  if (typeof window === "undefined") return () => {};

  const arrancar = () => {
    quitar();
    if (!isEnabled()) return;
    arrancarAmbiente();
    arrancarMelodia();
  };

  const quitar = () => {
    window.removeEventListener("pointerdown", arrancar);
    window.removeEventListener("keydown", arrancar);
  };

  window.addEventListener("pointerdown", arrancar, { once: true });
  window.addEventListener("keydown", arrancar, { once: true });
  return quitar;
}

/** Apaga el fondo entero. */
export function pararFondo() {
  pararMelodia();
  pararAmbiente();
}

/**
 * Abrir a Iris. Dos notas ascendentes, muy suaves: la interfaz "se
 * despliega" también al oído.
 */
export function playAbrirAsistente() {
  tone(440, 0.34, 0.05, "sine", 0, 1500);
  tone(659.25, 0.46, 0.032, "sine", 0.07, 1600);
}

/**
 * Cerrar a Iris. Las mismas dos notas, al revés y algo más flojas.
 *
 * Abrir y cerrar sonaban IGUAL (los dos usaban el sonido de desplegar),
 * y eso es una ocasión perdida: invertir el orden de las notas es la
 * forma más barata de que algo se perciba como "se guarda" en vez de
 * "se abre", sin que nadie tenga que pensarlo.
 */
export function playCerrarAsistente() {
  tone(659.25, 0.3, 0.04, "sine", 0, 1600);
  tone(440, 0.44, 0.028, "sine", 0.07, 1400);
}
