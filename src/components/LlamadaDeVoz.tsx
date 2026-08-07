"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "./AvatarPicker";
import {
  InfoLlamada,
  aceptarLlamada,
  alternarMicrofono,
  colgar,
  duracionLlamada,
  escucharLlamada,
  estadoLlamada,
  ponerseAlaEscucha,
  rechazarLlamada,
} from "@/lib/llamadas";
import { createClient } from "@/lib/supabase/client";
import { playError, playToggle } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";

/**
 * La llamada, en pantalla.
 *
 * Va montada en el layout, no dentro del chat, por un motivo concreto:
 * una llamada tiene que poder entrar estés donde estés en la app. Si
 * solo escuchara el chat abierto, llamar a alguien que está mirando las
 * noticias no serviría de nada.
 *
 * Se dibuja colgada del <body> con un portal, igual que el chat, porque
 * `position: fixed` deja de referirse a la ventana en cuanto un
 * antepasado tiene transform — y framer-motion lo pone en todo lo que
 * anima.
 */

const SUAVE = [0.16, 1, 0.3, 1] as const;

export function LlamadaDeVoz() {
  const [info, setInfo] = useState<InfoLlamada>(estadoLlamada());

  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => escucharLlamada(setInfo), []);

  // Ponerse a la escucha en cuanto haya sesión.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    let vivo = true;
    (async () => {
      const { data } = await createClient().auth.getUser();
      if (data.user && vivo) ponerseAlaEscucha(data.user.id);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Un toque al entrar una llamada: puede pasar con la app en segundo
  // plano y sin sonido, y la vibración es lo único que se nota.
  useEffect(() => {
    if (info.estado === "entrante") vibrar([18, 90, 18, 90, 18]);
    if (info.estado === "terminada" && info.motivoFin) playError();
  }, [info.estado, info.motivoFin]);

  /*
   * ---------------------------------------------------------------------
   * POR QUÉ NO SE SALE ANTES DE TIEMPO (arreglo de la salida sin animar)
   *
   * Aquí había un "if (inactiva) return null" justo antes de dibujar. Y
   * eso, aunque parezca inofensivo, se carga la animación de salida:
   * AnimatePresence solo puede acompañar a un elemento mientras se va si
   * SIGUE MONTADO durante la despedida. Devolviendo null se quita todo de
   * golpe —el AnimatePresence incluido— y no queda nadie para animar
   * nada. De ahí lo que se veía: "Pepe ha colgado" entraba con su
   * animación y luego desaparecía de un tirón.
   *
   * Ahora el componente se queda siempre montado y es AnimatePresence
   * quien decide, con la condición dentro. Cuesta un elemento vacío en el
   * documento y a cambio la pantalla se va como llegó.
   * ---------------------------------------------------------------------
   */
  if (!enNavegador) return null;

  const visible = info.estado !== "inactiva";
  const entrante = info.estado === "entrante";
  const hablando = info.estado === "en-curso";
  const terminada = info.estado === "terminada";

  const titulo = entrante
    ? "Te está llamando"
    : info.estado === "llamando"
    ? "Llamando…"
    : info.estado === "conectando"
    ? "Conectando…"
    : terminada
    ? info.motivoFin ?? "Llamada terminada"
    : duracionLlamada(info.segundos);

  return createPortal(
    <AnimatePresence>
      {visible && (
      <motion.div
        key="llamada"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3 } }}
        /*
         * La salida es más larga que la entrada a propósito: una llamada
         * que se cierra de golpe se siente como un corte, y aquí acaba de
         * pasar algo —te han colgado— que merece un momento de respiro.
         * Se aleja un pelín mientras se va, como si se apartara.
         */
        exit={{
          opacity: 0,
          scale: 1.02,
          transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
        }}
        className="fixed inset-0 z-[95] flex flex-col items-center justify-center px-6"
        style={{ background: "color-mix(in srgb, var(--background) 97%, transparent)" }}
      >
        {/* Un resplandor detrás que respira con la voz que llega. Es el
            único elemento que se mueve, y solo se mueve cuando la otra
            persona habla: es lo que hace que la pantalla se sienta viva
            sin ponerse a decorar. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute h-[28rem] w-[28rem] rounded-full"
          style={{
            background: "radial-gradient(circle, var(--ice) 0%, transparent 68%)",
            filter: "blur(20px)",
          }}
          animate={{
            opacity: hablando ? 0.1 + info.nivel * 0.28 : 0.07,
            scale: hablando ? 1 + info.nivel * 0.16 : 1,
          }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />

        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: SUAVE }}
          className="relative flex flex-col items-center"
        >
          {/* Anillos que salen del avatar mientras suena el timbre. */}
          <div className="relative">
            {(entrante || info.estado === "llamando") &&
              [0, 1].map((i) => (
                <motion.span
                  key={i}
                  className="absolute inset-0 rounded-full border border-ice/40"
                  animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    delay: i * 1.1,
                    ease: "easeOut",
                  }}
                />
              ))}
            <div className="relative">
              <Avatar avatarId={info.otroAvatar ?? ""} size="xl" rounded="full" />
            </div>
          </div>

          <h2 className="mt-6 font-heading text-2xl font-bold">{info.otroAlias ?? "Llamada"}</h2>

          <AnimatePresence mode="wait">
            <motion.p
              key={titulo}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className={`mt-1.5 text-sm tabular-nums ${
                hablando ? "ice-text" : terminada && info.motivoFin ? "text-rumor" : "text-muted"
              }`}
            >
              {titulo}
            </motion.p>
          </AnimatePresence>

          {info.micApagado && hablando && (
            <p className="mt-1 text-[11px] text-rumor">Tienes el micrófono apagado</p>
          )}
        </motion.div>

        {/* Botones */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease: SUAVE }}
          className="relative mt-12 flex items-center gap-5"
        >
          {entrante ? (
            <>
              <BotonRedondo
                etiqueta="Rechazar"
                color="var(--rumor)"
                onClick={() => {
                  playToggle();
                  rechazarLlamada();
                }}
              >
                <IconoColgar />
              </BotonRedondo>
              <BotonRedondo
                etiqueta="Contestar"
                color="var(--ice)"
                destacado
                onClick={() => {
                  playToggle();
                  void aceptarLlamada();
                }}
              >
                <IconoTelefono />
              </BotonRedondo>
            </>
          ) : terminada ? null : (
            <>
              <BotonRedondo
                etiqueta={info.micApagado ? "Activar micrófono" : "Silenciar"}
                color={info.micApagado ? "var(--rumor)" : "var(--muted)"}
                onClick={() => {
                  playToggle();
                  alternarMicrofono();
                }}
              >
                <IconoMicro tachado={info.micApagado} />
              </BotonRedondo>
              <BotonRedondo
                etiqueta="Colgar"
                color="var(--rumor)"
                destacado
                onClick={() => {
                  playToggle();
                  colgar();
                }}
              >
                <IconoColgar />
              </BotonRedondo>
            </>
          )}
        </motion.div>

        {(hablando || info.estado === "conectando") && (
          <p className="relative mt-10 max-w-xs text-center text-[11px] leading-snug text-muted">
            La voz va directa de un dispositivo a otro. No se graba ni pasa por ningún servidor,
            así que tampoco queda nada que revisar después.
          </p>
        )}
      </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function BotonRedondo({
  children,
  etiqueta,
  color,
  destacado = false,
  onClick,
}: {
  children: React.ReactNode;
  etiqueta: string;
  color: string;
  destacado?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={etiqueta}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.18, ease: SUAVE }}
        className="pulsable flex items-center justify-center rounded-full"
        style={{
          width: destacado ? 68 : 56,
          height: destacado ? 68 : 56,
          color: destacado ? "#fff" : color,
          background: destacado
            ? `color-mix(in srgb, ${color} 85%, black)`
            : `color-mix(in srgb, ${color} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} ${destacado ? 90 : 35}%, transparent)`,
          boxShadow: destacado ? `0 10px 30px color-mix(in srgb, ${color} 30%, transparent)` : "none",
        }}
      >
        {children}
      </motion.button>
      <span className="text-[10px] text-muted">{etiqueta}</span>
    </div>
  );
}

function IconoTelefono() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoColgar() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="rotate(135 12 12)">
        <path
          d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

function IconoMicro({ tachado }: { tachado: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {tachado && (
        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}
