"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { legalConfig } from "@/config/legal";
import { createClient } from "@/lib/supabase/client";
import { AvisosPushToggle } from "./AvisosPushToggle";
import { playReceive, playSend } from "@/lib/sound";
import {
  Ticket,
  MensajeSoporte,
  anunciarAdminPresente,
  atenderTicket,
  cerrarTicket,
  enviarMensaje,
  escucharMensajes,
  escucharCambiosTickets,
  escucharTicketsNuevos,
  esAdministrador,
  getMensajes,
  getTicketsPendientes,
} from "@/lib/support";

function haceCuanto(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "ahora mismo";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

/**
 * Panel de moderación. Solo se enseña si la base de datos confirma que
 * quien mira es administrador — y aunque alguien se saltara esta
 * comprobación en el navegador, las políticas de Supabase no le
 * devolverían ni un ticket.
 */
export function AdminSupportPanel() {
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activo, setActivo] = useState<Ticket | null>(null);
  const [mensajes, setMensajes] = useState<MensajeSoporte[]>([]);
  const [texto, setTexto] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const admin = await esAdministrador();
      setEsAdmin(admin);
      if (admin) {
        const { data } = await createClient().auth.getUser();
        setAdminId(data.user?.id ?? null);
        setTickets(await getTicketsPendientes());
      }
    })();
  }, []);

  // Los tickets cerrados (por el usuario o por otro administrador)
  // desaparecen solos de la lista. Antes solo se escuchaban los nuevos,
  // así que una consulta cerrada se quedaba ahí como pendiente para
  // siempre hasta recargar la página.
  useEffect(() => {
    if (!esAdmin) return;
    return escucharCambiosTickets((t) => {
      if (t.estado === "cerrado") {
        setTickets((prev) => prev.filter((x) => x.id !== t.id));
        setActivo((prev) => (prev?.id === t.id ? null : prev));
      } else {
        setTickets((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      }
    });
  }, [esAdmin]);

  useEffect(() => {
    if (!esAdmin) return;
    return escucharTicketsNuevos((t) => {
      setTickets((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
      playReceive();
    });
  }, [esAdmin]);

  useEffect(() => {
    if (!activo) return;
    const dejar = escucharMensajes(activo.id, (m) => {
      setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      if (m.autor_rol === "usuario") playReceive();
    });
    return dejar;
  }, [activo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras este ticket esté abierto en pantalla, el usuario ve
  // "Conectado". Al cerrarlo o cerrar la pestaña, la presencia se cae
  // sola y al usuario le aparece "Desconectado".
  useEffect(() => {
    if (!activo || !adminId) return;
    return anunciarAdminPresente(activo.id, adminId);
  }, [activo?.id, adminId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes.length]);

  const abrir = async (t: Ticket) => {
    setActivo(t);
    setMensajes(await getMensajes(t.id));
    if (t.estado === "abierto") {
      // Coger el ticket es lo que hace que al usuario le cambie la
      // pantalla de "contactando" a "conectado".
      await atenderTicket(t.id);
      setActivo({ ...t, estado: "atendido" });
      setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, estado: "atendido" } : x)));
    }
  };

  // Si se llega desde una notificación (/admin/soporte?ticket=...), se
  // abre directamente esa conversación en vez de dejar la lista y que
  // haya que buscarla a mano. Va DESPUÉS de definir "abrir": si se
  // declara antes, se estaría usando una función que aún no existe.
  const ticketPedido = searchParams.get("ticket");
  const yaAbiertoRef = useRef(false);
  useEffect(() => {
    if (!ticketPedido || yaAbiertoRef.current || tickets.length === 0) return;
    const encontrado = tickets.find((t) => t.id === ticketPedido);
    if (encontrado) {
      yaAbiertoRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void abrir(encontrado);
    }
  }, [ticketPedido, tickets]);

  const responder = async () => {
    const contenido = texto.trim();
    if (!contenido || !activo) return;
    setTexto("");
    const ok = await enviarMensaje(activo.id, contenido, "admin");
    if (ok) {
      playSend();
      setMensajes(await getMensajes(activo.id));
    }
  };

  const cerrar = async () => {
    if (!activo) return;
    await cerrarTicket(activo.id);
    setTickets((prev) => prev.filter((x) => x.id !== activo.id));
    setActivo(null);
    setMensajes([]);
  };

  if (esAdmin === null) return <p className="mt-6 text-sm text-muted">Comprobando…</p>;

  if (!esAdmin) {
    return (
      <div className="panel mt-6 rounded-2xl p-6">
        <p className="text-sm text-muted">Esta página es solo para administradores.</p>
      </div>
    );
  }

  return (
    <>
      <AvisosPushToggle />
      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Lista de tickets */}
      <div className="panel h-fit rounded-2xl p-3">
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Pendientes ({tickets.length})
        </p>
        {tickets.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted">No hay consultas abiertas.</p>
        )}
        <div className="flex flex-col gap-1">
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => abrir(t)}
              className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                activo?.id === t.id ? "bg-panel-soft" : "hover:bg-panel-soft/60"
              }`}
            >
              <p className="flex items-center gap-1.5 text-xs">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    t.estado === "abierto" ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                />
                <span className="text-muted">{t.estado === "abierto" ? "Sin atender" : "Atendido"}</span>
                <span className="ml-auto text-muted">{haceCuanto(t.created_at)}</span>
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-foreground">{t.motivo ?? "Sin motivo"}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Conversación */}
      {!activo ? (
        <div className="panel flex items-center justify-center rounded-2xl p-10">
          <p className="text-sm text-muted">Elige una consulta de la lista.</p>
        </div>
      ) : (
        <div className="panel flex flex-col rounded-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-panel-border px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Consulta abierta {haceCuanto(activo.created_at)}</p>
              <p className="truncate text-xs text-muted">{activo.motivo}</p>
            </div>
            <button
              type="button"
              onClick={cerrar}
              className="shrink-0 rounded-full border border-panel-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
            >
              Cerrar ticket
            </button>
          </div>

          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto px-5 py-4">
            <AnimatePresence initial={false}>
              {mensajes.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.autor_rol === "admin"
                      ? "accent-gradient self-end text-white"
                      : "self-start border border-panel-border bg-panel-soft text-foreground"
                  }`}
                >
                  {m.contenido}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={finRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-panel-border px-5 py-4">
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && responder()}
              maxLength={4000}
              placeholder={`Responder como ${legalConfig.soporteNombre}…`}
              className="flex-1 rounded-full border border-panel-border bg-panel-soft px-4 py-2 text-sm outline-none focus:border-ice/50"
            />
            <motion.button
              type="button"
              onClick={responder}
              disabled={!texto.trim()}
              whileHover={texto.trim() ? { scale: 1.05 } : {}}
              whileTap={texto.trim() ? { scale: 0.94 } : {}}
              className="accent-gradient shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Enviar
            </motion.button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
