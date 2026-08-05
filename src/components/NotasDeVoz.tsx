"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MAX_NOTA_MS, duracionLegible, urlDeNotaDeVoz } from "@/lib/conectar";
import { playClick, playError, playToggle } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";

/**
 * Notas de voz: grabar, escucharte antes de enviar, y escuchar las que
 * te llegan.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ NOTAS Y NO LLAMADAS
 *
 * Se hablaron las dos. Las notas ganan por dos motivos que no son de
 * comodidad:
 *
 *  - DEJAN CONSTANCIA. Una llamada de voz no deja nada: si alguien acosa
 *    en una llamada, no hay forma de demostrarlo y moderación no puede
 *    hacer su trabajo. Una nota se queda en la conversación como se queda
 *    un mensaje de texto, y ante una denuncia se puede revisar.
 *  - No necesitan un servidor intermedio que reenvíe el audio en directo,
 *    que es la parte de las llamadas que cuesta dinero.
 *
 * Se graba con lo que trae el propio navegador, sin ninguna librería.
 * ---------------------------------------------------------------------
 */

const SUAVE = [0.22, 1, 0.36, 1] as const;

/* ================= Icono ================= */

/**
 * Micrófono dibujado, no el emoji 🎤.
 *
 * El emoji se ve distinto en cada sistema (en Windows es un micrófono de
 * karaoke de colores), no hereda el color del texto y no se puede animar
 * por partes. Dibujado encaja con el resto de iconos de la app y cambia
 * de color al pasar por encima como cualquier otro botón.
 */
