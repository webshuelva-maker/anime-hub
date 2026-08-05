"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MAX_NOTA_MS, duracionLegible, urlDeNotaDeVoz } from "@/lib/conectar";
import { playClick, playError, playToggle } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";

/**
 * Notas de voz: grabar y escuchar.
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

/* ================= Grabar ================= */

export function GrabadorDeVoz({
  onListo,
  onCancelar,
}: {
  onListo: (audio: Blob, duracionMs: number) => void;
  onCancelar: () => void;
}) {
  const [ms, setMs] = useState(0);
  const [fallo, setFallo] = useState<string | null>(null);
  const grabadoraRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<BlobPart[]>([]);
  const inicioRef = useRef(0);
  const pararRef = useRef<((enviar: boolean) => void) | null>(null);

  useEffect(() => {
    let vivo = true;
    let intervalo: ReturnType<typeof setInterval> | null = null;
    let pista: MediaStream | null = null;

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
      grabadoraRef.current = grabadora;
      trozosRef.current = [];
      inicioRef.current = Date.now();

      grabadora.ondataavailable = (e) => {
        if (e.data.size > 0) trozosRef.current.push(e.data);
      };

      pararRef.current = (enviar: boolean) => {
        const duracion = Date.now() - inicioRef.current;
        grabadora.onstop = () => {
          pista?.getTracks().forEach((t) => t.stop());
          if (!enviar) return onCancelar();
          const audio = new Blob(trozosRef.current, { type: grabadora.mimeType || "audio/webm" });
          // Menos de un segundo casi siempre es un toque sin querer.
          if (duracion < 800 || audio.size === 0) return onCancelar();
          onListo(audio, duracion);
        };
        if (grabadora.state !== "inactive") grabadora.stop();
        else pista?.getTracks().forEach((t) => t.stop());
      };

      grabadora.start();
      vibrar(10);

      intervalo = setInterval(() => {
        const t = Date.now() - inicioRef.current;
        setMs(t);
        // Al llegar al tope se corta sola y se envía lo grabado, que es
        // mejor que perderlo por pasarse.
        if (t >= MAX_NOTA_MS) pararRef.current?.(true);
      }, 100);
    })();

    return () => {
      vivo = false;
      if (intervalo) clearInterval(intervalo);
      if (grabadoraRef.current?.state === "recording") grabadoraRef.current.stop();
      pista?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fallo) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-rumor/40 bg-rumor/5 px-4 py-3">
        <p className="flex-1 text-xs leading-snug text-foreground/90">{fallo}</p>
        <button
          type="button"
          onClick={onCancelar}
          className="pulsable shrink-0 rounded-full border border-panel-border px-3 py-1.5 text-xs text-muted"
        >
          Cerrar
        </button>
      </div>
    );
  }

  const restante = MAX_NOTA_MS - ms;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-panel-border bg-panel-soft/60 px-3 py-2.5">
      <motion.span
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: "var(--rumor)" }}
      />

      <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
        {duracionLegible(ms)}
      </span>

      {/* Barras que se mueven mientras grabas. No representan el volumen
          real: leer el nivel del micrófono en cada fotograma es trabajo
          continuo por un adorno, y lo único que hace falta comunicar es
          "esto está grabando". */}
      <span className="flex flex-1 items-center gap-[3px] overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-muted"
            animate={{ height: [6, 6 + ((i * 7) % 16), 6] }}
            transition={{
              duration: 0.9 + (i % 4) * 0.15,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.04,
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
        className="pulsable shrink-0 rounded-full px-3 py-1.5 text-xs text-muted hover:text-foreground"
      >
        Descartar
      </button>
      <button
        type="button"
        onClick={() => {
          playClick();
          pararRef.current?.(true);
        }}
        className="accent-gradient pulsable shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold text-white"
      >
        Enviar
      </button>
    </div>
  );
}

/* ================= Escuchar ================= */

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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const alternar = async () => {
    if (audioRef.current && sonando) {
      audioRef.current.pause();
      setSonando(false);
      return;
    }

    if (!audioRef.current) {
      // El enlace se pide al pulsar y no al pintar la conversación: con
      // veinte notas en el hilo serían veinte firmas para audios que a lo
      // mejor no se escuchan.
      setCargando(true);
      const url = await urlDeNotaDeVoz(ruta);
      setCargando(false);
      if (!url) {
        playError();
        return;
      }
      const audio = new Audio(url);
      audio.onended = () => {
        setSonando(false);
        setProgreso(0);
      };
      audio.ontimeupdate = () => {
        if (audio.duration) setProgreso(audio.currentTime / audio.duration);
      };
      audioRef.current = audio;
    }

    void audioRef.current.play();
    setSonando(true);
  };

  return (
    <div
      className={`mt-1 flex w-full max-w-xs items-center gap-3 rounded-2xl border px-3 py-2.5 ${
        mio ? "border-ice/30" : "border-panel-border"
      }`}
      style={{ background: "color-mix(in srgb, var(--panel-soft) 60%, transparent)" }}
    >
      <button
        type="button"
        onClick={alternar}
        aria-label={sonando ? "Pausar la nota" : "Escuchar la nota"}
        className="accent-gradient pulsable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm text-white"
      >
        {cargando ? "…" : sonando ? "❚❚" : "▶"}
      </button>

      <span className="flex flex-1 items-center gap-[3px]">
        {Array.from({ length: 22 }).map((_, i) => {
          // Alturas fijas por posición: la misma nota se ve siempre igual
          // en vez de cambiar de forma en cada dibujado.
          const alto = 5 + ((i * 13) % 15);
          const alcanzada = i / 22 <= progreso;
          return (
            <span
              key={i}
              className="w-[3px] rounded-full transition-colors duration-150"
              style={{
                height: alto,
                background: alcanzada ? "var(--ice)" : "var(--panel-border)",
              }}
            />
          );
        })}
      </span>

      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
        {duracionMs ? duracionLegible(duracionMs) : "--:--"}
      </span>
    </div>
  );
}
