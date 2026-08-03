/**
 * Proveedor de IA: Groq o Gemini, sin tocar el resto del código.
 *
 * Los dos hablan el mismo formato (el de OpenAI), así que cambiar de uno
 * a otro es cambiar la dirección, la clave y el nombre del modelo. Por
 * eso todo eso vive AQUÍ y en ningún otro sitio: el asistente, la
 * traducción y las trivias solo piden "la dirección" y "el modelo
 * rápido", y les da igual quién esté detrás.
 *
 * La elección es automática: si hay GEMINI_API_KEY, se usa Gemini; si
 * no, Groq. Así se cambia de proveedor añadiendo o quitando una variable
 * de entorno, sin desplegar código nuevo, y se puede volver atrás en
 * treinta segundos si algo sale mal.
 *
 * Diferencias que conviene tener presentes:
 * - Gemini da mucho margen al día (varios cientos de peticiones) pero
 *   POCAS por minuto. Groq es al revés: muy rápido generando, pero se
 *   agota antes.
 * - Por eso el modelo "rápido" de Gemini es Flash-Lite, que admite el
 *   triple de peticiones por minuto que Flash: es el que se lleva el
 *   trabajo repetitivo (clasificar, traducir, trivias).
 */

export type ProveedorIA = "gemini" | "groq";

export function proveedorIA(): ProveedorIA {
  return process.env.GEMINI_API_KEY ? "gemini" : "groq";
}

/** La clave del proveedor que toque. Null si no hay ninguna configurada. */
export function claveIA(): string | null {
  return process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || null;
}

/** Dirección del endpoint compatible con el formato de OpenAI. */
export function urlIA(): string {
  return proveedorIA() === "gemini"
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";
}

/**
 * Modelo con más capacidad: el que separa lo confirmado de los rumores
 * sin liarse. Se puede sobrescribir con IA_MODELO_POTENTE por si sale
 * uno nuevo y no quieres esperar a una versión de la app.
 */
export function modeloPotente(): string {
  if (process.env.IA_MODELO_POTENTE) return process.env.IA_MODELO_POTENTE;
  return proveedorIA() === "gemini" ? "gemini-2.5-flash" : "llama-3.3-70b-versatile";
}

/** Modelo rápido y barato: charla, clasificar, traducir, trivias. */
export function modeloRapido(): string {
  if (process.env.IA_MODELO_RAPIDO) return process.env.IA_MODELO_RAPIDO;
  return proveedorIA() === "gemini" ? "gemini-2.5-flash-lite" : "llama-3.1-8b-instant";
}

/** Cabeceras de la petición. Los dos usan Bearer, así que valen igual. */
export function cabecerasIA(clave: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${clave}`,
  };
}
