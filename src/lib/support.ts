"use client";

import { createClient } from "@/lib/supabase/client";

export type EstadoTicket = "abierto" | "atendido" | "cerrado";

export interface Ticket {
  id: string;
  user_id: string;
  estado: EstadoTicket;
  asunto: string | null;
  motivo: string | null;
  admin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MensajeSoporte {
  id: string;
  ticket_id: string;
  autor_id: string | null;
  autor_rol: "usuario" | "admin";
  contenido: string;
  created_at: string;
}

/**
 * Tickets de soporte y moderación.
 *
 * Toda la seguridad de verdad vive en las políticas de la base de datos
 * (ver supabase/schema.sql): quién puede ver qué ticket, y que nadie
 * pueda escribir haciéndose pasar por administrador. Aquí solo se llama;
 * si alguien se saltara esta capa desde la consola del navegador, se
 * seguiría chocando con las mismas reglas.
 */

/** ¿La persona conectada es administrador? Lo dice la base de datos. */
export async function esAdministrador(): Promise<boolean> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();
  return data?.is_admin === true;
}

/**
 * Devuelve el ticket vivo del usuario (abierto o ya atendido), si lo hay.
 * Se reutiliza en vez de crear uno nuevo cada vez: si alguien pide ayuda
 * dos veces seguidas no deberían aparecerle dos conversaciones sueltas.
 */
export async function getTicketActivo(): Promise<Ticket | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("user_id", userData.user.id)
    .in("estado", ["abierto", "atendido"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as Ticket) ?? null;
}

export async function abrirTicket(motivo: string, asunto?: string): Promise<Ticket | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const existente = await getTicketActivo();
  if (existente) return existente;

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({ user_id: userData.user.id, motivo, asunto: asunto ?? null })
    .select()
    .single();

  if (error) return null;
  return data as Ticket;
}

export async function getMensajes(ticketId: string): Promise<MensajeSoporte[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("support_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  return (data as MensajeSoporte[]) ?? [];
}

export async function enviarMensaje(
  ticketId: string,
  contenido: string,
  rol: "usuario" | "admin"
): Promise<boolean> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;

  const { error } = await supabase.from("support_messages").insert({
    ticket_id: ticketId,
    autor_id: userData.user.id,
    autor_rol: rol,
    contenido: contenido.trim(),
  });

  if (!error) {
    // Sirve para ordenar en el panel por "quién lleva más tiempo
    // esperando respuesta".
    await supabase
      .from("support_tickets")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", ticketId);
  }
  return !error;
}

/** Un administrador coge el ticket: pasa a "atendido" y queda a su nombre. */
export async function atenderTicket(ticketId: string): Promise<boolean> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;

  const { error } = await supabase
    .from("support_tickets")
    .update({ estado: "atendido", admin_id: userData.user.id, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  return !error;
}

export async function cerrarTicket(ticketId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("support_tickets")
    .update({ estado: "cerrado", updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  return !error;
}

/** Todos los tickets sin cerrar, para el panel de administración. */
export async function getTicketsPendientes(): Promise<Ticket[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("support_tickets")
    .select("*")
    .in("estado", ["abierto", "atendido"])
    .order("created_at", { ascending: true });
  return (data as Ticket[]) ?? [];
}

/**
 * Escucha los mensajes nuevos de un ticket. Devuelve la función para
 * dejar de escuchar — hay que llamarla al desmontar o se acumulan
 * suscripciones abiertas.
 */
export function escucharMensajes(ticketId: string, alLlegar: (m: MensajeSoporte) => void): () => void {
  const supabase = createClient();
  const canal = supabase
    .channel(`ticket-${ticketId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` },
      (payload) => alLlegar(payload.new as MensajeSoporte)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}

/** Escucha cambios de estado del ticket (por ejemplo, que lo cojan). */
export function escucharTicket(ticketId: string, alCambiar: (t: Ticket) => void): () => void {
  const supabase = createClient();
  const canal = supabase
    .channel(`ticket-estado-${ticketId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` },
      (payload) => alCambiar(payload.new as Ticket)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}

/** Escucha tickets nuevos, para el panel de administración. */
export function escucharTicketsNuevos(alLlegar: (t: Ticket) => void): () => void {
  const supabase = createClient();
  const canal = supabase
    .channel("tickets-nuevos")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "support_tickets" },
      (payload) => alLlegar(payload.new as Ticket)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}

/*
 * Presencia: ¿hay un administrador mirando este ticket AHORA?
 *
 * El estado del ticket no sirve para esto. "atendido" solo dice que
 * alguien lo cogió en algún momento, y se queda así para siempre — por
 * eso antes ponía "Conectado" aunque el administrador hubiera cerrado la
 * pestaña hace horas. Eso es peor que no decir nada: alguien que ha
 * denunciado algo se queda escribiendo creyendo que le leen.
 *
 * Se usa la presencia de Supabase, que mantiene una lista de quién está
 * suscrito al canal y la actualiza sola cuando alguien se va o pierde la
 * conexión. Es información real del momento, no un estado guardado.
 */
const canalPresencia = (ticketId: string) => `presencia-ticket-${ticketId}`;

/** El administrador se anuncia mientras tiene el ticket abierto. */
export function anunciarAdminPresente(ticketId: string, adminId: string): () => void {
  const supabase = createClient();
  const canal = supabase.channel(canalPresencia(ticketId), {
    config: { presence: { key: adminId } },
  });

  canal.subscribe((estado) => {
    if (estado === "SUBSCRIBED") void canal.track({ rol: "admin" });
  });

  return () => {
    void supabase.removeChannel(canal);
  };
}

/** El usuario observa si hay algún administrador dentro en este momento. */
export function observarAdminPresente(ticketId: string, alCambiar: (presente: boolean) => void): () => void {
  const supabase = createClient();
  const canal = supabase.channel(canalPresencia(ticketId));

  const recalcular = () => {
    const estado = canal.presenceState<{ rol?: string }>();
    const hayAdmin = Object.values(estado).some((entradas) =>
      entradas.some((e) => e.rol === "admin")
    );
    alCambiar(hayAdmin);
  };

  canal
    .on("presence", { event: "sync" }, recalcular)
    .on("presence", { event: "join" }, recalcular)
    .on("presence", { event: "leave" }, recalcular)
    .subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}
