"use client";

/**
 * Traduce los errores de Supabase a algo que se pueda leer.
 *
 * Antes se enseñaba el mensaje tal cual venía, en inglés y escrito para
 * quien programa: "Invalid login credentials". Y justo debajo aparecía
 * un "¿Todavía no tienes cuenta? Crear una →". Las dos cosas juntas
 * dejaban a la persona sin saber si se había equivocado de contraseña,
 * si la cuenta no existía o si la app estaba rota.
 *
 * Aquí cada caso se explica y, cuando toca, se dice QUÉ HACER. Hay uno
 * que merece explicación aparte: Supabase devuelve a propósito el mismo
 * error tanto si la contraseña está mal como si el correo no está
 * registrado, para que nadie pueda averiguar qué correos tienen cuenta
 * probándolos uno a uno. Es correcto y no se puede (ni se debe) rodear,
 * así que el mensaje cubre las dos posibilidades en vez de fingir que
 * sabemos cuál es.
 */

export interface ErrorTraducido {
  texto: string;
  /** Si conviene ofrecer el atajo a crear cuenta. */
  ofrecerRegistro?: boolean;
  /** Si conviene ofrecer el atajo a recuperar la contraseña. */
  ofrecerRecuperar?: boolean;
}

export function traducirErrorAuth(mensaje: string): ErrorTraducido {
  const m = mensaje.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return {
      texto:
        "El correo o la contraseña no coinciden. Repasa que el correo esté bien escrito; si estás seguro de él, puede que la contraseña no sea esa.",
      ofrecerRegistro: true,
      ofrecerRecuperar: true,
    };
  }

  if (m.includes("email not confirmed")) {
    return {
      texto:
        "Tu cuenta existe, pero falta confirmar el correo. Busca el mensaje que te mandamos (mira también en spam) y pulsa el botón de confirmar.",
    };
  }

  if (m.includes("user already registered") || m.includes("already been registered")) {
    return {
      texto: "Ya hay una cuenta con este correo.",
      ofrecerRecuperar: true,
    };
  }

  if (m.includes("password should be at least")) {
    return { texto: "La contraseña necesita al menos 6 caracteres." };
  }

  if (m.includes("unable to validate email") || m.includes("invalid format")) {
    return { texto: "Ese correo no parece bien escrito. Revisa la arroba y lo que va después." };
  }

  if (m.includes("for security purposes") || m.includes("rate limit") || m.includes("too many")) {
    return {
      texto:
        "Se han hecho demasiados intentos seguidos. Espera un minuto y vuelve a probar: no es culpa tuya, es una protección contra intentos automáticos.",
    };
  }

  if (m.includes("failed to fetch") || m.includes("network")) {
    return { texto: "No se ha podido conectar. Comprueba tu conexión y vuelve a intentarlo." };
  }

  if (m.includes("weak password")) {
    return { texto: "Esa contraseña es demasiado fácil de adivinar. Prueba con una más larga." };
  }

  // Cualquier cosa no prevista: se dice que ha fallado, sin soltar el
  // mensaje en inglés que no le sirve a nadie.
  return { texto: "Algo ha ido mal al intentarlo. Prueba otra vez en un momento." };
}
