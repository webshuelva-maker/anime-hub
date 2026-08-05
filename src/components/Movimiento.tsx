"use client";

import { MotionConfig } from "framer-motion";
import { ReactNode } from "react";

/**
 * Hace que TODAS las animaciones de framer-motion respeten el "Reducir
 * movimiento" del sistema operativo.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ ESTO ARREGLA EL TIRÓN EN SU ORDENADOR
 *
 * El CSS de la app ya respetaba esa preferencia desde hace tiempo. Pero
 * framer-motion no mira el CSS: calcula cada fotograma en JavaScript y
 * lo escribe en el elemento. O sea que en un equipo con "Reducir
 * movimiento" activado —como el suyo— seguían ejecutándose TODAS las
 * animaciones, y encima el navegador no podía delegarlas en la tarjeta
 * gráfica igual de bien: cada panel que se abre, cada fila de una lista
 * escalonada y cada tarjeta que entra costaban trabajo del procesador.
 *
 * Con reducedMotion="user", framer consulta la preferencia del sistema y,
 * cuando está activada, deja de animar posiciones, tamaños y rotaciones:
 * solo hace fundidos, que son casi gratis. Los elementos siguen
 * apareciendo y desapareciendo con suavidad, pero sin mover nada.
 *
 * No es solo rendimiento: es lo correcto. Quien activa esa opción lo
 * hace por mareos, migrañas o problemas vestibulares, y una app que la
 * ignora le sienta mal de verdad. Estábamos haciendo eso sin querer.
 *
 * En equipos SIN esa preferencia activada no cambia absolutamente nada:
 * las animaciones siguen exactamente igual que hasta ahora.
 * ---------------------------------------------------------------------
 */
export function Movimiento({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
