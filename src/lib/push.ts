"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Notificaciones push.
 *
 * Tres cosas que conviene tener claras porque condicionan todo lo demás:
 *
 * 1. En iPhone SOLO funcionan si la app está añadida a la pantalla de
 *    inicio. Desde Safari normal, la API ni existe. Por eso hay que
 *    comprobar disponibilidad antes de ofrecer nada, o se enseña un
 *    botón que no puede funcionar.
 * 2. El permiso solo se puede pedir a raíz de un gesto del usuario (un
 *    clic). Pedirlo al cargar la página lo bloquean los navegadores.
 * 3. Si alguien lo deniega, no se puede volver a preguntar por código:
 *    tiene que ir a los ajustes del navegador. De ahí que se avise antes
 *    de pedirlo en vez de soltar el diálogo del sistema a bocajarro.
 */

export type EstadoPush = "no-disponible" | "sin-permiso" | "denegado" | "activo";

/** Último motivo por el que falló activarPush, para poder enseñarlo. */
export let ultimoErrorPush: string | null = null;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  // Se construye sobre un ArrayBuffer explícito: el tipo por defecto de
  // Uint8Array admite también SharedArrayBuffer, y pushManager.subscribe
  // no lo acepta.
  const buffer = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
  return buffer;
}

export function pushDisponible(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** ¿Está la app instalada en la pantalla de inicio? (obligatorio en iOS) */
export function appInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari en iOS usa esta propiedad suya en vez del display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function getEstadoPush(): Promise<EstadoPush> {
  if (!pushDisponible()) return "no-disponible";
  if (Notification.permission === "denied") return "denegado";
  if (Notification.permission !== "granted") return "sin-permiso";

  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager.getSubscription();
  if (!suscripcion) return "sin-permiso";

  // No basta con que el navegador esté suscrito: si esa suscripción no
  // está guardada en la base de datos, el servidor no sabe a dónde
  // enviar y no llega nada. Antes solo se miraba el navegador, así que
  // el botón decía "activo" con el servidor completamente a ciegas.
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return "sin-permiso";

  const { data } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", suscripcion.endpoint)
    .maybeSingle();

  return data ? "activo" : "sin-permiso";
}

/**
 * Pide permiso, registra el service worker y guarda la suscripción.
 * Devuelve el estado en el que ha quedado.
 */
export async function activarPush(): Promise<EstadoPush> {
  if (!pushDisponible()) return "no-disponible";

  const permiso = await Notification.requestPermission();
  if (permiso === "denied") return "denegado";
  if (permiso !== "granted") return "sin-permiso";

  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!clavePublica) return "no-disponible";

  const registro = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const suscripcion =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      // Obligatorio: el navegador no permite suscripciones silenciosas,
      // toda notificación recibida tiene que enseñarse.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(clavePublica),
    }));

  const datos = suscripcion.toJSON();
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user || !datos.keys) {
    ultimoErrorPush = "No hay sesión iniciada en este dispositivo.";
    return "sin-permiso";
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userData.user.id,
      endpoint: suscripcion.endpoint,
      p256dh: datos.keys.p256dh,
      auth: datos.keys.auth,
    },
    { onConflict: "endpoint" }
  );

  // Este error NO se puede ignorar. El navegador ya se ha suscrito, así
  // que sin esta comprobación el botón diría "activo" aunque el servidor
  // no tenga ni idea de que este dispositivo existe — y los avisos no
  // llegarían nunca, sin nada a la vista que lo explique. Pasó justo eso.
  if (error) {
    ultimoErrorPush = `El dispositivo no se pudo guardar: ${error.message} (código ${error.code ?? "?"})`;
    return "sin-permiso";
  }

  ultimoErrorPush = null;
  return "activo";
}

export async function desactivarPush(): Promise<void> {
  if (!pushDisponible()) return;
  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager.getSubscription();
  if (!suscripcion) return;

  const endpoint = suscripcion.endpoint;
  await suscripcion.unsubscribe();

  const supabase = createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
