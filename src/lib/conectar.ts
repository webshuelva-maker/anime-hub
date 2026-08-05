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
  /** Esta persona ya te dijo que sí. Si le dices que sí, hay coincidencia. */
  te_ha_marcado: boolean;
}

export interface Coincidencia {
  user_id: string;
  alias: string;
  edad: number;
  avatar_id: string | null;
  desde: string;
  ultimo_texto: string | null;
  ultimo_en: string | null;
  sin_leer: number;
}

export interface Mensaje {
  id: string;
  usuario_a: string;
  usuario_b: string;
  autor_id: string;
  texto: string;
  creado_en: string;
  leido_en: string | null;
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

/**
 * Cuánta gente has marcado que todavía no te ha contestado.
 *
 * Es un número, no una lista, y a propósito: enseñar A QUIÉN has marcado
 * sin respuesta no aporta nada y convierte la pantalla en un registro de
 * rechazos. Lo único que hace falta saber es que la cosa está en marcha.
 */
export async function esperandoRespuesta(): Promise<number> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return 0;

  const { count: marcados } = await supabase
    .from("social_decisions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
    .eq("decision", "interesa");

  const { count: coincidencias } = await supabase
    .from("social_matches")
    .select("*", { count: "exact", head: true })
    .or(`usuario_a.eq.${auth.user.id},usuario_b.eq.${auth.user.id}`);

  return Math.max(0, (marcados ?? 0) - (coincidencias ?? 0));
}

/** Etiqueta para la afinidad, que si no es un número sin significado. */
export function etiquetaAfinidad(afinidad: number): { texto: string; fuerza: number } {
  if (afinidad >= 15) return { texto: "Muchísimo en común", fuerza: 1 };
  if (afinidad >= 8) return { texto: "Bastante en común", fuerza: 0.75 };
  if (afinidad >= 4) return { texto: "Algo en común", fuerza: 0.5 };
  if (afinidad > 0) return { texto: "Algún gusto compartido", fuerza: 0.3 };
  return { texto: "Sin gustos en común todavía", fuerza: 0.1 };
}

/**
 * Cuánta gente te ha marcado y todavía no has decidido sobre ella.
 *
 * A esas personas les sale su ficha la primera cuando abres Conectar,
 * así que esto es literalmente "cuántas coincidencias tienes a un toque
 * de distancia".
 */
export async function cuantosTeEsperan(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cuantos_te_esperan");
  if (error) return 0;
  return (data as number) ?? 0;
}

/* ------------------------------------------------------------------ */
/*  Chat                                                              */
/* ------------------------------------------------------------------ */

/** Los dos identificadores ordenados, como los guarda la base de datos. */
function pareja(yo: string, otro: string): { a: string; b: string } {
  return yo < otro ? { a: yo, b: otro } : { a: otro, b: yo };
}

export async function mensajesCon(otro: string): Promise<Mensaje[]> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { a, b } = pareja(auth.user.id, otro);

  const { data } = await supabase
    .from("social_messages")
    .select("id, usuario_a, usuario_b, autor_id, texto, creado_en, leido_en")
    .eq("usuario_a", a)
    .eq("usuario_b", b)
    .order("creado_en", { ascending: true });
  return (data as Mensaje[]) ?? [];
}

/** Devuelve el error en texto, o null si se envió. */
export async function enviarMensaje(otro: string, texto: string): Promise<string | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "No hay sesión iniciada.";
  const { a, b } = pareja(auth.user.id, otro);

  const { error } = await supabase.from("social_messages").insert({
    usuario_a: a,
    usuario_b: b,
    autor_id: auth.user.id,
    texto: texto.trim(),
  });
  if (!error) return null;

  // Las políticas de la base de datos rechazan el mensaje cuando ya no se
  // puede escribir (bloqueo, sanción, coincidencia deshecha). Ese rechazo
  // llega como un error genérico de permisos, así que se traduce.
  if (error.code === "42501" || error.message.toLowerCase().includes("policy")) {
    return "Ya no puedes escribir en esta conversación.";
  }
  return error.message;
}

export async function marcarConversacionLeida(otro: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.rpc("marcar_conversacion_leida", { otro });
  } catch {
    // Si falla, el contador de sin leer se quedará alto un rato. No es
    // motivo para cortarle el chat a nadie.
  }
}

