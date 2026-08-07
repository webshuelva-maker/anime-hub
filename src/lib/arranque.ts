"use client";

/**
 * Cuándo se puede dar por arrancada la app.
 *
 * ---------------------------------------------------------------------
 * PARA QUÉ
 *
 * Una llamada entrante ocupa la pantalla entera. Si eso ocurre encima de
 * la pantalla de carga —que dura sus segundos y tiene su propia
 * presentación— el resultado es dos cosas peleándose por la pantalla y
 * la sensación de que algo ha fallado.
 *
 * Así que las llamadas se ponen a la escucha DESPUÉS de que la carga
 * termine, y con un segundo de margen para que la entrada respire. No se
 * pierde ninguna llamada por esperar: quien llama repite la oferta cada
 * dos segundos y medio mientras suena, así que la que estuviera en curso
 * llega igual en cuanto se empieza a escuchar.
 *
 * El detalle que obliga a hacerlo con un módulo y no con un simple
 * temporizador: la pantalla de carga NO siempre aparece. Si ya se ha
 * entrado antes en esa sesión, no hay carga que esperar. Por eso hay que
 * distinguir "todavía cargando" de "aquí no hubo carga", y en el segundo
 * caso ponerse a escuchar enseguida.
 * ---------------------------------------------------------------------
 */

const EVENTO = "anime-hub:app-lista";

let hayCarga = false;
let terminada = false;

/** La llama la pantalla de carga al aparecer. */
export function marcarCargaEnCurso() {
  hayCarga = true;
  terminada = false;
}

/** La llama la pantalla de carga al desaparecer. */
export function marcarCargaTerminada() {
  terminada = true;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/**
 * Ejecuta algo cuando la app esté lista, con el margen indicado.
 * Devuelve la función para cancelar la espera.
 */
export function cuandoLaAppEsteLista(hacer: () => void, margenMs = 1000): () => void {
  if (typeof window === "undefined") return () => {};

  let cancelado = false;
  let temporizador: ReturnType<typeof setTimeout> | null = null;

  const lanzar = () => {
    if (cancelado || temporizador) return;
    temporizador = setTimeout(() => {
      if (!cancelado) hacer();
    }, margenMs);
  };

  if (terminada) {
    lanzar();
  } else {
    window.addEventListener(EVENTO, lanzar, { once: true });

    /*
     * Red de seguridad: si a los dos segundos y medio no ha aparecido
     * ninguna pantalla de carga, es que en esta visita no la hay, así
     * que se sigue adelante. Sin esto, entrar por una página que no
     * arranca con la carga dejaría las llamadas mudas para siempre.
     */
    setTimeout(() => {
      if (!hayCarga) lanzar();
    }, 2500);
  }

  return () => {
    cancelado = true;
    if (temporizador) clearTimeout(temporizador);
    window.removeEventListener(EVENTO, lanzar);
  };
}
