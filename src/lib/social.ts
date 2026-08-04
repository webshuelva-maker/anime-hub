"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Apartado Conectar: descubrir perfiles.
 *
 * La app elige automáticamente a quién ves y en qué orden (por gustos en
 * común); la persona solo dice "me interesa" o "paso". Hay coincidencia
 * cuando los dos dicen que sí.
 *
 * Todo va contra funciones de la base de datos, no contra las tablas.
 * No es un capricho: la tabla de perfiles sociales guarda la fecha de
 * nacimiento exacta, y abrirla a la lectura ajena para poder enseñar
 * candidatos la expondría entera. Las funciones devuelven solo alias,
 * edad en años, cómo se identifica y la biografía.
 */

export interface PerfilCandidato {
  user_id: string;
  alias: string;
  edad: number;
  genero: string;
  bio: string | null;
  afinidad: number;
  titulos_comunes: string[];
  generos_comunes: string[];
}

export interface Coincidencia {
  user_id: string;
  alias: string;
  edad: number;
  genero: string;
  bio: string | null;
  desde: string;
}

export type Decision = "interesa" | "paso";

export async function descubrirPerfiles(limite = 20): Promise<PerfilCandidato[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("descubrir_perfiles", { limite });
  if (error) return [];
  return (data as PerfilCandidato[]) ?? [];
}

/** Devuelve true si ha salido coincidencia. */
export async function decidirPerfil(objetivo: string, decision: Decision): Promise<boolean> {
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

/**
 * Bloquear. Está disponible desde el primer momento y no al final del
 * recorrido a propósito: la persona que necesita bloquear a alguien lo
 * necesita YA, no después de dos pantallas.
 */
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
 * Denunciar. El usuario puede crear denuncias pero no leerlas ni
 * borrarlas — una denuncia que se puede retirar desde la app no sirve
 * como denuncia. Se bloquea también, porque quien denuncia casi nunca
 * quiere seguir viendo a esa persona.
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
  if (error) return false;

  await bloquear(objetivo);
  return true;
}

/** Cómo contar la afinidad sin enseñar la puntuación, que no dice nada. */
export function motivoAfinidad(p: PerfilCandidato): string | null {
  const t = p.titulos_comunes.length;
  const g = p.generos_comunes.length;
  if (t === 0 && g === 0) return null;
  if (t > 0 && g > 0) {
    return `Coincidís en ${t} ${t === 1 ? "serie" : "series"} y ${g} ${
      g === 1 ? "género" : "géneros"
    }`;
  }
  if (t > 0) return `Coincidís en ${t} ${t === 1 ? "serie" : "series"}`;
  return `Coincidís en ${g} ${g === 1 ? "género" : "géneros"}`;
}