export function IconoMicrofono({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

function IconoPapelera({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9.5 7V4.8h5V7" />
      <path d="M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </svg>
  );
}

function IconoPlay({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8.5 5.6a.9.9 0 0 1 1.36-.77l8 6.4a.9.9 0 0 1 0 1.54l-8 6.4A.9.9 0 0 1 8.5 18.4z" />
    </svg>
  );
}

function IconoPausa({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="7.5" y="5.5" width="3.6" height="13" rx="1.2" />
      <rect x="12.9" y="5.5" width="3.6" height="13" rx="1.2" />
    </svg>
  );
}

function IconoEnviar({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 19.5V5" />
      <path d="M5.5 11.5L12 5l6.5 6.5" />
    </svg>
  );
}

/* ================= Onda ================= */

/** Cuántas barras tiene la onda. Las mismas al grabar y al revisar. */
const BARRAS = 40;

/**
 * Reparte los niveles medidos en el número de barras que se pintan.
 *
 * La grabación mide diez veces por segundo, así que dos minutos son
 * 1.200 medidas para 40 barras. Se hace la media de cada tramo en vez de
 * quedarse con una suelta: si no, un chasquido en el momento justo
 * decidiría la altura de toda la barra.
 */
function repartirEnBarras(niveles: number[], barras = BARRAS): number[] {
  if (niveles.length === 0) return Array.from({ length: barras }, () => 0);
  const salida: number[] = [];
  const porBarra = niveles.length / barras;
  for (let i = 0; i < barras; i++) {
    const desde = Math.floor(i * porBarra);
    const hasta = Math.max(desde + 1, Math.floor((i + 1) * porBarra));
    let suma = 0;
    let cuenta = 0;
    for (let j = desde; j < hasta && j < niveles.length; j++) {
      suma += niveles[j];
      cuenta++;
    }
    salida.push(cuenta > 0 ? suma / cuenta : 0);
  }

  /*
   * Se estira para que la barra más alta llegue arriba del todo.
   *
   * Una voz normal a medio metro del micrófono se mueve por valores
   * bajos, y al hacer la media de cada tramo bajan todavía más. Sin
   * esto, una nota perfectamente audible se veía como una línea casi
   * plana y parecía que la onda no funcionaba. El tope mínimo evita que
   * una nota grabada en silencio se convierta en un montón de ruido
   * amplificado.
   */
  const maximo = Math.max(0.12, ...salida);
  return salida.map((n) => Math.min(1, n / maximo));
}

/* ================= Grabar ================= */

type Fase = "grabando" | "revisando";

export function GrabadorDeVoz({
  onListo,
  onCancelar,
}: {
  onListo: (audio: Blob, duracionMs: number) => void;
  onCancelar: () => void;
}) {
  const [fase, setFase] = useState<Fase>("grabando");
  const [ms, setMs] = useState(0);
  const [fallo, setFallo] = useState<string | null>(null);
  /** Niveles de volumen medidos, diez por segundo. */
  const [niveles, setNiveles] = useState<number[]>([]);

  // Lo grabado, ya listo para escuchar o enviar.
  const [grabado, setGrabado] = useState<{ blob: Blob; url: string; ms: number } | null>(null);

  const nivelesRef = useRef<number[]>([]);
  const trozosRef = useRef<BlobPart[]>([]);
  const inicioRef = useRef(0);
  const pararRef = useRef<((guardar: boolean) => void) | null>(null);

  useEffect(() => {
    let vivo = true;
    let intervalo: ReturnType<typeof setInterval> | null = null;
    let pista: MediaStream | null = null;
    let contexto: AudioContext | null = null;

    (async () => {
      try {
        pista = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // El navegador no distingue "ha dicho que no" de "no hay
        // micrófono", así que el aviso cubre las dos.
        if (vivo) {
          playError();
          setFallo("No se ha podido usar el micrófono. Revisa el permiso en el navegador.");
        }
        return;
      }
      if (!vivo) {
        pista.getTracks().forEach((t) => t.stop());
        return;
      }

      const grabadora = new MediaRecorder(pista);
      trozosRef.current = [];
      nivelesRef.current = [];
      inicioRef.current = Date.now();

      /*
       * Medidor de volumen real.
       *
       * Antes las barras se movían solas con una animación fija: daba
       * igual lo que dijeras, hacían siempre lo mismo. Y eso se nota —
       * parece un adorno, no una grabadora. Ahora se lee el nivel real
       * del micrófono diez veces por segundo, que es barato, y la onda
       * responde a tu voz. De paso sirve de comprobación: si hablas y no
       * se mueve nada, es que el micrófono no está cogiendo sonido.
       */
      let leerNivel: () => number = () => 0;
      try {
        const CtxAudio =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (CtxAudio) {
          contexto = new CtxAudio();
          const fuente = contexto.createMediaStreamSource(pista);
          const analizador = contexto.createAnalyser();
          analizador.fftSize = 512;
          fuente.connect(analizador);
          const muestras = new Uint8Array(analizador.fftSize);
          leerNivel = () => {
            analizador.getByteTimeDomainData(muestras);
            // Media cuadrática: la distancia media al silencio (128).
            let suma = 0;
            for (let i = 0; i < muestras.length; i++) {
              const d = (muestras[i] - 128) / 128;
              suma += d * d;
            }
            const rms = Math.sqrt(suma / muestras.length);
            // Se estira porque una voz normal se mueve por valores bajos
            // y sin esto la onda casi no subiría.
            return Math.min(1, rms * 3.2);
          };
        }
      } catch {
        // Sin medidor, la onda se queda plana pero todo lo demás graba
        // igual. No merece cancelar la grabación por esto.
      }

      grabadora.ondataavailable = (e) => {
        if (e.data.size > 0) trozosRef.current.push(e.data);
      };

      pararRef.current = (guardar: boolean) => {
        const duracion = Date.now() - inicioRef.current;
        /*
         * Se para el medidor ANTES que nada.
         *
         * Este era el motivo de que la onda saliera plana al revisar: el
         * cronómetro seguía corriendo después de parar la grabación, y
         * como el micrófono ya estaba cerrado medía silencio. Cada 100 ms
         * volvía a escribir la onda con ceros y borraba la forma real que
         * se acababa de calcular. La onda buena estaba bien hecha, duraba
         * una décima de segundo.
         */
        if (intervalo) {
          clearInterval(intervalo);
          intervalo = null;
        }

        grabadora.onstop = () => {
          pista?.getTracks().forEach((t) => t.stop());
          void contexto?.close().catch(() => {});
          if (!guardar) return onCancelar();
          const blob = new Blob(trozosRef.current, { type: grabadora.mimeType || "audio/webm" });
          // Menos de un segundo casi siempre es un toque sin querer.
          if (duracion < 800 || blob.size === 0) return onCancelar();
          // No se envía todavía: se pasa a revisar, para poder
          // escucharla antes de mandarla.
          setGrabado({ blob, url: URL.createObjectURL(blob), ms: duracion });
          setNiveles(repartirEnBarras(nivelesRef.current));
          setFase("revisando");
          vibrar(8);
        };
        if (grabadora.state !== "inactive") grabadora.stop();
        else pista?.getTracks().forEach((t) => t.stop());
      };

      grabadora.start();
      vibrar(10);

      intervalo = setInterval(() => {
        const t = Date.now() - inicioRef.current;
        nivelesRef.current.push(leerNivel());
        setMs(t);
        // Solo se pintan las últimas: la onda avanza hacia la izquierda
        // como una cinta en vez de comprimirse cada vez más.
        setNiveles(nivelesRef.current.slice(-BARRAS));
        // Al llegar al tope se corta sola y se conserva lo grabado, que
        // es mejor que perderlo por pasarse.
        if (t >= MAX_NOTA_MS) pararRef.current?.(true);
      }, 100);
    })();

    return () => {
      vivo = false;
      if (intervalo) clearInterval(intervalo);
      pista?.getTracks().forEach((t) => t.stop());
      void contexto?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El enlace temporal del audio hay que soltarlo, o se queda en memoria
  // toda la sesión aunque la nota se haya descartado.
  useEffect(() => {
    return () => {
      if (grabado) URL.revokeObjectURL(grabado.url);
    };
  }, [grabado]);

  if (fallo) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-2xl border border-rumor/40 bg-rumor/5 px-4 py-3"
      >
        <p className="flex-1 text-xs leading-snug text-foreground/90">{fallo}</p>
        <button
          type="button"
          onClick={onCancelar}
          className="pulsable shrink-0 rounded-full border border-panel-border px-3 py-1.5 text-xs text-muted"
        >
          Cerrar
        </button>
      </motion.div>
    );
  }

  if (fase === "revisando" && grabado) {
    return (
      <RevisarNota
        url={grabado.url}
        duracionMs={grabado.ms}
        niveles={niveles}
        onDescartar={() => {
          playToggle();
          onCancelar();
        }}
        onEnviar={() => {
          playClick();
          onListo(grabado.blob, grabado.ms);
        }}
      />
    );
  }

  const restante = MAX_NOTA_MS - ms;

  /*
   * La onda siempre tiene el mismo número de barras.
   *
   * Al principio hay menos medidas que barras, así que se rellena por
   * delante con silencio. Si no, las pocas barras iniciales se repartían
   * todo el ancho y luego se iban encogiendo según llegaban más: la onda
   * "respiraba" de forma rarísima durante los primeros segundos.
   */
  const ondaEnVivo = [
    ...Array.from({ length: Math.max(0, BARRAS - niveles.length) }, () => 0),
    ...niveles.slice(-BARRAS),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: SUAVE }}
      className="flex items-center gap-3 rounded-2xl border border-rumor/30 bg-panel-soft/60 px-3 py-2.5"
    >
      {/* Punto rojo latiendo: la señal universal de "esto está grabando". */}
      <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
        <motion.span
          className="absolute h-full w-full rounded-full"
          style={{ background: "var(--rumor)" }}
          animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="h-full w-full rounded-full" style={{ background: "var(--rumor)" }} />
      </span>

      <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
        {duracionLegible(ms)}
      </span>

      {/* La onda real de tu voz, no una animación decorativa.
          Se escala en vertical (transform) en vez de cambiar la altura:
          animar la altura de cuarenta barras obliga al navegador a
          recalcular la maquetación en cada fotograma, y eso es justo lo
          que se veía lento y a tirones. El escalado lo lleva la tarjeta
          gráfica y va suelto. */}
      <span className="flex h-6 flex-1 items-center gap-[3px] overflow-hidden">
        {ondaEnVivo.map((n, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 rounded-full"
            style={{
              height: 22,
              background: i >= ondaEnVivo.length - 4 ? "var(--rumor)" : "var(--ice)",
              opacity: 0.35 + (i / ondaEnVivo.length) * 0.65,
              transform: `scaleY(${Math.max(0.09, Math.min(1, n))})`,
              transformOrigin: "center",
              transition: "transform 110ms linear, background-color 200ms linear",
              willChange: "transform",
            }}
          />
        ))}
      </span>

      {restante < 20_000 && (
        <span className="shrink-0 text-[11px] text-rumor">
          quedan {Math.ceil(restante / 1000)} s
        </span>
      )}

      <button
        type="button"
        onClick={() => {
          playToggle();
          pararRef.current?.(false);
        }}
        aria-label="Descartar la grabación"
        title="Descartar"
        className="pulsable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
      >
        <IconoPapelera className="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        onClick={() => {
          playToggle();
          pararRef.current?.(true);
        }}
        className="pulsable shrink-0 rounded-full border border-ice/35 px-4 py-1.5 text-xs font-semibold text-foreground"
      >
        Parar
      </button>
    </motion.div>
  );
}

