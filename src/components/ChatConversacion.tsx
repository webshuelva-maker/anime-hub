"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "./AvatarPicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { playClick, playError, playToggle } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { GrabadorDeVoz, NotaDeVoz, IconoMicrofono } from "./NotasDeVoz";
import {
  Coincidencia,
  MOTIVOS_DENUNCIA,
  Mensaje,
  REACCIONES_RAPIDAS,
  Reaccion,
  alternarReaccion,
  reaccionesDe,
  bloquear,
  denunciar,
  enviarMensaje,
  enviarNotaDeVoz,
  engancharConversacion,
  marcarConversacionLeida,
  mensajesCon,
} from "@/lib/conectar";

/**
 * La conversación con una coincidencia.
 *
 * ---------------------------------------------------------------------
 * REDISEÑO v160
 *
 * La versión anterior eran burbujas de mensajería genérica con dos
 * botones rojos de "Bloquear" y "Denunciar" clavados en la cabecera y un
 * párrafo fijo explicando lo que hacían. Lo describió bien: parecía una
 * app hecha por alguien inseguro. Y es que ESO ES lo que comunica una
 * advertencia permanente — que el sitio es peligroso, todo el rato, a
 * quien solo está hablando con alguien.
 *
 * Las herramientas siguen estando a un toque y en el mismo sitio de
 * siempre, pero dentro de un menú, y la explicación aparece EN EL
 * MOMENTO en que se abre: que es cuando de verdad hace falta leerla, no
 * cinco días antes.
 *
 * La forma es de lista, no de burbujas: mensajes seguidos de la misma
 * persona se agrupan bajo un solo nombre y una sola hora, como en
 * Discord. Además de reconocible, cabe mucho más texto por pantalla, que
 * es de lo que va una conversación.
 * ---------------------------------------------------------------------
 */

const SUAVE = [0.16, 1, 0.3, 1] as const;

/** Los de siempre. No hace falta un catálogo entero: para lo demás está
 *  el teclado de emojis del propio sistema. */
