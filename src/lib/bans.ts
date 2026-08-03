"use client";

import { createClient } from "./supabase/client";

/**
 * Sanciones: consulta desde el cliente.
 *
 * La comprobación de verdad la hace la base de datos (función
 * sancion_activa, con las políticas de acceso puestas). Aquí solo se
 * pregunta y se muestra: nadie queda "no sancionado" por trastear con el
 * navegador, porque lo que protege los datos son las políticas del
 * servidor, no esta pantalla.
 */

export interface Sancion {
  tipo: "temporal" | "permanente";
  motivo: string;
  hasta: string | null;
}

export async function sancionActiva(): Promise<Sancion | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;

  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;

    const { data, error } = await supabase.rpc("sancion_activa", { uid: auth.user.id });
    if (error || !data || data.length === 0) return null;

    const s = data[0] as Sancion;
    return { tipo: s.tipo, motivo: s.motivo, hasta: s.hasta };
  } catch {
    // Ante la duda, se deja pasar: es preferible a dejar a alguien fuera
    // por un fallo de red.
    return null;
  }
}

/** Texto de cuánto queda, para la pantalla de aviso. */
export function tiempoRestante(hasta: string | null): string {
  if (!hasta) return "";
  const ms = new Date(hasta).getTime() - Date.now();
  if (ms <= 0) return "ya ha terminado";

  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return `${Math.max(1, Math.floor(ms / 60_000))} minutos`;
  if (horas < 24) return `${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(horas / 24);
  return `${dias} ${dias === 1 ? "día" : "días"}`;
}
