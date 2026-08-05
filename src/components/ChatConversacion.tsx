"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "./AvatarPicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { playClick, playError, playToggle } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  Coincidencia,
  MOTIVOS_DENUNCIA,
  Mensaje,
  bloquear,
  denunciar,
  enviarMensaje,
  escucharConversacion,
  marcarConversacionLeida,
  mensajesCon,
} from "@/lib/conectar";

/**
 * La conversación con una coincidencia.
 *
 * Es la parte de la app donde dos desconocidos hablan a solas, así que
 * las decisiones aquí no son de diseño sino de seguridad:
 *
 *  - Bloquear y denunciar están en la cabecera, siempre visibles. No
 *    dentro de un menú de tres puntos: cuando alguien necesita esto,
 *    necesita encontrarlo en un segundo y sin pensar.
 *  - Los mensajes no se pueden borrar, ni los propios. Poder retirar lo
 *    que acabas de escribir es poder acosar y hacer desaparecer la
 *    prueba después.
 *  - El permiso para escribir lo comprueba la base de datos EN CADA
 *    mensaje, no al abrir. Si te bloquean a mitad de conversación, el
 *    siguiente mensaje ya no sale.
 */

const SUAVE = [0.16, 1, 0.3, 1] as const;

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function mismoDia(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function etiquetaDia(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

export function ChatConversacion({
  con,
  onCerrar,
  onSalirDeLaLista,
}: {
  con: Coincidencia;
  onCerrar: () => void;
  /** Cuando se bloquea o denuncia, la conversación desaparece de la lista. */
  onSalirDeLaLista: () => void;
}) {
  const [yo, setYo] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [confirmandoBloqueo, setConfirmandoBloqueo] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  const [motivoDenuncia, setMotivoDenuncia] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let vivo = true;
    let dejarDeEscuchar: (() => void) | null = null;

    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !vivo) return;
      setYo(auth.user.id);

      const historial = await mensajesCon(con.user_id);
      if (!vivo) return;
      setMensajes(historial);
      setCargando(false);
      void marcarConversacionLeida(con.user_id);

      dejarDeEscuchar = escucharConversacion(auth.user.id, con.user_id, (m) => {
        setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.autor_id !== auth.user!.id) {
          vibrar(8);
          void marcarConversacionLeida(con.user_id);
        }
      });
    })();

    return () => {
      vivo = false;
      dejarDeEscuchar?.();
    };
  }, [con.user_id]);

  // Al fondo con cada mensaje nuevo, que es donde está la conversación.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: mensajes.length > 1 ? "smooth" : "auto" });
  }, [mensajes.length]);

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setFallo(null);
    try {
      const error = await enviarMensaje(con.user_id, limpio);
      if (error) {
        playError();
        setFallo(error);
        return;
      }
      playClick();
      setTexto("");
      // El mensaje propio se pinta cuando vuelve por el canal, igual que
      // el del otro: así no hay dos caminos distintos que puedan
      // desincronizarse ni mensajes fantasma si el envío falla a medias.
    } finally {
      setEnviando(false);
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
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.32, ease: SUAVE }}
      className="panel flex h-[70vh] flex-col overflow-hidden rounded-2xl"
    >
      {/* Cabecera */}
      <div className="flex items-center gap-3 border-b border-panel-border px-4 py-3">
        <button
          type="button"
          onClick={onCerrar}
          className="shrink-0 rounded-full border border-panel-border px-3 py-1.5 text-xs text-muted transition-colors duration-200 hover:text-foreground"
        >
          Volver
        </button>
        <Avatar avatarId={con.avatar_id ?? ""} size="sm" rounded="full" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{con.alias}</p>
          <p className="text-[11px] text-muted">{con.edad} años</p>
        </div>
        {/* A la vista, no en un menú. */}
        <button
          type="button"
          onClick={() => setConfirmandoBloqueo(true)}
          className="shrink-0 text-[11px] text-muted transition-colors duration-200 hover:text-foreground"
        >
          Bloquear
        </button>
        <button
          type="button"
          onClick={() => setDenunciando(true)}
          className="shrink-0 text-[11px] text-muted transition-colors duration-200 hover:text-rumor"
        >
          Denunciar
        </button>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {cargando ? (
          <p className="text-center text-xs text-muted">Cargando…</p>
        ) : mensajes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Avatar avatarId={con.avatar_id ?? ""} size="lg" rounded="full" />
            <p className="mt-4 font-heading text-base font-semibold">
              Habéis coincidido con {con.alias}
            </p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
              Los dos os habéis marcado, así que aquí no hay que romper ningún hielo raro: os
              gustan cosas parecidas. Pregunta por algo que compartáis.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {mensajes.map((m, i) => {
              const mio = m.autor_id === yo;
              const anterior = mensajes[i - 1];
              const cambioDeDia = !anterior || !mismoDia(anterior.creado_en, m.creado_en);
              return (
                <div key={m.id}>
                  {cambioDeDia && (
                    <p className="my-3 text-center text-[10px] uppercase tracking-wide text-muted">
                      {etiquetaDia(m.creado_en)}
                    </p>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: SUAVE }}
                    className={`flex ${mio ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
                        mio ? "accent-gradient text-white" : "bg-panel-soft text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-snug">
                        {m.texto}
                      </p>
                      <p
                        className={`mt-0.5 text-right text-[10px] ${
                          mio ? "text-white/60" : "text-muted"
                        }`}
                      >
                        {hora(m.creado_en)}
                      </p>
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={finRef} />
      </div>

      {/* Escribir */}
      <div className="border-t border-panel-border px-4 py-3">
        <AnimatePresence>
          {fallo && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 text-xs text-rumor"
            >
              {fallo}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Mayúsculas+Enter hace un salto de línea.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Escribe un mensaje…"
            className="panel-elevated max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
          />
          <motion.button
            type="button"
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.2, ease: SUAVE }}
            className="accent-gradient shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-30"
          >
            Enviar
          </motion.button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmandoBloqueo}
        title={`Bloquear a ${con.alias}`}
        message="Se acaba la conversación y dejaréis de veros. No se le avisa de nada. Los mensajes que ya os habéis escrito se conservan por si hace falta revisarlos."
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
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setDenunciando(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22, ease: SUAVE }}
              onClick={(e) => e.stopPropagation()}
              className="panel w-full max-w-sm rounded-2xl p-6"
            >
              <h3 className="font-heading text-lg font-semibold">Denunciar a {con.alias}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Lo revisa una persona del equipo, que podrá leer esta conversación. Al denunciar
                también dejaréis de veros.
              </p>
              <div className="mt-4 flex flex-col gap-1.5">
                {MOTIVOS_DENUNCIA.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMotivoDenuncia(m);
                      playToggle();
                    }}
                    className="rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-200"
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
                  className="flex-1 rounded-full border border-panel-border py-2.5 text-sm text-muted"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={enviarDenuncia}
                  disabled={!motivoDenuncia}
                  className="flex-1 rounded-full border py-2.5 text-sm font-semibold text-rumor disabled:opacity-40"
                  style={{
                    borderColor: "color-mix(in srgb, var(--rumor) 50%, transparent)",
                    background: "color-mix(in srgb, var(--rumor) 10%, transparent)",
                  }}
                >
                  Denunciar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