const EMOJIS = [
  "😀","😂","🥹","😍","😎","🤔","😴","🥲",
  "😭","😱","🤯","🙃","😤","🥳","🫠","😳",
  "❤️","🔥","✨","🎉","👍","👀","🙏","💀",
];
/** Dos mensajes seguidos del mismo autor en menos de esto van juntos. */
const MARGEN_AGRUPAR_MS = 5 * 60 * 1000;

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function etiquetaDia(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

export function ChatConversacion({
  con,
  onCerrar,
  onSalirDeLaLista,
}: {
  con: Coincidencia;
  onCerrar: () => void;
  onSalirDeLaLista: () => void;
}) {
  const [yo, setYo] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [enLinea, setEnLinea] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [reacciones, setReacciones] = useState<Reaccion[]>([]);
  /** El mensaje al que se está respondiendo, si hay alguno. */
  const [respondiendoA, setRespondiendoA] = useState<Mensaje | null>(null);
  const [emojisAbiertos, setEmojisAbiertos] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const engancheRef = useRef<{ avisarQueEscribo: () => void; cerrar: () => void } | null>(null);
  const finEscribirRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmandoBloqueo, setConfirmandoBloqueo] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  const [motivoDenuncia, setMotivoDenuncia] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);
  const cajaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let vivo = true;

    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !vivo) return;
      setYo(auth.user.id);

      const historial = await mensajesCon(con.user_id);
      if (!vivo) return;
      setMensajes(historial);
      setReacciones(await reaccionesDe(historial.map((m) => m.id)));
      setCargando(false);
      void marcarConversacionLeida(con.user_id);

      engancheRef.current = engancharConversacion(auth.user.id, con.user_id, {
        alLlegarMensaje: (m) => {
          setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          // Si llega un mensaje, es que ha terminado de escribir.
          setEscribiendo(false);
          if (m.autor_id !== auth.user!.id) {
            vibrar(8);
            void marcarConversacionLeida(con.user_id);
          }
        },
        alCambiarPresencia: setEnLinea,
        alEscribirElOtro: () => {
          setEscribiendo(true);
          // El aviso no dice cuándo PARA de escribir, así que se apaga
          // solo: si en tres segundos no llega otro, es que ha dejado de
          // teclear (o ha borrado la frase y se ha ido).
          if (finEscribirRef.current) clearTimeout(finEscribirRef.current);
          finEscribirRef.current = setTimeout(() => setEscribiendo(false), 3000);
        },
      });
    })();

    return () => {
      vivo = false;
      engancheRef.current?.cerrar();
      if (finEscribirRef.current) clearTimeout(finEscribirRef.current);
    };
  }, [con.user_id]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: mensajes.length > 1 ? "smooth" : "auto" });
  }, [mensajes.length]);

  // La caja crece con el texto en vez de tener una barra propia.
  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    caja.style.height = "auto";
    caja.style.height = `${Math.min(caja.scrollHeight, 140)}px`;
  }, [texto]);

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setFallo(null);
    try {
      const error = await enviarMensaje(con.user_id, limpio, respondiendoA?.id ?? null);
      if (error) {
        playError();
        setFallo(error);
        return;
      }
      playClick();
      setTexto("");
      setRespondiendoA(null);
    } finally {
      setEnviando(false);
    }
  };

  /** Alterna una reacción y refleja el cambio al momento. */
  const reaccionar = async (mensajeId: string, emoji: string) => {
    if (!yo) return;
    const yaEstaba = reacciones.some(
      (r) => r.mensaje_id === mensajeId && r.usuario_id === yo && r.emoji === emoji
    );
    // Se pinta antes de que responda el servidor: una reacción que tarda
    // medio segundo en aparecer se pulsa dos veces.
    setReacciones((prev) =>
      yaEstaba
        ? prev.filter(
            (r) => !(r.mensaje_id === mensajeId && r.usuario_id === yo && r.emoji === emoji)
          )
        : [...prev, { mensaje_id: mensajeId, usuario_id: yo, emoji }]
    );
    playToggle();
    const quedaPuesta = await alternarReaccion(mensajeId, emoji, yaEstaba);
    // Si el servidor dice otra cosa (te acaban de bloquear, por ejemplo),
    // se deshace lo pintado.
    if (quedaPuesta === yaEstaba) {
      setReacciones(await reaccionesDe(mensajes.map((m) => m.id)));
    }
  };

  const confirmarBloqueo = async () => {
    setConfirmandoBloqueo(false);
    await bloquear(con.user_id);
    playToggle();
    onSalirDeLaLista();
  };

  const enviarDenuncia = async () => {
    if (!motivoDenuncia) return;
    await denunciar(con.user_id, motivoDenuncia, "Denuncia desde el chat");
    await bloquear(con.user_id);
    setDenunciando(false);
    onSalirDeLaLista();
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ---------- Cabecera ---------- */}
      <header className="relative flex shrink-0 items-center gap-3 border-b border-panel-border px-4 py-3">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Volver a las coincidencias"
          className="pulsable -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-muted hover:bg-panel-soft hover:text-foreground"
        >
          ‹
        </button>

        <div className="relative shrink-0">
          <Avatar avatarId={con.avatar_id ?? ""} size="sm" rounded="full" />
          {/* El punto solo aparece cuando está de verdad: no hay estado
              "ausente" inventado ni "visto hace X", que es un dato que
              nadie ha pedido publicar. */}
          <AnimatePresence>
            {enLinea && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: SUAVE }}
                className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background"
                style={{ background: "var(--ice)" }}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-[15px] font-semibold leading-tight">
            {con.alias}
          </p>
          <p className="h-4 text-[11px] leading-4">
            {escribiendo ? (
              <span className="ice-text">escribiendo…</span>
            ) : enLinea ? (
              <span className="ice-text">en línea</span>
            ) : (
              <span className="text-muted">{con.edad} años</span>
            )}
          </p>
        </div>

        {/* Las herramientas de seguridad viven aquí dentro: a un toque y
            siempre en el mismo sitio, pero sin gritar. */}
        <button
          type="button"
          onClick={() => {
            setMenuAbierto((v) => !v);
            playToggle();
          }}
          aria-label="Opciones de la conversación"
          className={`pulsable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
            menuAbierto ? "bg-panel-soft text-foreground" : "text-muted hover:bg-panel-soft"
          }`}
        >
          ⋯
        </button>

        <AnimatePresence>
          {menuAbierto && (
            <>
              {/* Capa para cerrar tocando fuera. */}
              <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18, ease: SUAVE }}
                className="panel absolute right-3 top-full z-20 w-72 origin-top-right rounded-xl p-1.5 shadow-2xl shadow-black/50"
              >
                {/* La explicación va AQUÍ, en el momento de usarlo. */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuAbierto(false);
                    setConfirmandoBloqueo(true);
                  }}
                  className="pulsable w-full rounded-lg px-3 py-2.5 text-left hover:bg-panel-soft"
                >
                  <span className="block text-sm font-medium text-foreground">
                    Bloquear a {con.alias}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                    Se acaba la conversación y dejáis de veros. No se le avisa.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuAbierto(false);
                    setDenunciando(true);
                  }}
                  className="pulsable w-full rounded-lg px-3 py-2.5 text-left hover:bg-panel-soft"
                >
                  <span className="block text-sm font-medium text-rumor">Denunciar</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                    Lo revisa el equipo de moderación, que podrá leer esta conversación. También
                    le bloquea.
                  </span>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>

      {/* ---------- Mensajes ---------- */}
      <div className="flex-1 overflow-y-auto">
        {cargando ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted">Cargando conversación…</p>
          </div>
        ) : mensajes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <Avatar avatarId={con.avatar_id ?? ""} size="xl" rounded="full" />
            <h2 className="mt-5 font-heading text-xl font-bold">{con.alias}</h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Este es el principio. Os habéis marcado los dos, así que no hace falta romper ningún
              hielo raro: preguntad por algo que compartáis.
            </p>
          </div>
        ) : (
          <div className="px-2 py-4">
            {mensajes.map((m, i) => {
              const anterior = mensajes[i - 1];
              const mio = m.autor_id === yo;
              const cambioDeDia =
                !anterior ||
                new Date(anterior.creado_en).toDateString() !==
                  new Date(m.creado_en).toDateString();
              const agrupado =
                !cambioDeDia &&
                anterior?.autor_id === m.autor_id &&
                new Date(m.creado_en).getTime() - new Date(anterior.creado_en).getTime() <
                  MARGEN_AGRUPAR_MS;

              return (
                <div key={m.id}>
                  {cambioDeDia && (
                    <div className="my-4 flex items-center gap-3 px-2">
                      <span className="h-px flex-1 bg-panel-border" />
                      <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
                        {etiquetaDia(m.creado_en)}
                      </span>
                      <span className="h-px flex-1 bg-panel-border" />
                    </div>
                  )}

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.22, ease: SUAVE }}
                    className={`group relative flex gap-3 rounded-lg px-2 transition-colors duration-150 hover:bg-panel-soft/40 ${
                      agrupado ? "py-0.5" : "mt-3 py-1"
                    }`}
                  >
                    {/* El avatar solo encabeza el grupo; en los mensajes
                        siguientes su hueco lo ocupa la hora, que aparece
                        al pasar por encima. */}
                    <div className="w-9 shrink-0 pt-0.5">
                      {agrupado ? (
                        <span className="hidden pt-1 text-right text-[10px] leading-5 text-muted group-hover:block">
                          {hora(m.creado_en)}
                        </span>
                      ) : (
                        <Avatar
                          avatarId={(mio ? undefined : con.avatar_id) ?? ""}
                          size="sm"
                          rounded="full"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* La cita de a qué se responde, encima del mensaje. */}
                      {m.responde_a &&
                        (() => {
                          const citado = mensajes.find((x) => x.id === m.responde_a);
                          if (!citado) return null;
                          return (
                            <p className="mb-0.5 flex items-center gap-1.5 border-l-2 border-panel-border pl-2 text-[11px] text-muted">
                              <span className="shrink-0 font-medium">
                                {citado.autor_id === yo ? "Tú" : con.alias}
                              </span>
                              <span className="truncate opacity-80">
                                {citado.audio_ruta ? "Nota de voz" : citado.texto}
                              </span>
                            </p>
                          );
                        })()}

                      {!agrupado && (
                        <p className="flex items-baseline gap-2">
                          <span
                            className={`font-heading text-sm font-semibold ${
                              mio ? "ice-text" : "text-foreground"
                            }`}
                          >
                            {mio ? "Tú" : con.alias}
                          </span>
                          <span className="text-[10px] text-muted">{hora(m.creado_en)}</span>
                        </p>
                      )}
                      {/*
                        El contenido va en una caja que ocupa solo lo que
                        mide el mensaje (w-fit), y no toda la fila. Así la
                        barra de reacciones puede anclarse a SU borde y
                        salir pegada al mensaje. Antes iba anclada al
                        borde derecho de la fila entera, o sea al final de
                        la pantalla: reaccionabas a una nota de voz de
                        tres dedos de ancho y el menú te aparecía en la
                        otra punta, sin relación visible con lo que
                        estabas señalando.
                      */}
                      <div className="relative w-fit max-w-[85%]">
                        {m.audio_ruta ? (
                          <NotaDeVoz ruta={m.audio_ruta} duracionMs={m.audio_ms} mio={mio} />
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">
                            {m.texto}
                          </p>
                        )}

                        {/* Barra que aparece al pasar por encima:
                            reaccionar rápido o responder. En pantallas
                            estrechas se coloca justo encima del mensaje,
                            porque al lado no cabría. */}
                        <div className="pointer-events-none absolute bottom-full right-0 z-10 mb-1 flex items-center gap-0.5 rounded-full border border-panel-border bg-panel p-0.5 opacity-0 shadow-lg transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 sm:bottom-auto sm:left-full sm:right-auto sm:top-1/2 sm:mb-0 sm:ml-2 sm:-translate-y-1/2">
                          {REACCIONES_RAPIDAS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => reaccionar(m.id, emoji)}
                              className="pulsable flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-panel-soft"
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setRespondiendoA(m);
                              cajaRef.current?.focus();
                              playToggle();
                            }}
                            aria-label="Responder a este mensaje"
                            className="pulsable flex h-7 w-7 items-center justify-center rounded-full text-xs text-muted hover:bg-panel-soft hover:text-foreground"
                          >
                            ↩
                          </button>
                        </div>
                      </div>

                      {/* Reacciones puestas. Las tuyas van marcadas, y
                          volver a pulsar las quita. */}
                      {(() => {
                        const suyas = reacciones.filter((r) => r.mensaje_id === m.id);
                        if (suyas.length === 0) return null;
                        const porEmoji = new Map<string, { total: number; mia: boolean }>();
                        for (const r of suyas) {
                          const actualCuenta = porEmoji.get(r.emoji) ?? { total: 0, mia: false };
                          porEmoji.set(r.emoji, {
                            total: actualCuenta.total + 1,
                            mia: actualCuenta.mia || r.usuario_id === yo,
                          });
                        }
                        return (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {[...porEmoji.entries()].map(([emoji, info]) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => reaccionar(m.id, emoji)}
                                className="pulsable flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                                style={
                                  info.mia
                                    ? {
                                        borderColor:
                                          "color-mix(in srgb, var(--ice) 50%, transparent)",
                                        background:
                                          "color-mix(in srgb, var(--ice) 12%, transparent)",
                                      }
                                    : { borderColor: "var(--panel-border)" }
                                }
                              >
                                <span>{emoji}</span>
                                <span className="text-muted">{info.total}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}

                      {/* "Visto": solo bajo TU último mensaje, y solo si
                          lo ha leído. Puesto en cada mensaje sería ruido. */}
                      {mio && i === mensajes.length - 1 && m.leido_en && (
                        <p className="mt-0.5 text-[10px] text-muted">Visto</p>
                      )}
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
        {/* Los tres puntos, al final del hilo y donde estaría el mensaje
            que viene. La altura está reservada siempre, así que aparecer
            y desaparecer no da un salto a la conversación. */}
        <div className="h-7 px-4">
          <AnimatePresence>
            {escribiendo && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: SUAVE }}
                className="flex items-center gap-2 pl-11"
              >
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-muted"
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                    />
                  ))}
                </span>
                <span className="text-[11px] text-muted">{con.alias} está escribiendo</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div ref={finRef} />
      </div>

      {/* ---------- Escribir ---------- */}
      <div className="shrink-0 px-3 pb-4 pt-1">
        <AnimatePresence>
          {fallo && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 px-1 text-xs text-rumor"
            >
              {fallo}
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {respondiendoA && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: SUAVE }}
              className="overflow-hidden"
            >
              <div className="mb-1.5 flex items-center gap-2 rounded-xl border-l-2 border-ice/60 bg-panel-soft/50 px-3 py-2">
                <span className="min-w-0 flex-1 text-[11px] leading-snug">
                  <span className="ice-text font-medium">
                    Respondiendo a {respondiendoA.autor_id === yo ? "ti mismo" : con.alias}
                  </span>
                  <span className="block truncate text-muted">{respondiendoA.texto}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setRespondiendoA(null)}
                  aria-label="Cancelar la respuesta"
                  className="pulsable shrink-0 rounded-full px-2 py-1 text-xs text-muted hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {grabando ? (
          <GrabadorDeVoz
            onCancelar={() => setGrabando(false)}
            onListo={async (audio, duracion) => {
              setGrabando(false);
              setEnviando(true);
              const error = await enviarNotaDeVoz(
                con.user_id,
                audio,
                duracion,
                respondiendoA?.id ?? null
              );
              setEnviando(false);
              if (error) setFallo(error);
              else setRespondiendoA(null);
            }}
          />
        ) : (
        <div className="relative flex items-end gap-2 rounded-2xl border border-panel-border bg-panel-soft/60 px-3 py-2 transition-colors duration-200 focus-within:border-ice/40">
          <AnimatePresence>
            {emojisAbiertos && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setEmojisAbiertos(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: SUAVE }}
                  className="panel absolute bottom-full left-0 z-20 mb-2 grid w-64 grid-cols-8 gap-0.5 rounded-xl p-2 shadow-2xl shadow-black/50"
                >
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        setTexto((t) => t + e);
                        cajaRef.current?.focus();
                      }}
                      className="pulsable flex h-7 items-center justify-center rounded text-lg hover:bg-panel-soft"
                    >
                      {e}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => {
              setEmojisAbiertos((v) => !v);
              playToggle();
            }}
            aria-label="Insertar un emoji"
            className="pulsable mb-0.5 flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-lg text-muted hover:text-foreground"
          >
            ☺
          </button>
          <textarea
            ref={cajaRef}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (e.target.value.trim()) engancheRef.current?.avisarQueEscribo();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={`Escribe a ${con.alias}`}
            className="max-h-36 flex-1 resize-none bg-transparent py-1 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted"
          />
          {/* El mismo hueco hace de micrófono o de enviar según haya
              algo escrito. Dos botones fijos ahí obligarían a elegir
              cuál mirar cada vez. */}
          {texto.trim() ? (
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              aria-label="Enviar mensaje"
              className="accent-gradient pulsable mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-25"
            >
              ↑
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFallo(null);
                setGrabando(true);
              }}
              disabled={enviando}
              aria-label="Grabar una nota de voz"
              title="Grabar una nota de voz"
              className="pulsable mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-panel-border text-muted transition-colors hover:border-ice/40 hover:text-ice disabled:opacity-30"
            >
              <IconoMicrofono className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
        )}
        <p className="mt-1.5 px-1 text-[10px] text-muted">
          {grabando
            ? "Para y escúchala antes de enviarla. Máximo dos minutos."
            : "Enter envía · Mayús + Enter salta de línea"}
        </p>
      </div>

      <ConfirmDialog
        open={confirmandoBloqueo}
        title={`¿Bloquear a ${con.alias}?`}
        message="Se acaba la conversación y dejaréis de veros en Conectar. No se le avisa de nada. Lo que ya os habéis escrito se conserva por si hiciera falta revisarlo."
        confirmLabel="Bloquear"
        onConfirm={confirmarBloqueo}
        onCancel={() => setConfirmandoBloqueo(false)}
      />

      <AnimatePresence>
        {denunciando && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4"
            onClick={() => setDenunciando(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.22, ease: SUAVE }}
              onClick={(e) => e.stopPropagation()}
              className="panel w-full max-w-sm rounded-2xl p-6"
            >
              <h3 className="font-heading text-lg font-semibold">Denunciar a {con.alias}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Lo revisa una persona del equipo de moderación, que podrá leer esta conversación.
                Al denunciar también dejaréis de veros.
              </p>

              <p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Qué ha pasado
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {MOTIVOS_DENUNCIA.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMotivoDenuncia(m);
                      playToggle();
                    }}
                    className="pulsable rounded-xl border px-3 py-2 text-left text-sm"
                    style={
                      motivoDenuncia === m
                        ? {
                            borderColor: "color-mix(in srgb, var(--rumor) 50%, transparent)",
                            color: "var(--rumor)",
                            background: "color-mix(in srgb, var(--rumor) 10%, transparent)",
                          }
                        : { borderColor: "var(--panel-border)", color: "var(--muted)" }
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDenunciando(false)}
                  className="pulsable flex-1 rounded-full border border-panel-border py-2.5 text-sm text-muted"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={enviarDenuncia}
                  disabled={!motivoDenuncia}
                  className="pulsable flex-1 rounded-full border py-2.5 text-sm font-semibold text-rumor disabled:opacity-40"
                  style={{
                    borderColor: "color-mix(in srgb, var(--rumor) 50%, transparent)",
                    background: "color-mix(in srgb, var(--rumor) 10%, transparent)",
                  }}
                >
                  Enviar denuncia
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
