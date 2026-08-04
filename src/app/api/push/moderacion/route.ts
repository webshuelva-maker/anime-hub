import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const maxDuration = 30;

/**
 * Avisa al móvil de alguien que ha recibido un aviso o una sanción.
 *
 * Solo puede llamarlo un administrador, y eso se comprueba AQUÍ contra la
 * base de datos (función es_admin), no fiándose de lo que diga el
 * navegador. Sin esa comprobación, esto sería un botón abierto para
 * mandar notificaciones al dispositivo de cualquiera diciendo que ha
 * sido sancionado.
 *
 * El envío en sí necesita la clave privada VAPID y leer las
 * suscripciones de otra persona, que las políticas impiden desde el
 * cliente: de ahí que viva en el servidor con la clave de servicio.
 */
export async function POST(request: NextRequest) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!publicKey || !privateKey || !supabaseUrl || !serviceKey) {
    // Sin configurar no es un error: la sanción o el aviso ya están
    // guardados y se verán en la app igual.
    return NextResponse.json({ enviado: false, motivo: "sin-configurar" });
  }

  const body: { userId?: string; tipo?: "aviso" | "sancion"; texto?: string } = await request
    .json()
    .catch(() => ({}));

  if (!body.userId || !body.tipo) {
    return NextResponse.json({ enviado: false, motivo: "faltan-datos" }, { status: 400 });
  }

  // ¿Quien pide el envío es administrador de verdad? Lo dice la base de
  // datos leyendo la sesión de las cookies.
  const sesion = await createServerClient();
  const { data: esAdmin } = await sesion.rpc("es_admin");
  if (esAdmin !== true) {
    return NextResponse.json({ enviado: false, motivo: "no-autorizado" }, { status: 403 });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: suscripciones } = await admin
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", body.userId);

  if (!suscripciones?.length) {
    return NextResponse.json({ enviado: false, motivo: "sin-dispositivos" });
  }

  webpush.setVapidDetails("mailto:soporte@anime-hub.app", publicKey, privateKey);

  const carga = JSON.stringify({
    titulo: body.tipo === "aviso" ? "Aviso de moderación" : "Tu cuenta ha sido sancionada",
    cuerpo: (body.texto ?? "Abre la app para leer los detalles").slice(0, 140),
    url: "/noticias",
    etiqueta: `moderacion-${body.tipo}`,
  });

  const resultados = await Promise.allSettled(
    suscripciones.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        carga
      )
    )
  );

  // Las suscripciones caducadas devuelven 404/410: se limpian, o se
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
