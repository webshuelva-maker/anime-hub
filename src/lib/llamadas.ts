"use client";

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Llamadas de voz entre coincidencias.
 *
 * ---------------------------------------------------------------------
 * CÓMO FUNCIONA, EN CORTO
 *
 * El audio NO pasa por ningún servidor: va directo de un navegador al
 * otro (WebRTC). Lo único que se manda por Supabase son los "papeles"
 * para que los dos navegadores se encuentren — quién quiere hablar con
 * quién y por qué dirección de red. Eso se llama señalización, y cabe de
 * sobra en el mismo sistema de canales que ya usa el chat.
 *
 * Consecuencia práctica: la conversación no la puede oír nadie más, ni
 * siquiera este proyecto. Y consecuencia de la consecuencia: NO QUEDA
 * CONSTANCIA. Si alguien acosa en una llamada, no hay nada que
 * moderación pueda revisar después. Por eso, y solo por eso, colgar y
 * bloquear van en el mismo sitio: cuando no se puede demostrar lo que ha
 * pasado, cortar tiene que ser inmediato.
 *
 * Cada usuario escucha en un canal propio, `llamadas-{su id}`, así que
 * se puede recibir una llamada estando en cualquier parte de la app y no
 * solo con el chat abierto.
 *
 * SOBRE LOS SERVIDORES: para encontrarse hacen falta servidores STUN,
 * que son gratuitos y los pone Google. En redes difíciles (algunas
 * móviles, oficinas con cortafuegos estrictos) eso no basta y hace falta
 * un TURN, que reenvía el audio y sí cuesta dinero. Se puede añadir uno
 * poniendo las variables de entorno de abajo, sin tocar código; sin él,
 * la mayoría de llamadas funcionan y unas pocas no llegarán a conectar.
 * ---------------------------------------------------------------------
 */

export type EstadoLlamada =
  | "inactiva"
  | "llamando" // yo he llamado y espero respuesta
  | "entrante" // me están llamando
  | "conectando" // aceptada, montando la conexión
  | "en-curso"
  | "terminada";

export interface InfoLlamada {
  estado: EstadoLlamada;
  /** Con quién. */
  otroId: string | null;
  otroAlias: string | null;
  otroAvatar: string | null;
  /** Segundos hablados, solo cuando está en curso. */
  segundos: number;
  /** Por qué terminó, para poder decirlo en pantalla. */
  motivoFin: string | null;
  /** Nivel de voz del otro, de 0 a 1, para las animaciones. */
  nivel: number;
  micApagado: boolean;
}

type Oyente = (info: InfoLlamada) => void;

const SERVIDORES: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

// Un TURN propio, si algún día se contrata. Sin esto, las redes más
// cerradas no consiguen conectar.
if (process.env.NEXT_PUBLIC_TURN_URL) {
  SERVIDORES.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USER,
    credential: process.env.NEXT_PUBLIC_TURN_PASS,
  });
}

/**
 * Cuánto se deja sonar antes de darla por no contestada.
 *
 * Subido de 35 a 50 segundos: ahora al otro le llega un aviso al
 * teléfono, y entre que lo nota, desbloquea y abre la app se van veinte
 * segundos largos. Si el timbre se corta antes, el aviso no sirve de
 * nada.
 */
const TIMBRE_MS = 50_000;

/**
 * Cada cuánto se vuelve a mandar la oferta mientras suena.
 *
 * ---------------------------------------------------------------------
 * ESTO ES LO QUE HACE QUE FUNCIONE CON LA APP CERRADA
 *
 * Los mensajes de un canal de Supabase no se guardan: si nadie está
 * escuchando cuando pasan, se pierden. Por eso hacía falta que la otra
 * persona estuviera dentro de la app EN EL INSTANTE exacto de la
 * llamada; si abría un segundo después, no había nada esperándole.
 *
 * La solución no es guardar la oferta en ningún sitio, sino repetirla:
 * mientras suena, se manda una y otra vez. Quien abra la app a media
 * llamada se pone a escuchar y en dos segundos y medio le llega la
 * siguiente repetición. Sin base de datos, sin estado que limpiar, y si
 * el que llama cuelga, las repeticiones paran solas.
 * ---------------------------------------------------------------------
 */
const REPETIR_OFERTA_MS = 2500;

/*
 * Cuánto se espera a que la conexión cuaje una vez aceptada.
 *
 * Antes no había tope: si los dos navegadores no conseguían encontrarse,
 * la pantalla se quedaba en "conectando" indefinidamente y la única
 * salida era colgar a mano sin saber si iba a funcionar en un segundo.
 * Veinte segundos es de sobra —lo normal es uno o dos— y así el fallo se
 * dice en vez de disimularse.
 */
