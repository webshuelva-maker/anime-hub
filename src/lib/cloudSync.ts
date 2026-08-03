"use client";

import { createClient } from "./supabase/client";
import { getPreferences, savePreferencesLocal, PREFERENCES_CHANGED_EVENT } from "./storage";
import { getRenMemory, setRenMemoryLocal } from "./renMemory";
import { UserPreferences } from "@/types/news";

/**
 * Sincronización entre dispositivos.
 *
 * Hasta v90, todo lo que la app aprendía vivía SOLO en el navegador: los
 * gustos, los "me gusta" y lo que Ren recordaba de ti. Tener cuenta no
 * servía de nada para eso — cambiabas del móvil al ordenador y Ren no te
 * conocía. Aquí se sube ese estado a Supabase y se baja al entrar.
 *
 * Reglas de la casa:
 * - Sin sesión iniciada NO se sube nada. La app sigue funcionando entera
 *   en local, como siempre; la nube es un extra de tener cuenta.
 * - Gana la versión con la marca de tiempo más reciente. Nada de fusionar
 *   listas a lo loco: si borraste un recuerdo en el móvil, no debe
 *   resucitar porque el ordenador tenía una copia vieja.
 * - Todo es "mejor esfuerzo": si Supabase no responde, la app no se
 *   entera y sigue con localStorage.
 */

const LAST_PULL_KEY = "anime-hub:last-cloud-pull";

interface CloudRow {
  preferences: UserPreferences | null;
  ren_memory: string[] | null;
  client_updated_at: string | null;
}

function hasSupabase(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Marca de tiempo del último cambio local (la escribe savePreferences). */
function localUpdatedAt(): number {
  const prefs = getPreferences();
  return prefs.updatedAt ? Date.parse(prefs.updatedAt) : 0;
}

/**
 * Sube el estado actual. Se llama sola después de cada cambio, con un
 * pequeño retardo para no mandar diez peticiones seguidas mientras el
 * usuario toquetea ajustes.
 */
let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleCloudPush(): void {
  if (typeof window === "undefined" || !hasSupabase()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void pushCloudState();
  }, 1500);
}

export async function pushCloudState(): Promise<void> {
  if (typeof window === "undefined" || !hasSupabase()) return;

  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const prefs = getPreferences();
    await supabase.from("user_state").upsert(
      {
        user_id: auth.user.id,
        preferences: prefs,
        ren_memory: getRenMemory(),
        client_updated_at: prefs.updatedAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch {
    // La nube es una comodidad, no un requisito: si falla, en local está.
  }
}

/**
 * Baja el estado de la nube al entrar. Devuelve true si ha reemplazado lo
 * que había en el navegador (para que la pantalla se refresque).
 */
export async function pullCloudState(): Promise<boolean> {
  if (typeof window === "undefined" || !hasSupabase()) return false;

  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;

    const { data, error } = await supabase
      .from("user_state")
      .select("preferences, ren_memory, client_updated_at")
      .eq("user_id", auth.user.id)
      .maybeSingle<CloudRow>();

    if (error || !data) {
      // Primera vez con cuenta en este usuario: lo que haya en el
      // navegador se sube tal cual, para no perder nada de lo aprendido
      // antes de registrarse.
      await pushCloudState();
      return false;
    }

    const cloudTime = data.client_updated_at ? Date.parse(data.client_updated_at) : 0;
    const localTime = localUpdatedAt();

    if (cloudTime <= localTime) {
      // Lo de este navegador es igual o más nuevo: se sube y listo.
      await pushCloudState();
      return false;
    }

    if (data.preferences) savePreferencesLocal(data.preferences);
    if (Array.isArray(data.ren_memory)) setRenMemoryLocal(data.ren_memory);

    window.localStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
    window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Borra el estado guardado en la nube (al borrar todo desde Ajustes). */
/**
 * Vuelve a mirar la nube cuando el usuario regresa a la pestaña.
 *
 * Antes solo se bajaba el estado al cargar la página y al iniciar
 * sesión. Si dabas un ♡ en el móvil y tenías el ordenador abierto, ahí
 * seguía la versión vieja hasta que recargaras — podían pasar horas.
 * Ahora, cada vez que vuelves a la pestaña (y como mucho una vez cada
 * 20 segundos, para no machacar a Supabase), se comprueba si hay algo
 * más nuevo.
 */
let ultimaComprobacion = 0;

export function iniciarSincronizacionAlVolver(): () => void {
  if (typeof window === "undefined" || !hasSupabase()) return () => {};

  const comprobar = () => {
    if (document.visibilityState !== "visible") return;
    const ahora = Date.now();
    if (ahora - ultimaComprobacion < 20_000) return;
    ultimaComprobacion = ahora;
    void pullCloudState();
  };

  document.addEventListener("visibilitychange", comprobar);
  window.addEventListener("focus", comprobar);
  return () => {
    document.removeEventListener("visibilitychange", comprobar);
    window.removeEventListener("focus", comprobar);
  };
}

export async function clearCloudState(): Promise<void> {
  if (typeof window === "undefined" || !hasSupabase()) return;
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    await supabase.from("user_state").delete().eq("user_id", auth.user.id);
  } catch {
    // Igual que arriba: mejor esfuerzo.
  }
}