/**
 * Se engancha a una conversación: mensajes nuevos, quién está delante y
 * quién está escribiendo. Devuelve con qué avisar de que TÚ escribes, y
 * cómo desengancharse.
 *
 * Las tres cosas van por el MISMO canal a propósito. Cada canal abierto
 * es una conexión que hay que mantener viva, y tres conexiones para una
 * sola conversación es tirar batería en el móvil sin ganar nada.
 *
 * Ni "en línea" ni "escribiendo" se guardan en ninguna tabla: viajan por
 * el canal y desaparecen. Es información de este segundo, y guardar un
 * registro de cuándo está cada uno conectado sería construir un historial
 * de los hábitos de la gente sin ningún motivo.
 */
export interface EngancheConversacion {
  /** Avisa a la otra persona de que estás escribiendo. */
  avisarQueEscribo: () => void;
  cerrar: () => void;
}

export function engancharConversacion(
  yo: string,
  otro: string,
  manejadores: {
    alLlegarMensaje: (m: Mensaje) => void;
    alCambiarPresencia: (enLinea: boolean) => void;
    alEscribirElOtro: () => void;
  }
): EngancheConversacion {
  const supabase = createClient();
  const { a, b } = pareja(yo, otro);

  const canal = supabase.channel(`chat-${a}-${b}`, {
    config: { presence: { key: yo } },
  });

  canal
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "social_messages",
        filter: `usuario_a=eq.${a}`,
      },
      (payload) => {
        const m = payload.new as Mensaje;
        // El filtro del canal solo admite una columna, así que la otra
        // mitad de la pareja se comprueba aquí.
        if (m.usuario_b === b) manejadores.alLlegarMensaje(m);
      }
    )
    .on("presence", { event: "sync" }, () => {
      const estado = canal.presenceState();
      manejadores.alCambiarPresencia(Boolean(estado[otro]?.length));
    })
    .on("broadcast", { event: "escribiendo" }, ({ payload }) => {
      if (payload?.de === otro) manejadores.alEscribirElOtro();
    })
    .subscribe((estado) => {
      if (estado === "SUBSCRIBED") {
        void canal.track({ en: Date.now() });
      }
    });

  /*
   * El aviso de "estoy escribiendo" se manda como mucho una vez cada dos
   * segundos. Sin freno saldría uno por cada tecla pulsada, que es
   * decenas de mensajes por frase para enseñar exactamente lo mismo.
   */
  let ultimoAviso = 0;

  return {
    avisarQueEscribo: () => {
      const ahora = Date.now();
      if (ahora - ultimoAviso < 2000) return;
      ultimoAviso = ahora;
      void canal.send({ type: "broadcast", event: "escribiendo", payload: { de: yo } });
    },
    cerrar: () => {
      void supabase.removeChannel(canal);
    },
  };
}

/**
 * Carátulas de una lista de títulos, para enseñar en común algo más que
 * texto gris. Se recuerdan en memoria mientras dure la visita: en
 * Conectar los mismos animes salen una y otra vez.
 */
const caratulasVistas = new Map<string, string | null>();

export async function caratulasDe(titulos: string[]): Promise<Record<string, string>> {
  const salida: Record<string, string> = {};
  const porPedir: string[] = [];

  for (const t of titulos) {
    const guardada = caratulasVistas.get(t.toLowerCase());
    if (guardada === undefined) porPedir.push(t);
    else if (guardada) salida[t] = guardada;
  }
  if (porPedir.length === 0) return salida;

  try {
    const res = await fetch(`/api/caratulas?titulos=${encodeURIComponent(porPedir.join("|"))}`);
    const json = (await res.json()) as { caratulas?: Record<string, string> };
    for (const t of porPedir) {
      const url = json.caratulas?.[t] ?? null;
      // Se recuerda también cuando NO hay carátula: si no, cada visita
      // volvería a preguntar por los títulos que AniList no conoce.
      caratulasVistas.set(t.toLowerCase(), url);
      if (url) salida[t] = url;
    }
  } catch {
    // Sin carátulas, las etiquetas de texto siguen ahí.
  }
  return salida;
}
