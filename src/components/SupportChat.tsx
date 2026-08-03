"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { legalConfig } from "@/config/legal";
import { siteConfig } from "@/config/site";
import { playSend, playReceive, playToggle } from "@/lib/sound";
import {
  Ticket,
  MensajeSoporte,
  abrirTicket,
  cerrarTicket,
  enviarMensaje,
  escucharMensajes,
  escucharTicket,
  getMensajes,
  getTicketActivo,
  observarAdminPresente,
} from "@/lib/support";

/**
 * Conversación de soporte del usuario con un administrador.
 *
 * Los dos estados que se enseñan salen del estado real del ticket en la
 * base de datos, no de un temporizador decorativo: "abierto" significa
 * que todavía no lo ha cogido nadie, y "atendido" que un administrador ya
 * está dentro. Si se falseara con una animación bonita, la gente se
 * quedaría esperando creyendo que hay alguien al otro lado.
 */
export function SupportChat() {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [mensajes, setMensajes] = useState<MensajeSoporte[]>([]);
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [haySesion, setHaySesion] = useState<boolean | null>(null);
  const [adminPresente, setAdminPresente] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [resuelta, setResuelta] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setHaySesion(false);
        setCargando(false);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      setHaySesion(!!data.user);
      if (data.user) {
        const t = await getTicketActivo();
        setTicket(t);
        if (t) setMensajes(await getMensajes(t.id));
      }
      setCargando(false);
    })();
  }, []);

  // Suscripciones en vivo: mensajes nuevos y cambios de estado del ticket.
  useEffect(() => {
    if (!ticket) return;
    const dejarMensajes = escucharMensajes(ticket.id, (m) => {
      setMensajes((prev) => {
        // El propio mensaje ya se añadió al enviarlo; evita duplicarlo
        // cuando vuelve por el canal en tiempo real.
        if (prev.some((x) => x.id === m.id)) return prev;
        if (m.autor_rol === "admin") playReceive();
        return [...prev, m];
      });
    });
    const dejarTicket = escucharTicket(ticket.id, (t) => setTicket(t));
    return () => {
      dejarMensajes();
      dejarTicket();
    };
  }, [ticket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Presencia real del administrador: si cierra la pestaña o pierde
  // conexión, esto pasa a false solo y la cabecera lo refleja.
  useEffect(() => {
    if (!ticket) return;
    return observarAdminPresente(ticket.id, setAdminPresente);
  }, [ticket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes.length]);

  const handleAbrir = async () => {
    if (!motivo.trim() || enviando) return;
    setEnviando(true);
    const t = await abrirTicket(motivo.trim());
    if (t) {
      setTicket(t);
      await enviarMensaje(t.id, motivo.trim(), "usuario");
      setMensajes(await getMensajes(t.id));
      playSend();
      // Aviso al móvil del administrador. Si falla (no configurado, sin
      // dispositivos, sin red) da igual: el ticket ya está creado y se
      // verá igualmente en el panel. No se hace esperar al usuario por
      // esto ni se le enseña ningún error.
      void fetch("/api/push/notificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: t.id, motivo: motivo.trim() }),
      }).catch(() => {});
    }
    setEnviando(false);
  };

  const handleEnviar = async () => {
    const contenido = texto.trim();
    if (!contenido || !ticket || enviando) return;
    setEnviando(true);
    setTexto("");
    const ok = await enviarMensaje(ticket.id, contenido, "usuario");
    if (ok) {
      playSend();
      setMensajes(await getMensajes(ticket.id));
    }
    setEnviando(false);
  };

  const handleCerrar = async () => {
    if (!ticket) return;
    setCerrando(true);
    await cerrarTicket(ticket.id);
    playToggle();
    // Un momento de confirmación antes de vaciar la pantalla: si el chat
    // desaparece de golpe, no queda claro si se ha cerrado bien o si se
    // ha roto algo.
    setResuelta(true);
    setTimeout(() => {
      setTicket(null);
      setMensajes([]);
      setMotivo("");
      setResuelta(false);
      setCerrando(false);
    }, 1800);
  };

  if (cargando) {
    return <p className="mt-6 text-sm text-muted">Un momento…</p>;
  }

  if (!haySesion) {
    return (
      <div className="panel mt-6 rounded-2xl p-6">
        <p className="text-sm text-muted">
          Para abrir una consulta necesitas tener cuenta: es lo que permite que la conversación te
          espere aquí aunque cierres la app.
        </p>
        <Link
          href="/login"
          className="accent-gradient mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
        >
          Iniciar sesión / Crear cuenta
        </Link>
      </div>
    );
  }

  // --- Recién cerrada: confirmación antes de volver al formulario -------
  if (resuelta) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="panel mt-6 rounded-2xl p-8 text-center"
      >
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 18 }}
          className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-ice/40 ice-text"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
        <p className="font-heading text-base font-semibold">Consulta cerrada</p>
        <p className="mt-1 text-sm text-muted">
          Si vuelve a pasarte algo, puedes abrir otra cuando quieras.
        </p>
      </motion.div>
    );
  }

  // --- Todavía no hay ticket: formulario para abrirlo -------------------
  if (!ticket) {
    return (
      <div className="panel mt-6 rounded-2xl p-6">
        <p className="text-sm leading-relaxed text-muted">
          Cuéntanos qué ha pasado. Lo lee una persona, no {siteConfig.assistantName}: puede tardar un
          rato en contestar, pero la conversación se queda aquí esperándote.
        </p>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Describe el problema con el detalle que puedas"
          className="mt-4 w-full resize-none rounded-xl border border-panel-border bg-panel-soft px-3 py-2 text-sm outline-none focus:border-ice/50"
        />
        <motion.button
          type="button"
          onClick={handleAbrir}
          disabled={!motivo.trim() || enviando}
          whileHover={motivo.trim() ? { scale: 1.03 } : {}}
          whileTap={motivo.trim() ? { scale: 0.96 } : {}}
          className="accent-gradient mt-3 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {enviando ? "Abriendo…" : "Abrir consulta"}
        </motion.button>
      </div>
    );
  }

  const atendido = ticket.estado === "atendido";
  // "Conectado" solo si además está ahí ahora mismo. Antes bastaba con
  // que hubiera cogido el ticket alguna vez, así que seguía poniendo
  // conectado horas después de haberse ido.
  const enLinea = atendido && adminPresente;

  return (
    <div className="panel mt-6 flex flex-col rounded-2xl">
      {/* Cabecera: quién hay al otro lado, según el estado real */}
      <div className="flex items-center gap-3 border-b border-panel-border px-5 py-4">
        <span
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
            atendido ? "border-ice/40 ice-text" : "border-panel-border text-muted"
          }`}
        >
          {atendido ? (
            legalConfig.soporteNombre.slice(0, 1)
          ) : (
            <>
              {/* Anillo que late hacia fuera: se ve de lejos que algo
                  está pasando. Antes había un punto de 1,5px que apenas
                  se distinguía del borde. */}
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full border border-ice/50"
                animate={{ scale: [1, 1.45], opacity: [0.55, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
              />
              {/* Tres puntos que suben por turnos, como un "escribiendo…" */}
              <span className="flex items-end gap-[3px]">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="block h-[5px] w-[5px] rounded-full"
                    style={{ background: "var(--ice)" }}
                    animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{
                      duration: 1.1,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.18,
                    }}
                  />
                ))}
              </span>
            </>
          )}
        </span>
        <div className="min-w-0">
          {atendido ? (
            <>
              <p className="text-sm font-semibold text-foreground">
                {legalConfig.soporteNombre}{" "}
                <span className="ml-1 rounded-full border border-ice/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ice-text">
                  {legalConfig.soporteRango}
                </span>
              </p>
              {enLinea ? (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Conectado
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-panel-border" />
                  Desconectado — ya ha visto tu consulta, te responderá aquí
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">Contactando con el administrador</p>
              <p className="text-xs text-muted">
                Aún no ha entrado nadie. Puedes cerrar la app: lo verás aquí al volver.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto px-5 py-4">
        <AnimatePresence initial={false}>
          {mensajes.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.autor_rol === "usuario"
                  ? "accent-gradient self-end text-white"
                  : "self-start border border-panel-border bg-panel-soft text-foreground"
              }`}
            >
              {m.autor_rol === "admin" && (
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide ice-text">
                  {legalConfig.soporteNombre} · {legalConfig.soporteRango}
                </p>
              )}
              {m.contenido}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={finRef} />
      </div>

      {/* Escribir */}
      <div className="flex items-center gap-2 border-t border-panel-border px-5 py-4">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleEnviar()}
          maxLength={4000}
          placeholder="Escribe tu mensaje…"
          className="flex-1 rounded-full border border-panel-border bg-panel-soft px-4 py-2 text-sm outline-none focus:border-ice/50"
        />
        <motion.button
          type="button"
          onClick={handleEnviar}
          disabled={!texto.trim() || enviando}
          whileHover={texto.trim() ? { scale: 1.05 } : {}}
          whileTap={texto.trim() ? { scale: 0.94 } : {}}
          className="accent-gradient shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Enviar
        </motion.button>
      </div>

      <div className="border-t border-panel-border px-5 py-3">
        <button
          type="button"
          onClick={handleCerrar}
          disabled={cerrando}
          className="text-xs text-muted underline transition-colors hover:text-foreground disabled:opacity-50"
        >
          {cerrando ? "Cerrando…" : "Dar por resuelta esta consulta"}
        </button>
      </div>
    </div>
  );
}
