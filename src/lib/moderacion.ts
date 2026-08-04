"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Moderación de miembros.
 *
 * Hasta v150 solo se podía sancionar a quien tuviera un ticket abierto,
 * porque el único sitio desde donde se moderaba era la conversación de
 * soporte. Eso dejaba fuera exactamente los casos que importan: nadie
 * abre un ticket para avisar de que está acosando a otro.
 *
 * Aquí solo se llama. Quién puede ver y hacer qué lo deciden las
 * políticas y las funciones de la base de datos (ver
 * supabase/schema.sql): listar_miembros se niega a devolver nada si
 * quien pregunta no es administrador, y saltarse esta capa desde la
 * consola del navegador no cambia eso.
 */

export type Gravedad = "leve" | "normal" | "grave";

export interface Miembro {
  id: string;
  nombre: string | null;
  alias: string | null;
  email: string | null;
  creado_en: string;
  es_administrador: boolean;
  sancion_tipo: "temporal" | "permanente" | null;
  sancion_motivo: string | null;
  sancion_hasta: string | null;
  avisos: number;
}

export interface Aviso {
  id: string;
  user_id: string;
  motivo: string;
  gravedad: Gravedad;
  creado_en: string;
  leido_en: string | null;
}

export interface SancionEnVivo {
  id: string;
  user_id: string;
  tipo: "temporal" | "permanente";
  motivo: string;
  hasta: string | null;
  levantada_en: string | null;
}

/** Miembros que encajan con la búsqueda (vacía = los últimos en entrar). */
export async function buscarMiembros(busqueda: string, limite = 40): Promise<Miembro[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("listar_miembros", {
    busqueda: busqueda.trim(),
    limite,
  });
  if (error) return [];
  return (data as Miembro[]) ?? [];
}

/**
 * Manda un aviso. Devuelve el error en texto (o null si fue bien) para
 * poder enseñarlo tal cual: un "no se ha podido" sin decir por qué
 * obliga a adivinar, y aquí el motivo suele ser que falta ejecutar el
 * SQL nuevo.
 */
export async function avisarMiembro(
  userId: string,
  motivo: string,
  gravedad: Gravedad
): Promise<string | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();

  const { error } = await supabase.from("user_warnings").insert({
    user_id: userId,
    motivo: motivo.trim(),
    gravedad,
    creado_por: auth.user?.id ?? null,
  });
  if (error) return error.message;

  // El aviso al móvil es un extra: si falla, el aviso ya está guardado y
  // le saldrá igual en cuanto abra la app.
  void fetch("/api/push/moderacion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, tipo: "aviso", texto: motivo.trim() }),
  }).catch(() => {});

  return null;
}

/** Los avisos de una persona, para el historial del panel. */
export async function avisosDe(userId: string): Promise<Aviso[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_warnings")
    .select("id, user_id, motivo, gravedad, creado_en, leido_en")
    .eq("user_id", userId)
    .order("creado_en", { ascending: false });
  return (data as Aviso[]) ?? [];
}

/** Mis avisos sin leer. Lo usa la pantalla que se le enseña al usuario. */
export async function misAvisosSinLeer(): Promise<Aviso[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];

    const { data } = await supabase
      .from("user_warnings")
      .select("id, user_id, motivo, gravedad, creado_en, leido_en")
      .eq("user_id", auth.user.id)
      .is("leido_en", null)
      .order("creado_en", { ascending: true });
    return (data as Aviso[]) ?? [];
  } catch {
    return [];
  }
}

export async function marcarAvisoLeido(avisoId: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.rpc("marcar_aviso_leido", { aviso_id: avisoId });
  } catch {
    // Si falla, volverá a salir en la siguiente sesión. Es el fallo
    // menos malo de los dos posibles.
  }
}

/**
 * Escucha los avisos nuevos dirigidos a esta persona. Devuelve la
 * función para dejar de escuchar.
 */
export function escucharMisAvisos(userId: string, alLlegar: (a: Aviso) => void): () => void {
  const supabase = createClient();
  const canal = supabase
    .channel(`avisos-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "user_warnings", filter: `user_id=eq.${userId}` },
      (payload) => alLlegar(payload.new as Aviso)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}

/**
 * Escucha las sanciones de esta persona: tanto las nuevas (INSERT, para
 * que la expulsión aparezca en el momento) como los cambios (UPDATE,
 * para que al levantarla recupere el acceso sin recargar).
 */
export function escucharMisSanciones(
  userId: string,
  alCambiar: (s: SancionEnVivo, evento: "alta" | "cambio") => void
): () => void {
  const supabase = createClient();
  const canal = supabase
    .channel(`sanciones-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "user_bans", filter: `user_id=eq.${userId}` },
      (payload) => alCambiar(payload.new as SancionEnVivo, "alta")
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "user_bans", filter: `user_id=eq.${userId}` },
      (payload) => alCambiar(payload.new as SancionEnVivo, "cambio")
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}

/** Nombre con el que enseñar a alguien en el panel, con lo que haya. */
export function nombreVisible(m: Miembro): string {
  return m.alias?.trim() || m.nombre?.trim() || m.email?.split("@")[0] || "Sin nombre";
}
