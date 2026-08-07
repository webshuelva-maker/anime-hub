import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const maxDuration = 20;

/**
 * Avisa al teléfono de alguien de que le están llamando.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ HACE FALTA ESTO
 *
 * La llamada viaja por un canal de Supabase, y a un canal solo se le
 * escucha con la app abierta. O sea que llamar a alguien que tiene el
 * teléfono en el bolsillo no hacía absolutamente nada: para enterarse
 * tenía que estar dentro de la app justo en ese momento, que es
 * exactamente lo contrario de para lo que sirve una llamada.
 *
 * Esto manda un aviso al sistema operativo, que sí llega con la app
 * cerrada. El aviso no es la llamada: es el golpecito en el hombro para
 * que abra la app, y entonces la llamada le entra por el canal de
 * siempre. Por eso quien llama sigue reenviando la oferta mientras
 * suena — para que quien acaba de abrir la encuentre esperándole.
 *
 * SOLO se permite avisar a alguien con quien ya hay coincidencia. Sin
 * esa comprobación esto sería un botón para hacer sonar el teléfono de
 * cualquiera.
 * ---------------------------------------------------------------------
 */
export async function POST(request: NextRequest) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!publicKey || !privateKey || !supabaseUrl || !serviceKey) {
    return NextResponse.json({ enviado: false, motivo: "sin-configurar" });
  }

  const body: { aQuien?: string; alias?: string } = await request.json().catch(() => ({}));
  if (!body.aQuien) {
    return NextResponse.json({ enviado: false, motivo: "faltan-datos" }, { status: 400 });
  }

  const sesion = await createServerClient();
  const { data: auth } = await sesion.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ enviado: false, motivo: "sin-sesion" }, { status: 401 });
  }

  // ¿Existe la coincidencia? Se pregunta con la sesión de quien llama,
  // así que las políticas de la tabla hacen de segundo cerrojo.
  const a = auth.user.id < body.aQuien ? auth.user.id : body.aQuien;
  const b = auth.user.id < body.aQuien ? body.aQuien : auth.user.id;
  const { data: coincidencia } = await sesion
    .from("social_matches")
    .select("usuario_a")
    .eq("usuario_a", a)
    .eq("usuario_b", b)
    .maybeSingle();

  if (!coincidencia) {
    return NextResponse.json({ enviado: false, motivo: "sin-coincidencia" }, { status: 403 });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: suscripciones } = await admin
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", body.aQuien);

  if (!suscripciones?.length) {
    return NextResponse.json({ enviado: false, motivo: "sin-dispositivos" });
  }

  webpush.setVapidDetails("mailto:soporte@anime-hub.app", publicKey, privateKey);

  const carga = JSON.stringify({
    tipo: "llamada",
    titulo: "Llamada entrante",
    cuerpo: `${(body.alias ?? "Alguien").slice(0, 40)} te está llamando`,
    url: "/conectar",
    // Etiqueta fija: si se llama dos veces seguidas, la segunda sustituye
    // a la primera en lugar de dejar dos avisos.
    etiqueta: "llamada-entrante",
  });

  const resultados = await Promise.allSettled(
    suscripciones.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        carga,
        // Máxima urgencia y vida corta: si no llega en un minuto, la
        // llamada ya habrá terminado y el aviso solo confunde.
        { urgency: "high", TTL: 60 }
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