const ESPERA_CONEXION_MS = 20_000;

let info: InfoLlamada = {
  estado: "inactiva",
  otroId: null,
  otroAlias: null,
  otroAvatar: null,
  segundos: 0,
  motivoFin: null,
  nivel: 0,
  micApagado: false,
};

const oyentes = new Set<Oyente>();
let pc: RTCPeerConnection | null = null;
let micro: MediaStream | null = null;
let audioRemoto: HTMLAudioElement | null = null;
let canalPropio: RealtimeChannel | null = null;
let miId: string | null = null;
let cronometro: ReturnType<typeof setInterval> | null = null;
let temporizadorTimbre: ReturnType<typeof setTimeout> | null = null;
let repetidorOferta: ReturnType<typeof setInterval> | null = null;
let medidor: ReturnType<typeof setInterval> | null = null;
let analizador: AnalyserNode | null = null;
let ctxAudio: AudioContext | null = null;
/*
 * Los candidatos de red pueden llegar ANTES que la descripción remota.
 * Añadirlos entonces revienta la conexión, así que se guardan y se
 * aplican en cuanto hay descripción. Es el fallo clásico de WebRTC y
 * pasa sobre todo en conexiones rápidas.
 */
let candidatosEnEspera: RTCIceCandidateInit[] = [];
let temporizadorConexion: ReturnType<typeof setTimeout> | null = null;
let vigilanteAudio: ReturnType<typeof setInterval> | null = null;

function cancelarEsperaDeConexion() {
  if (temporizadorConexion) {
    clearTimeout(temporizadorConexion);
    temporizadorConexion = null;
  }
}

function esperarConexion() {
  cancelarEsperaDeConexion();
  temporizadorConexion = setTimeout(() => {
    if (info.estado === "conectando" || info.estado === "llamando") {
      terminar("No se ha podido establecer la conexión");
    }
  }, ESPERA_CONEXION_MS);
}

function avisar() {
  for (const o of oyentes) o({ ...info });
}

function cambiar(cambios: Partial<InfoLlamada>) {
  info = { ...info, ...cambios };
  avisar();
}

export function escucharLlamada(o: Oyente): () => void {
  oyentes.add(o);
  o({ ...info });
  return () => oyentes.delete(o);
}

export function estadoLlamada(): InfoLlamada {
  return { ...info };
}

/* ------------------------------------------------------------------ */
/*  Señalización                                                      */
/* ------------------------------------------------------------------ */

type Señal =
  | { tipo: "oferta"; de: string; alias: string; avatar: string | null; sdp: RTCSessionDescriptionInit }
  | { tipo: "respuesta"; de: string; sdp: RTCSessionDescriptionInit }
  | { tipo: "candidato"; de: string; candidato: RTCIceCandidateInit }
  | { tipo: "colgar"; de: string; motivo: string }
  | { tipo: "rechazo"; de: string };

/*
 * ---------------------------------------------------------------------
 * POR QUÉ SE MANTIENE UN CANAL ABIERTO (arreglo del "conectando" eterno)
 *
 * La primera versión abría un canal de Supabase NUEVO por cada mensaje,
 * esperaba a que se suscribiera, mandaba y lo cerraba. Con la oferta y
 * la respuesta —que son dos mensajes sueltos— colaba. Con los candidatos
 * de red, no: WebRTC genera entre diez y treinta en los primeros
 * segundos, uno detrás de otro, y cada uno estaba abriendo y cerrando su
 * propia conexión.
 *
 * El resultado es exactamente lo que se veía: la oferta y la respuesta
 * llegaban (por eso la llamada pasaba a "conectando"), pero los
 * candidatos llegaban tarde, desordenados o no llegaban. Y sin
 * candidatos los dos navegadores no encuentran el camino, así que la
 * conexión se queda a medias para siempre.
 *
 * Ahora se abre UN canal hacia la otra persona al empezar la llamada y
 * se usa para todo hasta colgar. Lo que se genere antes de que el canal
 * esté listo se guarda en una cola y sale en cuanto lo esté, en orden.
 * ---------------------------------------------------------------------
 */
let canalSalida: RealtimeChannel | null = null;
let destinoSalida: string | null = null;
let canalListo = false;
let colaDeEnvio: Señal[] = [];

