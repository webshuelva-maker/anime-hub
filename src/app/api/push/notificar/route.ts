import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * Avisa a los administradores de que hay un ticket nuevo.
 *
 * Se hace en el servidor, y no desde el navegador, por dos motivos que no
 * son negociables:
 *
 * 1. La clave privada VAPID firma los envíos. Si estuviera en el cliente,
 *    cualquiera podría mandar notificaciones en nombre de la app.
 * 2. Para saber a qué dispositivos enviar hay que leer las suscripciones
 *    de OTRA persona (los administradores), y las políticas de la base de
 *    datos lo impiden a propósito. Aquí se usa la clave de servicio, que
 *    se las salta — por eso esa clave nunca puede salir del servidor.
 *
 * Además se comprueba que quien pide el envío tiene de verdad un ticket
 * abierto: si no, esto sería un botón para spamear al administrador.
 */
export async function POST(request: NextRequest) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!publicKey || !privateKey || !supabaseUrl || !serviceKey) {
    // Sin configurar no es un error del usuario: el ticket ya se ha
    // creado igual, simplemente no sale el aviso.
    return NextResponse.json({ enviado: false, motivo: "sin-configurar" });
  }

  const body: { ticketId?: string; motivo?: string } = await request.json().catch(() => ({}));
  if (!body.ticketId) {
    return NextResponse.json({ enviado: false, motivo: "falta-ticket" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Que el ticket exista de verdad y esté sin atender. Evita que se pueda
  // llamar a esto en bucle para reventar el móvil del administrador.
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, estado")
    .eq("id", body.ticketId)
    .maybeSingle();

  if (!ticket || ticket.estado !== "abierto") {
    return NextResponse.json({ enviado: false, motivo: "ticket-no-valido" }, { status: 400 });
  }

  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  const idsAdmin = (admins ?? []).map((a) => a.id);
  if (idsAdmin.length === 0) {
    return NextResponse.json({ enviado: false, motivo: "sin-administradores" });
  }

  const { data: suscripciones } = await admin
    .from("push_subscriptions")
    .select("*")
    .in("user_id", idsAdmin);

  if (!suscripciones?.length) {
    return NextResponse.json({ enviado: false, motivo: "sin-dispositivos" });
  }

  webpush.setVapidDetails("mailto:soporte@anime-hub.app", publicKey, privateKey);

  const carga = JSON.stringify({
    titulo: "Consulta nueva en Anime Hub",
    cuerpo: (body.motivo ?? "Alguien necesita ayuda").slice(0, 120),
    url: "/admin/soporte",
    etiqueta: `ticket-${body.ticketId}`,
  });

  const resultados = await Promise.allSettled(
    suscripciones.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        carga
      )
    )
  );

  // Las suscripciones caducadas devuelven 404/410. Se limpian, o se
  // acumulan dispositivos muertos a los que se intenta enviar siempre.
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