/* ================= Revisar antes de enviar ================= */

function RevisarNota({
  url,
  duracionMs,
  niveles,
  onDescartar,
  onEnviar,
}: {
  url: string;
  duracionMs: number;
  niveles: number[];
  onDescartar: () => void;
  onEnviar: () => void;
}) {
  const [sonando, setSonando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audio.onended = () => {
      setSonando(false);
      setProgreso(0);
    };
    audio.ontimeupdate = () => {
      /*
       * La duración se toma de lo que midió el cronómetro al grabar y no
       * de audio.duration: en los audios de MediaRecorder, Chrome dice
       * que la duración es Infinity hasta que el archivo se recorre
       * entero, y con eso la barra no avanzaría.
       */
      const total = duracionMs / 1000;
      if (total > 0) setProgreso(Math.min(1, audio.currentTime / total));
    };
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [url, duracionMs]);

  const alternar = () => {
    const audio = audioRef.current;
    if (!audio) return;
    playToggle();
    if (sonando) {
      audio.pause();
      setSonando(false);
    } else {
      void audio.play();
      setSonando(true);
    }
  };

  const barras = niveles.length > 0 ? niveles : Array.from({ length: BARRAS }, () => 0.2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: SUAVE }}
      className="flex items-center gap-3 rounded-2xl border border-ice/30 bg-panel-soft/60 px-3 py-2.5"
    >
      <button
        type="button"
        onClick={alternar}
        aria-label={sonando ? "Pausar" : "Escuchar antes de enviar"}
        className="accent-gradient pulsable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
      >
        {sonando ? <IconoPausa className="h-4 w-4" /> : <IconoPlay className="h-4 w-4" />}
      </button>

      <span className="flex h-6 flex-1 items-center gap-[3px] overflow-hidden">
        {barras.map((n, i) => {
          const alcanzada = i / barras.length <= progreso;
          return (
            <span
              key={i}
              className="min-w-0 flex-1 rounded-full"
              style={{
                height: 22,
                background: alcanzada ? "var(--ice)" : "var(--panel-border)",
                transform: `scaleY(${Math.max(0.09, Math.min(1, n))})`,
                transformOrigin: "center",
                transition: "background-color 140ms linear",
              }}
            />
          );
        })}
      </span>

      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
        {duracionLegible(sonando || progreso > 0 ? progreso * duracionMs : duracionMs)}
      </span>

      <button
        type="button"
        onClick={onDescartar}
        aria-label="Descartar la nota"
        title="Descartar"
        className="pulsable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
      >
        <IconoPapelera className="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        onClick={onEnviar}
        aria-label="Enviar la nota de voz"
        className="accent-gradient pulsable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
      >
        <IconoEnviar className="h-[18px] w-[18px]" />
      </button>
    </motion.div>
  );
}

