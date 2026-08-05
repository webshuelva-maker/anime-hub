"use client";

import { createClient } from "./supabase/client";

/**
 * De quién es lo que hay guardado en este navegador.
 *
 * ---------------------------------------------------------------------
 * EL FALLO QUE ARREGLA ESTO (v155)
 *
 * Las preferencias vivían en una única clave de localStorage,
 * "anime-hub:preferences", sin ninguna marca de a qué cuenta pertenecían.
 * Y al cerrar sesión no se borraba nada. La secuencia era:
 *
 *   1. Cuenta A guarda su nombre, sus favoritos y lo que Iris recuerda.
 *   2. Cierras sesión → el navegador SIGUE con todo eso puesto.
 *   3. Creas la cuenta B y entras.
 *   4. pullCloudState no encuentra fila en la nube para B (es nueva) y,
 *      según estaba escrito, en ese caso SUBE lo que haya en local
 *      "para no perder lo aprendido antes de registrarse".
 *
 * Resultado: la cuenta B no solo se veía con el nombre y los gustos de
 * A — es que además se los COPIABA a su propia fila en la base de datos.
 * En un ordenador compartido, eso es el nombre y los gustos de una
 * persona apareciendo en la cuenta de otra.
 *
 * El arreglo tiene dos capas, y hacen falta las dos:
 *
 *  - Al cerrar sesión se borra el estado local. Cubre el caso normal.
 *  - Cada estado local lleva grabado SU DUEÑO. Al entrar, si el dueño no
 *    coincide con quien acaba de iniciar sesión, se limpia antes de
 *    sincronizar. Esto cubre lo que la primera capa no puede: sesiones
 *    caducadas, cierres en otro dispositivo, o que el navegador se cierre
 *    a mitad.
 * ---------------------------------------------------------------------
 */

const DUENO_KEY = "anime-hub:dueno";

/**
 * Lo que se borra al cambiar de cuenta: todo lo que describe a una
 * persona. Se deja fuera a propósito la caché de traducciones y la de
 * noticias, que no son de nadie (son las mismas noticias para todos) y
 * cuestan tiempo y cuota de reconstruir.
 */
const CLAVES_PERSONALES = [
  "anime-hub:preferences",
  "anime-hub:ren-memory",
  "anime-hub:last-cloud-pull",
  "anime-hub:es-admin",
  "anime-hub:trivia-queue",
  "anime-hub:trivia-position",
];

/** Id de la cuenta a la que pertenece lo guardado aquí, si se sabe. */
export function duenoLocal(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DUENO_KEY);
  } catch {
    return null;
  }
}

export function marcarDueno(userId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (userId) window.localStorage.setItem(DUENO_KEY, userId);
    else window.localStorage.removeItem(DUENO_KEY);
  } catch {
    // Modo incógnito con almacenamiento bloqueado: no es motivo para
    // romper la app.
  }
}

/**
 * Deja el navegador como recién instalado en lo que a la persona se
 * refiere. NO toca la nube: lo guardado en Supabase es de su cuenta y
 * tiene que seguir ahí para cuando vuelva a entrar.
 */
export function limpiarEstadoLocal(): void {
  if (typeof window === "undefined") return;
  try {
    for (const clave of CLAVES_PERSONALES) window.localStorage.removeItem(clave);
    window.localStorage.removeItem(DUENO_KEY);
    window.sessionStorage.removeItem("anime-hub:open-item");
    // La cookie del onboarding vuelve a "no": si no, el servidor mandaría
    // a la cuenta nueva directa a las noticias saltándose la bienvenida.
    document.cookie = "anime-hub-onboarded=0; path=/; max-age=31536000; SameSite=Lax";
  } catch {
    // Igual que arriba.
  }
}

/**
 * Cierra sesión SOLO en este dispositivo y limpia lo local.
 *
 * El "scope: local" es lo que arregla el otro fallo: por defecto,
 * signOut() de Supabase invalida TODAS las sesiones de la cuenta en
 * todas partes. Por eso cerrar sesión en el ordenador echaba también del
 * móvil. Eso es lo que quieres en un "cerrar sesión en todos los
 * dispositivos" — pero no en el botón normal de salir.
 */
export async function cerrarSesion(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Aunque falle la llamada, se limpia igual: no dejar los datos de
    // uno a la vista del siguiente importa más que el orden.
  }
  limpiarEstadoLocal();
}

/** Cierra la sesión en todos los dispositivos. Va aparte, y avisando. */
export async function cerrarSesionEnTodas(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // Mejor esfuerzo.
  }
  limpiarEstadoLocal();
}

/**
 * Comprueba de quién es lo que hay guardado y lo borra si es de otro.
 * Devuelve true si ha tenido que limpiar.
 *
 * Se llama ANTES de sincronizar con la nube. Si se llamara después, ya
 * se habrían subido los datos del anterior a la cuenta del nuevo, que es
 * justo el daño que se quiere evitar.
 */
export function comprobarDueno(userIdActual: string): boolean {
  const dueno = duenoLocal();

  if (dueno && dueno !== userIdActual) {
    limpiarEstadoLocal();
    marcarDueno(userIdActual);
    return true;
  }

  // Sin dueño grabado hay dos posibilidades y se tratan distinto:
  //
  //  - Alguien que usó la app sin cuenta y ahora se registra: lo suyo es
  //    suyo y se queda (esto ya funcionaba y no se toca).
  //  - Un navegador de una versión anterior a este arreglo, donde el
  //    estado puede ser de cualquiera.
  //
  // No se pueden distinguir, así que se adopta lo que haya y se marca el
  // dueño. A partir de aquí, cualquier cambio de cuenta se detecta.
  marcarDueno(userIdActual);
  return false;
}