function abrirCanalSalida(aQuien: string) {
  if (canalSalida && destinoSalida === aQuien) return;
  cerrarCanalSalida();

  destinoSalida = aQuien;
  canalListo = false;

  const supabase = createClient();
  canalSalida = supabase.channel(`llamadas-${aQuien}`);
  canalSalida.subscribe((estado) => {
    if (estado !== "SUBSCRIBED") return;
    canalListo = true;
    const pendientes = colaDeEnvio;
    colaDeEnvio = [];
    for (const señal of pendientes) {
      void canalSalida?.send({ type: "broadcast", event: "señal", payload: señal });
    }
  });
}

function cerrarCanalSalida() {
  if (canalSalida) {
    void createClient().removeChannel(canalSalida);
  }
  canalSalida = null;
  destinoSalida = null;
  canalListo = false;
  colaDeEnvio = [];
}

async function enviarSeñal(aQuien: string, señal: Señal) {
  abrirCanalSalida(aQuien);

  if (!canalListo) {
    // Todavía no está suscrito: a la cola, que sale sola en cuanto lo
    // esté. Perder un candidato es perder un camino posible.
    colaDeEnvio.push(señal);
    return;
  }
  await canalSalida?.send({ type: "broadcast", event: "señal", payload: señal });
}

/**
 * Empieza a escuchar llamadas entrantes. Se llama una vez, al arrancar
 * la app con sesión iniciada.
 */
export function ponerseAlaEscucha(userId: string) {
  if (canalPropio && miId === userId) return;
  miId = userId;

  const supabase = createClient();
  canalPropio = supabase
    .channel(`llamadas-${userId}`)
    .on("broadcast", { event: "señal" }, ({ payload }) => {
      void manejarSeñal(payload as Señal);
    })
    .subscribe();
}

export function dejarDeEscuchar() {
  if (canalPropio) {
    void createClient().removeChannel(canalPropio);
    canalPropio = null;
  }
  miId = null;
}

async function manejarSeñal(s: Señal) {
  if (s.tipo === "oferta") {
    // La oferta llega repetida cada pocos segundos mientras suena. Si ya
    // se está atendiendo la de esa misma persona, se ignora en silencio:
    // volver a montar la conexión con cada repetición la rompería.
    if (info.otroId === s.de && info.estado !== "inactiva" && info.estado !== "terminada") {
      return;
    }
    // Si ya se está en otra llamada, se rechaza sin molestar.
    if (info.estado !== "inactiva" && info.estado !== "terminada") {
      void enviarSeñal(s.de, { tipo: "rechazo", de: miId! });
      return;
    }
    // Se abre ya el canal de vuelta: los candidatos empiezan a salir en
    // cuanto se prepara la conexión, y si el canal no está listo se
    // pierden.
    abrirCanalSalida(s.de);
    await prepararConexion(s.de);
    await pc!.setRemoteDescription(new RTCSessionDescription(s.sdp));
    await aplicarCandidatosEnEspera();
    cambiar({
      estado: "entrante",
      otroId: s.de,
      otroAlias: s.alias,
      otroAvatar: s.avatar,
      motivoFin: null,
    });
    return;
  }

  if (s.tipo === "respuesta" && pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(s.sdp));
    await aplicarCandidatosEnEspera();
    cambiar({ estado: "conectando" });
    esperarConexion();
    return;
  }

  if (s.tipo === "candidato") {
    if (pc?.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(s.candidato));
      } catch {
        // Un candidato suelto que no vale no rompe la llamada.
      }
    } else {
      candidatosEnEspera.push(s.candidato);
    }
    return;
  }

  if (s.tipo === "rechazo") {
    terminar("No ha podido contestar");
    return;
  }

  if (s.tipo === "colgar") {
    terminar(s.motivo || "Ha colgado");
  }
}

async function aplicarCandidatosEnEspera() {
  if (!pc) return;
  for (const c of candidatosEnEspera) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    } catch {
      // Igual que arriba.
    }
  }
  candidatosEnEspera = [];
}

/* ------------------------------------------------------------------ */
/*  Conexión                                                          */
/* ------------------------------------------------------------------ */

