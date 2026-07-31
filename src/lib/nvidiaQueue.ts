// Todas las llamadas que acaban tocando la API de NVIDIA (traducción de
// tarjetas Y traducción de detalle) pasan por AQUÍ para que el navegador
// nunca tenga más de UNA en vuelo a la vez.
//
// Motivo: con el nuevo diseño (una sola llamada a NVIDIA por invocación
// de función, ver translate.ts/translateBatch.ts), el síntoma reportado
// —solo el primer lote de tarjetas se traduce, y el detalle SIEMPRE sale
// en inglés da igual qué noticia sea— encaja con un límite de
// CONCURRENCIA por clave de API en el tier gratuito de NVIDIA (p. ej.
// "1 petición en vuelo a la vez"), no con un límite de tiempo. Antes,
// las tarjetas se traducían en lotes lanzados en paralelo cada ~1s
// (varias peticiones a la vez), y el detalle podía dispararse mientras
// esas seguían en vuelo — chocando entre sí y fallando siempre que
// hubiera más de una petición simultánea.
//
// runExclusive encadena cada llamada a la anterior: la siguiente no
// empieza hasta que la de antes termina (con éxito o error), sin
// importar desde qué componente se llame.
let tail: Promise<unknown> = Promise.resolve();

export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const result = tail.then(fn, fn);
  // Si fn falla, no se debe romper la cola para los siguientes en espera.
  tail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
