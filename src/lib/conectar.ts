"use client";

import { createClient } from "@/lib/supabase/client";
import { getPreferences } from "@/lib/storage";

/**
 * Conectar — fase 1: descubrir perfiles.
 *
 * Todo lo que decide algo vive en la base de datos, no aquí:
 *
 *  - A quién se enseña y en qué orden: descubrir_perfiles.
 *  - Si dos personas han coincidido: decidir_perfil.
 *
 * No es manía de arquitectura. Para ordenar por afinidad hay que
 * comparar tus gustos con los de otra persona, y para saber si hay
 * coincidencia hay que mirar lo que el otro decidió sobre ti. Si eso se
 * calculara en el navegador, habría que MANDARLE al navegador los gustos
 * y las decisiones ajenas — o sea, cualquiera podría abrir las
 * herramientas de desarrollo y ver quién le ha dicho que no.
 */

export interface PerfilDescubierto {
  user_id: string;
  alias: string;
  edad: number;
  gender: string;
  bio: string | null;
  avatar_id: string | null;
  afinidad: number;
  generos_comunes: string[];
  estudios_comunes: string[];
  favoritos_comunes: string[];
}

export interface Coincidencia {
  user_id: string;
  alias: string;
  edad: number;
  avatar_id: string | null;
  desde: string;
}

/**
 * Sube al perfil social los gustos que la app ya conoce.
 *
 * Se llama al entrar en Conectar y no en cada cambio: son los mismos
 * datos que ya usa el feed, y lo único que hace falta es que estén
 * arriba para poder comparar. Si falla, no se rompe nada — simplemente
 * se ordena con los gustos de la última vez.
 */
export async function sincronizarGustos(): Promise<void> {
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const prefs = getPreferences();
    await supabase
      .from("social_profiles")
      .update({
        generos: prefs.genres ?? [],
        estudios: prefs.studios ?? [],
        favoritos: prefs.favoriteTitles ?? [],
        avatar_id: prefs.avatarId ?? null,
        gustos_en: new Date().toISOString(),
      })
      .eq("user_id", auth.user.id);
  } catch {
    // Sin gustos subidos se sigue pudiendo descubrir gente, solo que el
    // orden será menos fino. No merece cortar la pantalla por esto.
  }
}

export async function descubrirPerfiles(limite = 12): Promise<PerfilDescubierto[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("descubrir_perfiles", { limite });
  if (error) return [];
  return (data as PerfilDescubierto[]) ?? [];
}

/** Devuelve true si ha habido coincidencia (los dos dijeron que sí). */
export async function decidir(objetivo: string, decision: "interesa" | "paso"): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("decidir_perfil", { objetivo, decision });
  if (error) return false;
  return data === true;
}

export async function misCoincidencias(): Promise<Coincidencia[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("mis_coincidencias");
  if (error) return [];
  return (data as Coincidencia[]) ?? [];
}

/** Bloquear a alguien. Desaparece para los dos, en los dos sentidos. */
export async function bloquear(objetivo: string): Promise<boolean> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { error } = await supabase
    .from("social_blocks")
    .insert({ blocker_id: auth.user.id, blocked_id: objetivo });
  return !error;
}

/**
 * Denunciar. El usuario puede crearla pero no leerla ni retirarla: una
 * denuncia que se puede borrar desde la app no sirve para nada.
 */
export async function denunciar(
  objetivo: string,
  motivo: string,
  detalles?: string
): Promise<boolean> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { error } = await supabase.from("social_reports").insert({
    reporter_id: auth.user.id,
    reported_id: objetivo,
    reason: motivo,
    details: detalles ?? null,
  });
  return !error;
}

/** Motivos de denuncia. Cortos y sin ambigüedad, para que se usen. */
export const MOTIVOS_DENUNCIA = [
  "Acoso o insultos",
  "Contenido sexual no deseado",
  "Parece menor de edad",
  "Suplantación o perfil falso",
  "Spam o estafa",
  "Otra cosa",
] as const;
