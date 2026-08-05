"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
/*
 * Más barras y más finas.
 *
 * Con 40 barras a lo ancho de la burbuja, cada una salía gruesa y la
 * onda parecía un ecualizador de reproductor de música. Las apps de
 * mensajería usan muchas más y muy delgadas: se lee como una forma de
 * onda continua, no como bloques sueltos. Es lo que le daba ese aire de
 * "gamer" en vez de discreto.
 */
const BARRAS = 64;

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

/**
 * Forma de onda estable para una nota que ya está enviada.
 *
 * De las notas recibidas no guardamos el volumen real (habría que
 * descargar y decodificar el audio entero solo para dibujar), así que se
 * genera a partir del identificador de la nota: la misma nota se ve
 * siempre igual, y dos notas distintas se ven distintas.
 *
 * Se suaviza haciendo media con las barras vecinas y se le pone un sobre
 * que baja en los extremos. Sin eso salían picos sueltos y disparejos,
 * que es lo que daba ese aire de ecualizador de videojuego; una voz real
 * sube y baja de forma continua.
 */
function formaDeOnda(semilla: string, barras: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  const crudo: number[] = [];
  for (let i = 0; i < barras; i++) {
    h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff;
    crudo.push((h % 1000) / 1000);
  }

  // Media móvil con los vecinos: convierte el ruido en algo que ondula.
  const suave = crudo.map((_, i) => {
    const a = crudo[Math.max(0, i - 1)];
    const b = crudo[i];
    const c = crudo[Math.min(crudo.length - 1, i + 1)];
    return (a + b * 2 + c) / 4;
  });

  return suave.map((n, i) => {
    // Sobre: los extremos algo más bajos, como el arranque y el final de
    // una frase hablada.
    const p = i / (barras - 1);
    const sobre = 0.55 + 0.45 * Math.sin(Math.PI * p);
    return Math.min(1, Math.max(0.16, n * sobre + 0.12));
  });
}

/**
 * La onda, dibujada.
 *
 * Se pinta DOS veces, una encima de otra: abajo la versión apagada y
 * encima la de color, recortada por la izquierda según lo que lleves
 * escuchado. Ese recorte es continuo, así que el avance es fluido de
 * verdad.
 *
 * Antes se coloreaba barra a barra según el progreso, y eso solo puede
 * avanzar de barra en barra: se veía dar saltos, como a cachitos. Y como
 * el navegador solo avisa del tiempo cuatro veces por segundo, el salto
 * era todavía más evidente.
 */
