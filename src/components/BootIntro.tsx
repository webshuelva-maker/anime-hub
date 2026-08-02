import { siteConfig } from "@/config/site";

/**
 * Presentación de arranque.
 *
 * El planteamiento viene de una idea del usuario y es mejor que lo que
 * yo estaba haciendo: en vez de pelear por recortar la décima de segundo
 * que el navegador tarda en ponerse en marcha —una guerra que no se
 * puede ganar del todo—, se ocupa ese hueco a propósito con algo
 * nuestro. Lo que antes era "un destello raro" pasa a ser la entrada de
 * la app.
 *
 * Tres decisiones que la hacen funcionar:
 *
 * 1. Es HTML del servidor, sin JavaScript. Está en el documento desde el
 *    primer byte, así que se pinta en el primer fotograma. Justo lo que
 *    no conseguía la versión con framer-motion: aquella no existía hasta
 *    que React hidrataba, que es cuando llegaba tarde.
 * 2. Se anima y se va sola con CSS. Tampoco depende de nadie para
 *    desaparecer.
 * 3. Solo aparece en el arranque de verdad (marca "presentacion", que el
 *    script de la cabecera pone únicamente si no hay noticias en caché y
 *    vas a las noticias). Al navegar entre secciones no sale.
 * 4. Esa marca tiene su propio temporizador, aparte del de la pantalla de
 *    carga. Antes compartían marca y, en un ordenador rápido, la carga
 *    terminaba antes que la animación y esta se cortaba a mitad — por eso
 *    en móvil se veía y en PC no.
 */
export function BootIntro() {
  return (
    <div className="boot-intro" aria-hidden>
      <span className="boot-intro__mark">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="boot-intro__name">{siteConfig.name}</span>
      {/* Estos dos aparecen al final y son EXACTAMENTE lo que enseña la
          pantalla de carga que hay debajo, en el mismo sitio y con la
          misma tipografía. Cuando la cortina se disuelve, los dos planos
          muestran lo mismo: no se ve un cambio de pantalla, se ve cómo
          una continúa en la otra. */}
      <span className="boot-intro__sub">Preparando tu feed</span>
      <span className="boot-intro__line" />
    </div>
  );
}
