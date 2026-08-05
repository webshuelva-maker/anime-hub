"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Fondo ambiental, montado una vez en el layout raíz — se ve siempre, en
 * toda la app. Dos cosas distintas: dos resplandores que respiran solos
 * en los lados, y un foco de luz pegado al cursor.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ ESTE ARCHIVO ERA LA CAUSA DEL TIRÓN GENERAL (v159)
 *
 * Las tres capas se dibujaban con `filter: blur(60px)` encima de un
 * degradado. Y un desenfoque por filtro no es un color: es una operación
 * que el navegador tiene que RECALCULAR ENTERA cada vez que el elemento
 * cambia. Con un radio de 60 píxeles, cada recálculo mezcla miles de
 * píxeles por punto.
 *
 * Lo que hacía que eso fuera permanente:
 *  - Los dos resplandores de los lados se mueven en bucle infinito, así
 *    que se recalculaban 60 veces por segundo mientras la app estuviera
 *    abierta, mirases lo que mirases.
 *  - El foco del cursor cambiaba de sitio en CADA movimiento del ratón,
 *    o sea otro desenfoque de 70px recalculado sin parar solo por mover
 *    la mano.
 *
 * Con el hilo de pintado saturado por eso, cualquier otra animación de
 * la app va a tirones aunque esté perfectamente hecha. No sobraba
 * potencia para nada más.
 *
 * El arreglo aprovecha algo que estaba delante todo el tiempo: un
 * degradado radial que va de un color a transparente YA es difuso. El
 * desenfoque encima no aportaba casi nada visible y costaba casi todo.
 * Ahora la suavidad se consigue con paradas intermedias en el propio
 * degradado — que el navegador dibuja una vez y guarda — y lo único que
 * se anima son opacidad y desplazamiento, las dos cosas que la tarjeta
 * gráfica hace sin repintar nada.
 *
 * Se ve prácticamente igual. Cuesta una fracción.
 * ---------------------------------------------------------------------
 */

/** Degradado difuso sin filtros: la suavidad va en las paradas. */
function halo(color: string): string {
  return `radial-gradient(circle at 50% 50%, ${color} 0%, color-mix(in srgb, ${color} 55%, transparent) 25%, color-mix(in srgb, ${color} 22%, transparent) 45%, color-mix(in srgb, ${color} 6%, transparent) 65%, transparent 80%)`;
}

export function AmbientGlow() {
  const focoRef = useRef<HTMLDivElement>(null);
  /*
   * Con "Reducir movimiento" activado, el fondo se queda quieto del todo:
   * ni respiración de los halos ni foco siguiendo al cursor. Es lo que
   * pide esa preferencia, y de paso deja el hilo de pintado libre para
   * lo que el usuario sí está mirando.
   */
  const quieto = useReducedMotion();

  useEffect(() => {
    // Sin cursor real (móvil, táctil) no hay foco que mover.
    if (typeof window === "undefined") return;
    if (quieto) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let x = 0;
    let y = 0;
    let pendiente = false;

    /*
     * El movimiento se aplica UNA vez por fotograma, no una por evento.
     * El ratón dispara muchos más eventos que fotogramas tiene la
     * pantalla, así que sin esto se pedía redibujar varias veces para
     * enseñar un único cuadro — trabajo tirado a la basura que además
     * retrasaba el resto.
     */
    const pintar = () => {
      pendiente = false;
      if (focoRef.current) {
        focoRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      }
    };

    const alMover = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!pendiente) {
        pendiente = true;
        requestAnimationFrame(pintar);
      }
    };

    window.addEventListener("mousemove", alMover, { passive: true });
    return () => window.removeEventListener("mousemove", alMover);
  }, [quieto]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute -left-40 top-1/3 h-[26rem] w-[26rem] rounded-full"
        style={{ background: halo("var(--ice)"), willChange: "transform, opacity" }}
        animate={quieto ? { opacity: 0.14 } : { opacity: [0.1, 0.22, 0.1], x: [0, 30, -10, 0], y: [0, -20, 15, 0] }}
        transition={quieto ? { duration: 0 } : { duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-40 bottom-1/3 h-[26rem] w-[26rem] rounded-full"
        style={{ background: halo("var(--accent-from)"), willChange: "transform, opacity" }}
        animate={quieto ? { opacity: 0.12 } : { opacity: [0.08, 0.18, 0.08], x: [0, -25, 15, 0], y: [0, 20, -15, 0] }}
        transition={quieto ? { duration: 0 } : { duration: 16, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />

      <div
        ref={focoRef}
        className={`h-[30rem] w-[30rem] rounded-full ${quieto ? "hidden" : "hidden sm:block"}`}
        style={{
          background: halo("var(--platinum)"),
          opacity: 0.1,
          willChange: "transform",
        }}
      />
    </div>
  );
}
