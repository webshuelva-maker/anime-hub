/**
 * Vibración corta en los gestos importantes.
 *
 * Es de las cosas que más separan una app de una web abierta en el
 * móvil: confirma el gesto sin que tengas que mirar la pantalla. Se usa
 * con MUCHA moderación — vibrar en cada toque cansa y la gente acaba
 * apagando la vibración del sistema entera.
 *
 * iOS no admite esta API en Safari, así que allí sencillamente no hace
 * nada. No se avisa ni se intenta emular: un fallo silencioso es
 * preferible a un apaño que se sienta raro.
 */
export function vibrar(patron: number | number[] = 10): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(patron);
  } catch {
    // Algunos navegadores lo bloquean sin interacción previa: da igual.
  }
}