/* ================= Escuchar ================= */

/** Velocidades que se van turnando al pulsar. */
const VELOCIDADES = [1, 1.5, 2] as const;

export function NotaDeVoz({
  ruta,
  duracionMs,
  mio,
}: {
  ruta: string;
  duracionMs: number | null;
  mio: boolean;
}) {
  const [sonando, setSonando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [velocidad, setVelocidad] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  /** Prepara el audio la primera vez que hace falta. */
  const prepararAudio = useCallback(async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current) return audioRef.current;
    // El enlace se pide al pulsar y no al pintar la conversación: con
    // veinte notas en el hilo serían veinte firmas para audios que a lo
    // mejor no se escuchan.
    setCargando(true);
    const url = await urlDeNotaDeVoz(ruta);
    setCargando(false);
    if (!url) {
      playError();
      return null;
    }
    const audio = new Audio(url);
    audio.playbackRate = velocidad;
    audio.onended = () => {
      setSonando(false);
      setProgreso(0);
    };
    audio.ontimeupdate = () => {
      // Igual que al revisar: la duración guardada es de fiar, la que
      // dice el navegador no siempre.
      const total = duracionMs ? duracionMs / 1000 : audio.duration;
      if (total && Number.isFinite(total)) {
        setProgreso(Math.min(1, audio.currentTime / total));
      }
    };
    audioRef.current = audio;
    return audio;
  }, [ruta, duracionMs, velocidad]);

  const alternar = async () => {
    if (audioRef.current && sonando) {
      audioRef.current.pause();
      setSonando(false);
      return;
    }
    const audio = await prepararAudio();
    if (!audio) return;
    void audio.play();
    setSonando(true);
  };

  /** Saltar a un punto pulsando sobre la onda. */
  const saltarA = async (e: React.MouseEvent<HTMLDivElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const proporcion = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
    const audio = await prepararAudio();
    if (!audio) return;
    const total = duracionMs ? duracionMs / 1000 : audio.duration;
    if (total && Number.isFinite(total)) {
      audio.currentTime = proporcion * total;
      setProgreso(proporcion);
    }
  };

  const cambiarVelocidad = () => {
    const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(velocidad as 1) + 1) % VELOCIDADES.length];
    setVelocidad(siguiente);
    if (audioRef.current) audioRef.current.playbackRate = siguiente;
    playToggle();
  };

  const transcurrido = duracionMs ? progreso * duracionMs : 0;

  return (
    <div
      className={`mt-1 flex w-full max-w-xs items-center gap-2.5 rounded-2xl border px-3 py-2.5 ${
        mio ? "border-ice/30" : "border-panel-border"
      }`}
      style={{ background: "color-mix(in srgb, var(--panel-soft) 60%, transparent)" }}
    >
      <button
        type="button"
        onClick={alternar}
        aria-label={sonando ? "Pausar la nota" : "Escuchar la nota"}
        className="accent-gradient pulsable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
      >
        <AnimatePresence mode="wait" initial={false}>
          {cargando ? (
            <motion.span
              key="cargando"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
              style={{ animation: "spin 0.7s linear infinite" }}
            />
          ) : sonando ? (
            <motion.span
              key="pausa"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.14 }}
            >
              <IconoPausa className="h-4 w-4" />
            </motion.span>
          ) : (
            <motion.span
              key="play"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.14 }}
            >
              <IconoPlay className="h-4 w-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Se puede pulsar en cualquier punto para saltar ahí: en una nota
          de dos minutos, tener que oírla entera para volver a un detalle
          es justo lo que hace que las notas cansen. */}
      <div
        onClick={saltarA}
        role="slider"
        aria-label="Punto de la nota"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progreso * 100)}
        tabIndex={0}
        className="flex h-7 flex-1 cursor-pointer items-center gap-[2px]"
      >
        {Array.from({ length: 26 }).map((_, i) => {
          // Alturas fijas por posición: la misma nota se ve siempre igual
          // en vez de cambiar de forma en cada dibujado.
          const alto = (5 + ((i * 13) % 15)) / 20;
          const alcanzada = i / 26 <= progreso;
          // La barra que se está reproduciendo ahora mismo da un saltito,
          // así se ve de un vistazo por dónde va.
          const activa = sonando && Math.floor(progreso * 26) === i;
          return (
            <span
              key={i}
              className="min-w-0 flex-1 rounded-full"
              style={{
                height: 20,
                background: alcanzada ? "var(--ice)" : "var(--panel-border)",
                transform: `scaleY(${Math.min(1, activa ? alto * 1.35 : alto)})`,
                transformOrigin: "center",
                // Corto y lineal: con una curva suave y 26 barras, el
                // saltito de la barra activa se arrastraba por detrás del
                // sonido y parecía que iba a destiempo.
                transition: "transform 90ms linear, background-color 120ms linear",
              }}
            />
          );
        })}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-mono text-[11px] tabular-nums text-muted">
          {duracionMs ? duracionLegible(progreso > 0 ? transcurrido : duracionMs) : "--:--"}
        </span>
        <button
          type="button"
          onClick={cambiarVelocidad}
          aria-label="Cambiar la velocidad"
          className="pulsable rounded-full px-1.5 text-[10px] font-semibold text-muted hover:text-foreground"
        >
          {velocidad}×
        </button>
      </div>
    </div>
  );
}
