import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * Avisa a la OTRA parte de un ticket cuando llega un mensaje.
 *
 * Antes solo se avisaba al crear el ticket, así que una conversación en
 * marcha era invisible: si el administrador contestaba una hora después,
 * el usuario no se enteraba, y viceversa. Ahora cada mensaje avisa a quien
 * no lo ha escrito.
 *
 * Va en el servidor por lo mismo de siempre: la clave privada VAPID no
 * puede salir de aquí, y para saber a qué dispositivos enviar hay que
 * leer suscripciones ajenas, que las políticas impiden desde el cliente.
 */
export async function POST(request: NextRequest) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!publicKey || !privateKey || !supabaseUrl || !serviceKey) {
    return NextResponse.json({ enviado: false, motivo: "sin-configurar" });
  }

  const body: { ticketId?: string; rolEmisor?: "usuario" | "admin"; texto?: string } = await request
    .json()
    .catch(() => ({}));

  if (!body.ticketId || !body.rolEmisor) {
    return NextResponse.json({ enviado: false, motivo: "faltan-datos" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, user_id, estado")
    .eq("id", body.ticketId)
    .maybeSingle();

  // En un ticket cerrado no se avisa a nadie: ya no hay conversación.
  if (!ticket || ticket.estado === "cerrado") {
    return NextResponse.json({ enviado: false, motivo: "ticket-no-activo" });
  }

  // A quién avisar: al contrario de quien ha escrito.
  let destinatarios: string[];
  let titulo: string;
  let url: string;

  if (body.rolEmisor === "usuario") {
    const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
    destinatarios = (admins ?? []).map((a) => a.id);
    titulo = "Mensaje nuevo en una consulta";
    // Con el ticket en la dirección, al tocar el aviso se abre esa
    // conversación concreta en vez de la lista.
    url = `/admin/soporte?ticket=${ticket.id}`;
  } else {
    destinatarios = [ticket.user_id];
    titulo = "Respuesta del administrador";
    url = "/soporte";
  }

  if (destinatarios.length === 0) {
    return NextResponse.json({ enviado: false, motivo: "sin-destinatarios" });
  }

  const { data: suscripciones } = await admin
    .from("push_subscriptions")
    .select("*")
    .in("user_id", destinatarios);

  if (!suscripciones?.length) {
    return NextResponse.json({ enviado: false, motivo: "sin-dispositivos" });
  }

  webpush.setVapidDetails("mailto:soporte@anime-hub.app", publicKey, privateKey);

  const carga = JSON.stringify({
    titulo,
    cuerpo: (body.texto ?? "").slice(0, 120) || "Toca para abrir la conversación",
    url,
    // Misma etiqueta por ticket: los mensajes seguidos de una misma
    // conversación se sustituyen en vez de apilar veinte avisos.
    etiqueta: `ticket-${ticket.id}`,
  });

  const resultados = await Promise.allSettled(
    suscripciones.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        carga
      )
    )
  );

  const caducadas: string[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "rejected") {
      const codigo = (r.reason as { statusCode?: number })?.statusCode;
      if (codigo === 404 || codigo === 410) caducadas.push(suscripciones[i].endpoint);
    }
  });
  if (caducadas.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", caducadas);
  }

  const enviados = resultados.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ enviado: enviados > 0, dispositivos: enviados });
}