async function prepararConexion(otroId: string) {
  pc = new RTCPeerConnection({ iceServers: SERVIDORES });

  pc.onicecandidate = (e) => {
    if (e.candidate && miId) {
      void enviarSeñal(otroId, {
        tipo: "candidato",
        de: miId,
        candidato: e.candidate.toJSON(),
      });
    }
  };

  /*
   * ---------------------------------------------------------------------
   * POR QUÉ SE MIRA SI LLEGAN BYTES (arreglo de "uno dice conectando y el
   * otro va bien")
   *
   * Los avisos del navegador sobre el estado de la conexión son
   * orientativos y NO son simétricos: pasaba que los dos se oían
   * perfectamente pero en un lado el navegador nunca llegaba a decir
   * "connected", así que esa pantalla se quedaba en "conectando" para
   * siempre mientras la otra funcionaba.
   *
   * La única prueba que no admite discusión es que estén llegando datos
   * de audio. Eso se puede consultar directamente: si los bytes
   * recibidos suben, hay voz llegando, y punto. No depende de qué
   * navegador sea ni de cómo interprete los estados.
   * ---------------------------------------------------------------------
   */
  const vigilarAudio = () => {
    if (vigilanteAudio) return;
    let bytesAnteriores = 0;
    vigilanteAudio = setInterval(async () => {
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let bytes = 0;
        stats.forEach((informe) => {
          if (informe.type === "inbound-rtp" && informe.kind === "audio") {
            bytes += (informe as unknown as { bytesReceived?: number }).bytesReceived ?? 0;
          }
        });
        if (bytes > bytesAnteriores) {
          bytesAnteriores = bytes;
          cancelarEsperaDeConexion();
          arrancarCronometro();
          if (info.estado !== "en-curso") cambiar({ estado: "en-curso" });
        }
      } catch {
        // Si no se pueden leer las estadísticas, quedan los avisos del
        // navegador como antes.
      }
    }, 600);
  };

  pc.ontrack = (e) => {
    if (!audioRemoto) {
      audioRemoto = new Audio();
      audioRemoto.autoplay = true;
    }
    audioRemoto.srcObject = e.streams[0];
    void audioRemoto.play().catch(() => {});
    medirNivel(e.streams[0]);
    vigilarAudio();
  };

  /*
   * Se miran los DOS estados, el de la conexión y el del ICE.
   *
   * No todos los navegadores actualizan connectionState igual de pronto
   * —Safari y algunos Android se quedan cortos—, así que fiarlo todo a
   * uno deja llamadas que están sonando pero la pantalla sigue diciendo
   * "conectando".
   */
  pc.oniceconnectionstatechange = () => {
    if (!pc) return;
    const e = pc.iceConnectionState;
    if (e === "connected" || e === "completed") {
      cancelarEsperaDeConexion();
      arrancarCronometro();
      if (info.estado !== "en-curso") cambiar({ estado: "en-curso" });
    }
    if (e === "failed") terminar("No se ha podido establecer la conexión");
  };

  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === "connected") {
      cancelarEsperaDeConexion();
      arrancarCronometro();
      if (info.estado !== "en-curso") cambiar({ estado: "en-curso" });
    }
    if (pc.connectionState === "failed") {
      /*
       * Aquí se acaba casi siempre por lo mismo: una red que no deja
       * pasar la conexión directa y no hay servidor de reenvío. Se dice
       * en claro en vez de un "error", porque el usuario no ha hecho
       * nada mal y no puede arreglarlo reintentando desde el mismo sitio.
       */
      terminar("No se ha podido establecer la conexión");
    }
    if (pc.connectionState === "disconnected") {
      terminar("Se ha perdido la conexión");
    }
  };
}

async function pedirMicrofono(): Promise<boolean> {
  try {
    micro = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return true;
  } catch {
    terminar("No se ha podido usar el micrófono");
    return false;
  }
}

/** Mide la voz que llega, para que las animaciones respondan a ella. */
function medirNivel(stream: MediaStream) {
  try {
    ctxAudio = new AudioContext();
    const fuente = ctxAudio.createMediaStreamSource(stream);
    analizador = ctxAudio.createAnalyser();
    analizador.fftSize = 256;
    fuente.connect(analizador);

    const datos = new Uint8Array(analizador.frequencyBinCount);
    medidor = setInterval(() => {
      if (!analizador) return;
      analizador.getByteFrequencyData(datos);
      let suma = 0;
      for (const v of datos) suma += v;
      const media = suma / datos.length / 255;
      // Se suaviza: el nivel real da saltos y una animación siguiéndolo
      // al milímetro parece un fallo.
      cambiar({ nivel: info.nivel * 0.6 + media * 0.4 });
    }, 80);
  } catch {
    // Sin medidor la llamada funciona igual, solo con menos brillo.
  }
}

function arrancarCronometro() {
  if (cronometro) return;
  cronometro = setInterval(() => cambiar({ segundos: info.segundos + 1 }), 1000);
}

