import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * Envía un aviso de prueba al propio administrador y cuenta con detalle
 * qué ha pasado.
 *
 * Existe porque cuando un push no llega puede fallar en seis sitios
 * distintos (falta una variable, la clave no vale, no hay suscripción
 * guardada, el navegador la rechaza...) y desde fuera se ve exactamente
 * igual: no pasa nada. Adivinar cuál de los seis es puede llevar horas;
 * preguntárselo al servidor, un segundo.
 */
export async function POST(request: NextRequest) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const faltan: string[] = [];
  if (!publicKey) faltan.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (!privateKey) faltan.push("VAPID_PRIVATE_KEY");
  if (!supabaseUrl) faltan.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) faltan.push("SUPABASE_SERVICE_ROLE_KEY");
  if (faltan.length > 0) {
    return NextResponse.json({
      ok: false,
      detalle: `Faltan variables de entorno en Vercel: ${faltan.join(", ")}. Después de añadirlas hay que volver a desplegar.`,
    });
  }

  const body: { userId?: string } = await request.json().catch(() => ({}));
  if (!body.userId) {
    return NextResponse.json({ ok: false, detalle: "No se ha recibido el usuario." });
  }

  const admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } });

  // ¿La clave de servicio es válida? Si no lo es, todo lo demás falla
  // por el mismo sitio y sin decir por qué.
  const { error: errorPerfil } = await admin.from("profiles").select("id").limit(1);
  if (errorPerfil) {
    return NextResponse.json({
      ok: false,
      detalle: `La clave de servicio de Supabase no funciona: ${errorPerfil.message}. Revisa SUPABASE_SERVICE_ROLE_KEY en Vercel (tiene que ser la "service_role"/secret, no la anon).`,
    });
  }

  const { data: suscripciones } = await admin
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", body.userId);

  if (!suscripciones?.length) {
    return NextResponse.json({
      ok: false,
      detalle:
        "No hay ningún dispositivo registrado para tu usuario. Pulsa \"Activar avisos\" en el dispositivo donde quieras recibirlos (en iPhone, con la app abierta desde la pantalla de inicio).",
    });
  }

  webpush.setVapidDetails("mailto:soporte@anime-hub.app", publicKey!, privateKey!);

  const carga = JSON.stringify({
    titulo: "Aviso de prueba",
    cuerpo: "Si ves esto, las notificaciones funcionan.",
    url: "/admin/soporte",
    etiqueta: "prueba",
  });

  const resultados = await Promise.allSettled(
    suscripciones.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        carga
      )
    )
  );

  const fallos = resultados
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => {
      const e = r.reason as { statusCode?: number; body?: string; message?: string };
      return `${e?.statusCode ?? "?"} ${e?.body || e?.message || "sin detalle"}`;
    });

  const enviados = resultados.filter((r) => r.status === "fulfilled").length;

  if (enviados === 0) {
    return NextResponse.json({
      ok: false,
      detalle: `El servidor intentó enviar a ${suscripciones.length} dispositivo(s) y todos fallaron: ${fallos.join(" | ").slice(0, 400)}`,
    });
  }

  return NextResponse.json({
    ok: true,
    detalle: `Enviado a ${enviados} dispositivo(s). Si no te llega nada, el problema está en el dispositivo (permisos o ahorro de batería).${
      fallos.length > 0 ? ` Fallaron ${fallos.length}: ${fallos.join(" | ").slice(0, 200)}` : ""
    }`,
  });
}
