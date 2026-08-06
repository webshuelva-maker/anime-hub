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

/*
 * Volumen del ambiente de fondo (acorde + melodía), aparte del
 * interruptor general de sonidos. Se guarda en memoria y no se relee de
 * localStorage en cada nota: así el control de Ajustes puede moverlo
 * mientras el ambiente ya está sonando y se oye al momento, sin esperar
 * a que se guarden las preferencias (que van con medio segundo de
 * retardo). Al cargar la página se coge una vez el valor guardado.
 */
let volumenMusicaCache: number | null = null;

function getVolumenMusica(): number {
  if (volumenMusicaCache !== null) return volumenMusicaCache;
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem("anime-hub:preferences");
    const parsed = raw ? JSON.parse(raw) : null;
    const valor = typeof parsed?.musicVolume === "number" ? parsed.musicVolume : 70;
    volumenMusicaCache = Math.min(1, Math.max(0, valor / 100));
    return volumenMusicaCache;
  } catch {
    return 1;
  }
}

/**
 * Cambia el volumen del ambiente al vuelo — lo llama el control de
 * Ajustes en cada movimiento, no solo cuando se guarda. Si el ambiente
 * ya está sonando, su ganancia se desliza hasta el nuevo nivel en vez de
 * saltar de golpe (un cambio brusco de volumen se nota como un clic).
 */
export function setVolumenMusica(porcentaje: number) {
  volumenMusicaCache = Math.min(1, Math.max(0, porcentaje / 100));
  if (!ambiente) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  const nivel = NIVEL_BASE_AMBIENTE * volumenMusicaCache;
  ambiente.gain.gain.cancelScheduledValues(audioCtx.currentTime);
  ambiente.gain.gain.setValueAtTime(ambiente.gain.gain.value, audioCtx.currentTime);
  ambiente.gain.gain.linearRampToValueAtTime(nivel, audioCtx.currentTime + 0.25);
}

/*
 * ---------------------------------------------------------------------
 * LA CAPA QUE FALTABA: EL ESPACIO
 *
 * Los sonidos de arranque sonaban caros y los de interacción no, aunque
 * estaban hechos con las mismas herramientas. La diferencia no era el
 * volumen ni el filtro: era que los de arranque duran uno o dos segundos
 * y les da tiempo a desarrollarse, mientras que un clic dura dos
 * décimas y se acaba antes de sonar a nada.
 *
 * Lo que iguala a los dos es la REVERBERACIÓN. Un sonido seco parece
 * salir del altavoz; el mismo sonido con una cola de reverberación
 * parece ocurrir en un sitio. Es exactamente lo que hace que un sonido
 * de interfaz se perciba como "de aplicación cara": no es la nota, es la
 * sala donde suena.
 *
 * No se descarga ningún archivo. La sala se fabrica aquí con ruido que
 * se apaga: es la forma clásica de simular una reverberación, y suena
 * bien de sobra para esto.
 *
 * Todo pasa por dos caminos: uno directo y otro a través de la sala. La
 * mezcla se elige por sonido — un clic quiere poca (tiene que ser
 * inmediato) y el aviso de Iris bastante más (tiene que sentirse
 * lejano).
 * ---------------------------------------------------------------------
 */
interface Buses {
  master: GainNode;
  sala: ConvolverNode;
}

let buses: Buses | null = null;

function crearImpulso(audioCtx: AudioContext, segundos: number, caida: number): AudioBuffer {
  const muestras = Math.floor(audioCtx.sampleRate * segundos);
  const buffer = audioCtx.createBuffer(2, muestras, audioCtx.sampleRate);

  for (let canal = 0; canal < 2; canal++) {
    const datos = buffer.getChannelData(canal);
    for (let i = 0; i < muestras; i++) {
      // Ruido que se apaga siguiendo una curva. Los dos canales llevan
      // ruido DISTINTO a propósito: es lo que hace que la cola suene
      // ancha en vez de pegada al centro de la cabeza.
      datos[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / muestras, caida);
    }
  }
  return buffer;
}

