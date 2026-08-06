"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Moderación de denuncias.
 *
 * Hasta la v196 una denuncia se podía crear pero no leer desde la app:
 * la política de la tabla solo dejaba insertar. Esto añade la otra
 * mitad. Igual que en moderacion.ts, aquí solo se llama — quién puede
 * ver y hacer qué lo deciden las políticas y las funciones de la base de
 * datos (ver supabase/schema.sql, v196): listar_denuncias se niega en
 * seco si quien pregunta no es administrador.
 */

export type EstadoDenuncia = "pendiente" | "resuelta" | "descartada";

export interface Denuncia {
  id: string;
  created_at: string;
  reporter_id: string | null;
  reporter_alias: string | null;
  reported_id: string;
  reported_alias: string | null;
  reason: string;
  details: string | null;
  status: EstadoDenuncia;
  resolucion: string | null;
  resuelto_en: string | null;
  hay_conversacion: boolean;
}

/** Un mensaje tal y como se ve desde moderación: sin ocultar nada. */
export interface MensajeModeracion {
  id: string;
  autor_id: string;
  texto: string;
  creado_en: string;
  audio_ruta: string | null;
  audio_ms: number | null;
  /** Si no es null, el autor lo borró "para todos" — pero aquí se
   *  enseña igual, con un aviso, porque para esto se guardó. */
  eliminado_en: string | null;
}

/** Denuncias para el panel. Vacío si no eres administrador. */
export async function listarDenuncias(incluirResueltas = false): Promise<Denuncia[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("listar_denuncias", {
    incluir_resueltas: incluirResueltas,
  });
  if (error) return [];
  return (data as Denuncia[]) ?? [];
}

/** Marca una denuncia como resuelta o descartada, con una nota opcional. */
export async function resolverDenuncia(
  denunciaId: string,
  nuevoEstado: EstadoDenuncia,
  resolucion?: string
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("resolver_denuncia", {
    denuncia_id: denunciaId,
    nuevo_estado: nuevoEstado,
    resolucion_texto: resolucion ?? null,
  });
  if (error) return false;
  return data === true;
}

/**
 * Todo lo que se han escrito dos personas, para revisar una denuncia.
 *
 * A propósito NO oculta lo que cualquiera de los dos haya borrado "para
 * mí" ni lo que se haya eliminado "para todos": el motivo de guardar el
 * texto en vez de destruirlo de verdad (ver conectar.ts,
 * eliminarMensajeParaTodos) era justo este momento. Los eliminados se
 * marcan para que se note, pero se enseñan igual.
 */
export async function transcripcionEntre(a: string, b: string): Promise<MensajeModeracion[]> {
  const supabase = createClient();
  const [usuarioA, usuarioB] = a < b ? [a, b] : [b, a];
  const { data } = await supabase
    .from("social_messages")
    .select("id, autor_id, texto, creado_en, audio_ruta, audio_ms, eliminado_en")
    .eq("usuario_a", usuarioA)
    .eq("usuario_b", usuarioB)
    .order("creado_en", { ascending: true });
  return (data as MensajeModeracion[]) ?? [];
}

/** Avisa de cada denuncia nueva que entra, esté abierto el panel o no. */
export function escucharDenunciasNuevas(alLlegar: (d: { id: string }) => void): () => void {
  const supabase = createClient();
  const canal = supabase
    .channel("denuncias-nuevas")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "social_reports" },
      (payload) => alLlegar(payload.new as { id: string })
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}