function Onda({
  niveles,
  capaRef,
  className = "",
}: {
  niveles: number[];
  /** Referencia a la capa de color, para moverla sin pasar por React. */
  capaRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const barras = (color: string, opacidad: number) => (
    <div className="absolute inset-0 flex items-center gap-[1.5px]">
      {niveles.map((n, i) => (
        <span
          key={i}
          className="min-w-0 flex-1 rounded-full"
          style={{
            height: "100%",
            background: color,
            opacity: opacidad,
            // Suelo un poco más alto (0,22): las barras de las pausas se
            // ven como una línea fina continua en vez de desaparecer,
            // que es lo que hace que se lea como una onda y no como
            // dientes sueltos.
            transform: `scaleY(${Math.max(0.22, Math.min(1, n))})`,
            transformOrigin: "center",
          }}
        />
      ))}
    </div>
  );

  return (
    <div className={`relative h-5 w-full ${className}`}>
      {barras("var(--muted)", 0.3)}
      <div ref={capaRef} className="absolute inset-0" style={{ clipPath: "inset(0 100% 0 0)" }}>
        {/* Lo ya escuchado: platino en vez de azul hielo saturado, que
            es lo que daba el aire de aplicación de videojuegos. */}
        {barras("var(--platinum)", 0.92)}
      </div>
    </div>
  );
}

/**
 * Mueve la onda escribiendo el recorte DIRECTAMENTE en el elemento.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ NO SE HACE CON ESTADO DE REACT (tercer intento, y el bueno)
 *
 * Los dos arreglos anteriores fueron por el camino equivocado: primero
 * quitar una transición CSS, después dejar de fiarse de currentTime.
 * Ninguno era la causa.
 *
 * La causa es el COSTE. La onda son 64 barras dibujadas dos veces: 128
 * elementos. Guardando el avance en estado de React, cada fotograma
 * obligaba a recalcular y volver a escribir esos 128 elementos, sesenta
 * veces por segundo. En un equipo holgado se disimula; en uno justo, el
 * navegador no llega y se salta casi todos los repintados — así que la
 * onda se quedaba quieta mientras sonaba y solo se ponía al día al
 * pausar, que es cuando cesa la presión y da tiempo a pintar. Exactamente
 * lo que se veía.
 *
 * Escribiendo el recorte a mano sobre el elemento, React no interviene:
 * no hay recálculo ni comparación de 128 elementos, solo una propiedad
 * que cambia. Eso el navegador lo hace en la tarjeta gráfica y le sobra
 * tiempo hasta en el equipo más justo.
 * ---------------------------------------------------------------------
 */
function pintarProgreso(capa: HTMLDivElement | null, progreso: number) {
  if (!capa) return;
  const recorte = `inset(0 ${Math.max(0, 100 - progreso * 100)}% 0 0)`;
  capa.style.clipPath = recorte;
  capa.style.setProperty("-webkit-clip-path", recorte);
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

            /*
             * Escala en decibelios, NO lineal.
             *
             * Antes era `rms * 3.2`. El problema: hablando normal, un
             * micrófono de móvil da valores de 0,02 a 0,08 — multiplicado
             * por 3,2 se queda entre 0,06 y 0,26, o sea barras casi
             * planas. Para llegar al máximo había que dar un valor de
             * 0,31, que es literalmente gritar. Ese era el motivo de
             * tener que levantar la voz para que la onda se moviera.
             *
             * El oído percibe el volumen en escala logarítmica, y así es
             * como lo miden las apps de mensajería. Con este mapeo, una
             * voz normal (unos -30 dB) llena algo más de la mitad de la
             * barra y un susurro ya se nota.
             */
            const db = 20 * Math.log10(Math.max(rms, 1e-6));
            const SILENCIO_DB = -55; // por debajo, barra al mínimo
            const FUERTE_DB = -12; // a partir de aquí, barra llena
            const nivel = (db - SILENCIO_DB) / (FUERTE_DB - SILENCIO_DB);
            return Math.max(0, Math.min(1, nivel));
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
          gráfica y va suelto.

          Todas del mismo color: antes las últimas barras iban en ámbar
          para señalar "esto es lo que entra ahora", pero con el punto
          rojo de grabación al lado ya se entiende, y esa mancha amarilla
          a la derecha era lo que le daba el aire de ecualizador. El
          degradado de opacidad hacia la izquierda basta para dar la
          sensación de cinta que avanza. */}
      {/* Mismas medidas que la onda de reproducción (h-5, barras finas y
          platino) para que grabar y escuchar se vean como lo mismo: dos
          estilos distintos en la misma burbuja es lo que hacía que
          cantara. */}
      <span className="flex h-5 flex-1 items-center gap-[1.5px] overflow-hidden">
        {ondaEnVivo.map((n, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 rounded-full"
            style={{
              height: "100%",
              background: "var(--platinum)",
              opacity: 0.28 + (i / ondaEnVivo.length) * 0.62,
              transform: `scaleY(${Math.max(0.22, Math.min(1, n))})`,
              transformOrigin: "center",
              transition: "transform 110ms linear",
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
  // Espejo del progreso para poder leerlo dentro del bucle sin
  // reiniciarlo en cada fotograma.
  const progresoRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const capaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audio.onended = () => {
      setSonando(false);
      setProgreso(0);
      progresoRef.current = 0;
      pintarProgreso(capaRef.current, 0);
    };
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [url]);

  // Igual que en el reproductor de las notas recibidas: el reloj se lee
  // en cada fotograma para que la barra avance de forma continua y no a
  // cuatro saltos por segundo.
  useEffect(() => {
    if (!sonando) return;
    let cuadro = 0;

    /*
     * La duración se toma de lo que midió el cronómetro al grabar y no de
     * audio.duration: en los audios de MediaRecorder el navegador dice
     * que la duración es Infinity hasta recorrer el archivo entero.
     *
     * Y el AVANCE no se fía solo de audio.currentTime. En los audios
     * grabados con MediaRecorder (sin metadatos de duración) hay
     * navegadores que dejan currentTime clavado en 0 aunque el sonido se
     * esté oyendo: por eso la barra no se movía y parecía arreglarse al
     * pausar y volver a dar, que era lo único que la empujaba un poco.
     *
     * Así que se lleva también un reloj propio desde que se pulsa play.
     * Si currentTime avanza, manda él (es el dato exacto); si no se
     * mueve, tira el reloj. En los dos casos la barra avanza.
     */
    const total = duracionMs / 1000;
    const inicio = performance.now();
    const desde = progresoRef.current * total * 1000;
    let currentTimeSirve = false;

    // El contador de tiempo sí pasa por React, pero como mucho cinco
    // veces por segundo: es texto, y a nadie le hace falta ver las
    // centésimas.
    let ultimoTexto = 0;

    const paso = () => {
      const audio = audioRef.current;
      if (audio && total > 0) {
        if (audio.currentTime > 0.15) currentTimeSirve = true;
        const segundos = currentTimeSirve
          ? audio.currentTime
          : (desde + (performance.now() - inicio)) / 1000;
        const p = Math.min(1, segundos / total);
        progresoRef.current = p;
        // La onda, a mano y en cada fotograma.
        pintarProgreso(capaRef.current, p);
        const ahora = performance.now();
        if (ahora - ultimoTexto > 200) {
          ultimoTexto = ahora;
          setProgreso(p);
        }
      }
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [sonando, duracionMs]);

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

      <span className="flex h-6 flex-1 items-center overflow-hidden">
        <Onda niveles={barras} capaRef={capaRef} />
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
  // Espejo del progreso, para poder leerlo dentro del bucle sin
  // reiniciarlo en cada fotograma.
  const progresoRef = useRef(0);
  const [cargando, setCargando] = useState(false);
  const [velocidad, setVelocidad] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const capaRef = useRef<HTMLDivElement | null>(null);

  /*
   * El progreso se lee en cada fotograma, no con el aviso "timeupdate"
   * del navegador.
   *
   * Ese aviso llega unas cuatro veces por segundo, así que la barra daba
   * cuatro saltos por segundo: eso era lo de avanzar a cachitos. Leyendo
   * el reloj del audio en cada fotograma se mueve de forma continua, y
   * cuesta lo mismo que cualquier animación. El bucle solo existe
   * mientras suena; en cuanto se pausa, se corta.
   */
  useEffect(() => {
    if (!sonando) return;
    let cuadro = 0;

    /*
     * Igual que en el reproductor del borrador: no basta con leer
     * audio.currentTime. En los audios grabados con MediaRecorder hay
     * navegadores que lo dejan clavado en 0 aunque el sonido se oiga, y
     * entonces la barra no se movía. Se lleva un reloj propio de
     * respaldo: si currentTime avanza manda él, y si no, el reloj.
     */
    const inicio = performance.now();
    const desde = progresoRef.current;
    let currentTimeSirve = false;

    let ultimoTexto = 0;

    const paso = () => {
      const audio = audioRef.current;
      if (audio) {
        // La duración guardada es de fiar; la que dice el navegador para
        // los audios de MediaRecorder no siempre lo es.
        const total = duracionMs ? duracionMs / 1000 : audio.duration;
        if (total && Number.isFinite(total)) {
          if (audio.currentTime > 0.15) currentTimeSirve = true;
          const segundos = currentTimeSirve
            ? audio.currentTime
            : desde * total + (performance.now() - inicio) / 1000;
          const p = Math.min(1, segundos / total);
          progresoRef.current = p;
          pintarProgreso(capaRef.current, p);
          const ahora = performance.now();
          if (ahora - ultimoTexto > 200) {
            ultimoTexto = ahora;
            setProgreso(p);
          }
        }
      }
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [sonando, duracionMs]);

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
      progresoRef.current = 0;
      pintarProgreso(capaRef.current, 0);
    };
    audioRef.current = audio;
    return audio;
  }, [ruta, velocidad]);

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
      progresoRef.current = proporcion;
      pintarProgreso(capaRef.current, proporcion);
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

  // La forma se calcula una vez por nota y no cambia entre dibujados.
  const onda = useMemo(() => formaDeOnda(ruta, 34), [ruta]);

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
        className="relative flex h-7 flex-1 cursor-pointer items-center"
      >
        <Onda niveles={onda} capaRef={capaRef} />
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