function getBuses(): Buses | null {
  const audioCtx = getContext();
  if (!audioCtx) return null;
  if (buses) return buses;

  const master = audioCtx.createGain();
  master.gain.value = 1;
  master.connect(audioCtx.destination);

  const sala = audioCtx.createConvolver();
  sala.buffer = crearImpulso(audioCtx, 2.2, 2.6);

  // La cola se filtra: una reverberación con agudos suena a lata. Al
  // recortarlos queda ese "aire" oscuro que no se oye pero se nota.
  const filtroSala = audioCtx.createBiquadFilter();
  filtroSala.type = "lowpass";
  filtroSala.frequency.value = 2600;

  const nivelSala = audioCtx.createGain();
  nivelSala.gain.value = 0.9;

  sala.connect(filtroSala);
  filtroSala.connect(nivelSala);
  nivelSala.connect(master);

  buses = { master, sala };
  return buses;
}

interface OpcionesTono {
  /** Cuánto se manda a la sala, de 0 a 1. */
  reverb?: number;
  /** Posición estéreo, de -1 a 1. */
  pan?: number;
  /** Desafinado en céntimos. Dos capas desafinadas suenan a instrumento. */
  detune?: number;
  /** Si se indica, la nota se desliza hasta esta frecuencia. */
  glideA?: number;
}

function tone(
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  delay = 0,
  /** Corta los agudos: es lo que separa un "bip" de una nota suave. */
  lowpass?: number,
  opciones: OpcionesTono = {}
) {
  const audioCtx = getContext();
  const b = getBuses();
  if (!audioCtx || !b || !isEnabled()) return;

  const { reverb = 0.3, pan = 0, detune = 0, glideA } = opciones;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;

  const start = audioCtx.currentTime + delay;

  // Deslizamiento de altura. Muy poco y muy rápido, pero es lo que
  // convierte una nota plana en algo que "se mueve".
  if (glideA) {
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(glideA, start + duration * 0.6);
  }

  // Ataque más lento (30ms en vez de 8ms): un sonido que "entra" en vez
  // de golpear. Es la diferencia entre una campanita cara y un pitido de
  // microondas, y era la queja con los sonidos de Ren.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);

  let salida: AudioNode = gain;

  if (lowpass) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    salida.connect(filter);
    salida = filter;
  }

  // Panorama. Aunque sea poquísimo, que cada sonido no salga del mismo
  // punto exacto ayuda a que no se perciban como pitidos de un aparato.
  if (pan !== 0 && typeof audioCtx.createStereoPanner === "function") {
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = pan;
    salida.connect(panner);
    salida = panner;
  }

  // Camino directo.
  const directo = audioCtx.createGain();
  directo.gain.value = 1 - reverb * 0.35;
  salida.connect(directo);
  directo.connect(b.master);

  // Camino a la sala.
  if (reverb > 0) {
    const envio = audioCtx.createGain();
    envio.gain.value = reverb;
    salida.connect(envio);
    envio.connect(b.sala);
  }

  osc.start(start);
  // Se deja sonar un poco más: la cola de la sala necesita que el
  // oscilador no se corte justo al acabar la nota.
  osc.stop(start + duration + 0.08);
}

/**
 * Un soplo de ruido filtrado. La otra mitad de lo que faltaba.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ NO BASTABA CON LA REVERBERACIÓN
 *
 * Añadirles sala los puso en un espacio, pero el material seguía siendo
 * el mismo: un oscilador, que es una onda perfecta y por eso suena a
 * aparato. En el mundo real ningún sonido es una onda pura — una tecla,
 * una tela, un roce, todos llevan algo de ruido, y es ese ruido lo que
 * el oído reconoce como "algo físico" en vez de "un pitido".
 *
 * Esto genera medio segundo de ruido y lo pasa por un filtro de banda,
 * que se queda con una franja estrecha de frecuencias. Mezclado por
 * debajo de una nota, deja de oírse como ruido y se convierte en el
 * cuerpo del sonido: es la diferencia entre un bip y un toque.
 * ---------------------------------------------------------------------
 */