/* ------------------------------------------------------------------ */
/*  Acciones                                                          */
/* ------------------------------------------------------------------ */

export async function llamarA(otroId: string, alias: string, avatar: string | null) {
  if (!miId) return;
  cambiar({
    estado: "llamando",
    otroId,
    otroAlias: alias,
    otroAvatar: avatar,
    segundos: 0,
    motivoFin: null,
    micApagado: false,
  });

  if (!(await pedirMicrofono())) return;
  await prepararConexion(otroId);
  micro!.getTracks().forEach((t) => pc!.addTrack(t, micro!));

  const oferta = await pc!.createOffer();
  await pc!.setLocalDescription(oferta);
  const señalOferta: Señal = { tipo: "oferta", de: miId, alias, avatar, sdp: oferta };
  await enviarSeñal(otroId, señalOferta);

  // Se repite mientras suene, para que quien abra la app a media llamada
  // la encuentre esperándole.
  repetidorOferta = setInterval(() => {
    if (info.estado !== "llamando") return;
    void enviarSeñal(otroId, señalOferta);
  }, REPETIR_OFERTA_MS);

  /*
   * Y un golpecito en el hombro por el teléfono, para que se entere aunque
   * tenga la app cerrada. Si falla no pasa nada: la llamada sigue sonando
   * igual para quien sí la tenga abierta.
   */
  void fetch("/api/push/llamada", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aQuien: otroId, alias: alias }),
  }).catch(() => {});

  // Si no contesta, se corta sola: dejar sonando indefinidamente es de
  // las cosas que más incomodan de una app de llamadas.
  temporizadorTimbre = setTimeout(() => {
    if (info.estado === "llamando") {
      void enviarSeñal(otroId, { tipo: "colgar", de: miId!, motivo: "Sin respuesta" });
      terminar("No ha contestado");
    }
  }, TIMBRE_MS);
}

export async function aceptarLlamada() {
  if (!pc || !info.otroId || !miId) return;
  cambiar({ estado: "conectando" });
  esperarConexion();

  if (!(await pedirMicrofono())) return;
  micro!.getTracks().forEach((t) => pc!.addTrack(t, micro!));

  const respuesta = await pc.createAnswer();
  await pc.setLocalDescription(respuesta);
  await enviarSeñal(info.otroId, { tipo: "respuesta", de: miId, sdp: respuesta });
}

export function rechazarLlamada() {
  if (info.otroId && miId) {
    void enviarSeñal(info.otroId, { tipo: "rechazo", de: miId });
  }
  terminar(null);
}

export function colgar() {
  if (info.otroId && miId) {
    void enviarSeñal(info.otroId, { tipo: "colgar", de: miId, motivo: "Ha colgado" });
  }
  terminar(null);
}

export function alternarMicrofono(): boolean {
  if (!micro) return false;
  const nuevo = !info.micApagado;
  micro.getAudioTracks().forEach((t) => (t.enabled = !nuevo));
  cambiar({ micApagado: nuevo });
  return nuevo;
}

function terminar(motivo: string | null) {
  cancelarEsperaDeConexion();
  cerrarCanalSalida();
  if (vigilanteAudio) {
    clearInterval(vigilanteAudio);
    vigilanteAudio = null;
  }
  if (repetidorOferta) {
    clearInterval(repetidorOferta);
    repetidorOferta = null;
  }
  if (temporizadorTimbre) {
    clearTimeout(temporizadorTimbre);
    temporizadorTimbre = null;
  }
  if (cronometro) {
    clearInterval(cronometro);
    cronometro = null;
  }
  if (medidor) {
    clearInterval(medidor);
    medidor = null;
  }
  analizador = null;
  void ctxAudio?.close().catch(() => {});
  ctxAudio = null;

  micro?.getTracks().forEach((t) => t.stop());
  micro = null;

  if (audioRemoto) {
    audioRemoto.srcObject = null;
    audioRemoto = null;
  }

  pc?.close();
  pc = null;
  candidatosEnEspera = [];

  const habloAlgo = info.segundos > 0;
  cambiar({
    estado: habloAlgo || motivo ? "terminada" : "inactiva",
    motivoFin: motivo,
    nivel: 0,
    micApagado: false,
  });

  // La pantalla de "terminada" se queda un momento y luego desaparece.
  setTimeout(() => {
    if (info.estado === "terminada") {
      cambiar({ estado: "inactiva", otroId: null, otroAlias: null, otroAvatar: null, segundos: 0 });
    }
  }, 2600);
}

/** mm:ss */
export function duracionLlamada(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
