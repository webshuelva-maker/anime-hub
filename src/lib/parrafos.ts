/**
 * Reparte un texto largo en párrafos.
 *
 * Vive aparte porque hace falta en DOS momentos:
 *
 * 1. Al traducir, para guardar ya el artículo bien repartido.
 * 2. Al PINTARLO, porque las traducciones se guardan en caché en el
 *    navegador: los artículos traducidos antes de este arreglo seguirían
 *    saliendo como un muro de texto para siempre, por muy bien que
 *    traduzca ahora. Aplicándolo también al mostrar, se arreglan también
 *    los viejos.
 *
 * El corte busca punto (o cierre de interrogación/exclamación) seguido de
 * espacio y mayúscula, para no partir en abreviaturas ni en decimales.
 */
export function repartirEnParrafos(texto: string, minimoCaracteres = 600): string {
  const limpio = texto.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();

  // Ya viene repartido, o es corto: no se toca.
  if (limpio.includes("\n\n") || limpio.length < minimoCaracteres) return limpio;

  const frases = limpio.match(/[^.!?]+[.!?]+(?=\s+[A-ZÁÉÍÓÚÑ¡¿"«(]|\s*$)/g);
  if (!frases || frases.length < 4) return limpio;

  const parrafos: string[] = [];
  for (let i = 0; i < frases.length; i += 3) {
    parrafos.push(
      frases
        .slice(i, i + 3)
        .map((f) => f.trim())
        .join(" ")
    );
  }
  return parrafos.join("\n\n");
}