function soplo(
  duracion: number,
  volumen: number,
  centro: number,
  opciones: { reverb?: number; pan?: number; delay?: number; q?: number } = {}
) {
  const audioCtx = getContext();
  const b = getBuses();
  if (!audioCtx || !b || !isEnabled()) return;

  const { reverb = 0.4, pan = 0, delay = 0, q = 1.4 } = opciones;

  const muestras = Math.max(1, Math.floor(audioCtx.sampleRate * duracion));
  const buffer = audioCtx.createBuffer(1, muestras, audioCtx.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i++) datos[i] = Math.random() * 2 - 1;

  const fuente = audioCtx.createBufferSource();
  fuente.buffer = buffer;

  const filtro = audioCtx.createBiquadFilter();
  filtro.type = "bandpass";
  filtro.frequency.value = centro;
  filtro.Q.value = q;

  const gain = audioCtx.createGain();
  const start = audioCtx.currentTime + delay;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volumen, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duracion);

  fuente.connect(filtro);
  filtro.connect(gain);

  let salida: AudioNode = gain;
  if (pan !== 0 && typeof audioCtx.createStereoPanner === "function") {
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner);
    salida = panner;
  }

  const directo = audioCtx.createGain();
  directo.gain.value = 1 - reverb * 0.35;
  salida.connect(directo);
  directo.connect(b.master);

  if (reverb > 0) {
    const envio = audioCtx.createGain();
    envio.gain.value = reverb;
    salida.connect(envio);
    envio.connect(b.sala);
  }

  fuente.start(start);
  fuente.stop(start + duracion + 0.05);
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
  // Poca sala: un clic tiene que sentirse inmediato. Lo que le da cuerpo
  // es la segunda capa desafinada, no la cola.
  tone(659.25, 0.24, 0.055, "sine", 0, 1700, { reverb: 0.18, pan: -0.05 });
  tone(659.25, 0.2, 0.018, "triangle", 0.005, 1500, { reverb: 0.18, detune: 7, pan: 0.05 });
  tone(987.77, 0.3, 0.016, "sine", 0.02, 2000, { reverb: 0.35 });
}

/** Confirmación — guardar, dar a "me gusta", completar una acción. */
export function playSuccess() {
  // Tercera mayor ascendente: se percibe como "hecho" sin necesidad de
  // subir el volumen. Ahora con sala, que es lo que hace que la última
  // nota no se corte en seco sino que se quede flotando.
  tone(587.33, 0.36, 0.05, "sine", 0, 1800, { reverb: 0.4, pan: -0.08 });
  tone(880.0, 0.46, 0.034, "sine", 0.07, 1800, { reverb: 0.5 });
  tone(1174.66, 0.6, 0.015, "sine", 0.12, 2200, { reverb: 0.65, pan: 0.1 });
}

/** Desplegar/plegar — acordeones, "ver más", abrir el chat de Ren. */
export function playToggle() {
  tone(493.88, 0.24, 0.045, "sine", 0, 1500, { reverb: 0.28 });
  tone(740.0, 0.26, 0.016, "sine", 0.025, 1600, { reverb: 0.4, detune: -6 });
}

/**
 * Aviso suave — errores de formulario, algo que no se ha podido hacer.
 *
 * Grave y muy filtrado a propósito: un error no debe sobresaltar. Dos
 * notas a distancia de segunda, que es lo que se percibe como "algo no
 * encaja" sin llegar a sonar a alarma.
 */
export function playError() {
  tone(207.65, 0.46, 0.055, "sine", 0, 700, { reverb: 0.3 });
  tone(233.08, 0.4, 0.028, "sine", 0.06, 700, { reverb: 0.35, detune: 5 });
}

/** Muy suave, casi subliminal — pasar el ratón por encima de algo interactivo. */
export function playHover() {
  /*
   * Ya no es una nota: es un ROCE.
   *
   * Era un tono puro cortísimo, y un tono puro es una onda perfecta que
   * el oído reconoce como aparato. Este suena decenas de veces al mover
   * el ratón, así que es justo donde más canta.
   *
   * Ahora es un soplo de ruido filtrado muy agudo, con una nota apenas
   * insinuada por debajo para que tenga altura. Se percibe como pasar el
   * dedo por una superficie, no como un pitido, y a este volumen casi no
   * se oye — se nota.
   */
  soplo(0.11, 0.016, 3200, { reverb: 0.5, q: 0.9 });
  tone(1318.5, 0.16, 0.006, "sine", 0.005, 2600, { reverb: 0.6, glideA: 1400 });
}

/**
 * Al mandarle un mensaje a Ren. Una sola nota grave, muy floja, filtrada
 * y con caída larga: se percibe como un "toc" de aire más que como un
 * aviso. Antes eran dos notas ascendentes bastante marcadas, que era
 * justo lo que sonaba a app gratuita.
 */
export function playSend() {
  // Sala corta y hacia la izquierda: el mensaje "sale" de ti.
  tone(392, 0.46, 0.045, "sine", 0, 1300, { reverb: 0.3, pan: -0.12 });
  // Una octava por debajo, apenas perceptible: da cuerpo, como la caja
  // de un instrumento.
  tone(196, 0.6, 0.02, "sine", 0.03, 700, { reverb: 0.35, pan: -0.12 });
}

