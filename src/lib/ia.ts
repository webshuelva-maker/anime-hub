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
  /*
   * Se puede cambiar por variable de entorno. Sirve para apuntar a un
   * proxy propio o a otro proveedor compatible, y para poder probar en
   * local todo lo que depende del traductor sin gastar cuota real ni
   * necesitar clave.
   */
  if (process.env.IA_URL) return process.env.IA_URL;

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
  // "gemini-flash-latest" es un alias que Google mantiene apuntando
  // siempre a su Flash más reciente. Se usa a propósito en vez de un
  // número concreto: fijar "gemini-2.5-flash-lite" fue justo lo que
  // rompió la app cuando Google lo retiró. Con el alias, las retiradas
  // dejan de ser un problema.
  return proveedorIA() === "gemini" ? "gemini-flash-latest" : "llama-3.3-70b-versatile";
}

/**
 * Modelo rápido y barato: charla, clasificar, traducir, trivias.
 *
 * En Gemini se usa el alias "gemini-flash-lite-latest", que Google
 * mantiene apuntando a su modelo ligero más reciente. El ligero admite
 * bastantes más peticiones por minuto que el normal, y es el que se
 * lleva todo el trabajo repetitivo: clasificar, traducir y las trivias.
 *
 * Si algún día un alias empieza a portarse raro, se puede fijar un
 * modelo concreto con la variable IA_MODELO_RAPIDO, sin tocar código.
 */
export function modeloRapido(): string {
  if (process.env.IA_MODELO_RAPIDO) return process.env.IA_MODELO_RAPIDO;
  return proveedorIA() === "gemini" ? "gemini-flash-lite-latest" : "llama-3.1-8b-instant";
}

/** Lista los modelos que la clave puede usar de verdad (solo Gemini). */
export async function modelosDisponibles(clave: string): Promise<string[]> {
  if (proveedorIA() !== "gemini") return [];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(clave)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    return (json.models ?? [])
      // Solo los que sirven para conversar: la lista incluye también
      // modelos de imágenes, de audio y de vectores.
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Cabeceras de la petición. Los dos usan Bearer, así que valen igual. */
export function cabecerasIA(clave: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${clave}`,
  };
}

/**
 * Ajustes extra que hay que colar en el cuerpo de la petición.
 *
 * EL PROBLEMA QUE RESUELVE (costó localizarlo):
 * los Flash actuales de Gemini "piensan" antes de responder, y esos
 * tokens de razonamiento NO salen en la respuesta pero SÍ descuentan del
 * max_tokens que pides. Si el margen es corto, el modelo se lo gasta
 * entero pensando y devuelve texto VACÍO — sin error, sin aviso, solo
 * una respuesta en blanco después de varios segundos. Es justo lo que se
 * vio al probar: el modelo potente contestaba "(vacía)" en 6 segundos
 * mientras el ligero respondía bien en 600 ms.
 *
 * Se pide el mínimo esfuerzo de razonamiento, no "none", a propósito: en
 * los modelos Gemini 3 el razonamiento NO se puede apagar del todo y
 * mandar "none" da error. "low" vale para 2.5 y para 3.
 *
 * En Groq no existe este parámetro, así que devuelve un objeto vacío.
 */
export function ajustesRazonamiento(): Record<string, unknown> {
  return proveedorIA() === "gemini" ? { reasoning_effort: "low" } : {};
}

/**
 * Margen de tokens mínimo cuando el proveedor es Gemini.
 *
 * Aunque se pida poco esfuerzo de razonamiento, el modelo sigue gastando
 * algo antes de escribir. Si la tarea pide 200 tokens y el modelo gasta
 * 300 pensando, la respuesta llega vacía. Este suelo garantiza que
 * siempre quede sitio para pensar Y para contestar.
 */
export function tokensConMargen(deseados: number): number {
  return proveedorIA() === "gemini" ? Math.max(deseados, 800) : deseados;
}