/**
 * Cuando Ren responde. Dos notas a distancia de quinta, la segunda casi
 * inaudible, con filtro y caída larga — más cerca de una nota de arpa
 * que de una notificación.
 */
export function playReceive() {
  /*
   * Este es el que más se nota del cambio, y es el que más lo pedía:
   * llega solo, sin que hayas tocado nada, así que es el único sonido
   * que la app te "dice". Con mucha sala se percibe como algo que ocurre
   * en la habitación en vez de un aviso del sistema.
   *
   * Y cae a la derecha, al revés que el de enviar: tú a la izquierda,
   * Iris a la derecha. No se piensa, pero se nota.
   */
  tone(523.25, 0.55, 0.042, "sine", 0, 1600, { reverb: 0.55, pan: 0.14 });
  tone(784, 0.7, 0.026, "sine", 0.09, 1700, { reverb: 0.65, pan: 0.14, detune: -4 });
  // Tercera nota muy lejana y flojísima: hace que la respuesta "se
  // abra" en vez de terminar en seco.
  tone(1046.5, 0.95, 0.011, "sine", 0.2, 2200, { reverb: 0.8, pan: 0.2 });
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

/**
 * Volumen máximo del ambiente (con el control de Ajustes al 100%).
 * Con 0,013 el 100% del control sonaba casi igual que un 60-70%: para
 * que el máximo se sienta de verdad como un máximo hace falta más
 * recorrido. Subido a 0,019 — sigue siendo un fondo, no una canción.
 */
const NIVEL_BASE_AMBIENTE = 0.019;

export function arrancarAmbiente() {
  const audioCtx = getContext();
  if (!audioCtx || !isEnabled() || ambiente) return;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  // Entra en seis segundos: si apareciera de golpe se notaría, y todo el
  // sentido de un fondo es que no se note.
  gain.gain.linearRampToValueAtTime(NIVEL_BASE_AMBIENTE * getVolumenMusica(), audioCtx.currentTime + 6);

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

  // Se sigue programando la siguiente nota aunque el volumen esté a 0:
  // así, si se sube después, la melodía retoma el ritmo enseguida en vez
  // de quedarse parada hasta la próxima vez que se active el ambiente.
  const volumen = getVolumenMusica();
  if (volumen > 0) {
    const nota = PENTATONICA[Math.floor(Math.random() * PENTATONICA.length)];
    // Muy floja y muy filtrada: tiene que quedar por debajo de todo lo
    // demás, incluida cualquier otra pestaña con música.
    tone(nota, 2.6, 0.026 * volumen, "sine", 0, 2000);
    // Y a veces una quinta por encima, aún más floja, como un eco.
    if (Math.random() < 0.4) tone(nota * 1.5, 3.0, 0.013 * volumen, "sine", 0.6, 2000);
  }

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
  /*
   * Un acorde en miniatura, no dos notas sueltas.
   *
   * Es la versión corta de lo que hace el sonido de arranque, que es el
   * que sí le gustaba: notas que entran una detrás de otra y se quedan
   * sonando juntas. Tres notas de la misma escala, cada una un poco más
   * floja y más tardía que la anterior, y el soplo de aire delante
   * haciendo de "se abre algo".
   */
  soplo(0.22, 0.02, 1800, { reverb: 0.55, pan: -0.2 });
  tone(440, 0.7, 0.04, "sine", 0.02, 1400, { reverb: 0.5, pan: -0.18 });
  tone(659.25, 0.85, 0.026, "sine", 0.1, 1600, { reverb: 0.6, pan: 0.05 });
  tone(880, 1.0, 0.014, "sine", 0.19, 1900, { reverb: 0.75, pan: 0.2, detune: -4 });
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
  // El mismo acorde al revés y apagándose: se percibe como algo que se
  // recoge. La última nota baja de altura mientras suena, que es lo que
  // remata la sensación de cierre.
  tone(880, 0.4, 0.02, "sine", 0, 1900, { reverb: 0.5, pan: 0.2 });
  tone(659.25, 0.5, 0.028, "sine", 0.06, 1600, { reverb: 0.55 });
  tone(440, 0.9, 0.03, "sine", 0.13, 1200, { reverb: 0.65, pan: -0.18, glideA: 392 });
  soplo(0.3, 0.012, 900, { reverb: 0.6, delay: 0.1 });
}
