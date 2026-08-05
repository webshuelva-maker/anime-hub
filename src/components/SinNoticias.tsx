"use client";

import { motion } from "framer-motion";
import type { AnimeSearchResult } from "@/lib/anilist";
import { BrandMark } from "./BrandMark";
import { siteConfig } from "@/config/site";
import { PREFERENCES_CHANGED_EVENT, getPreferences, savePreferences } from "@/lib/storage";
import { playSuccess } from "@/lib/sound";
import { useEffect, useState } from "react";

/**
 * Qué se enseña cuando una búsqueda no tiene noticias.
 *
 * Antes era un párrafo gris en una caja. Y el problema no era que fuese
 * feo: es que dejaba al usuario en un callejón sin salida. Ha buscado
 * algo, le dices que no hay nada y ahí se acaba.
 *
 * Ahora se le explica POR QUÉ no hay nada —que casi siempre tiene una
 * razón concreta y tranquilizadora: la serie terminó hace años, o aún no
 * se ha estrenado— y se le ofrece la salida que corresponde a cada caso:
 * seguirla para enterarse cuando salga algo, o preguntarle al asistente,
 * que sí puede ir a buscar por su cuenta.
 */

interface Caso {
  titulo: string;
  explicacion: string;
  sugerencia: string;
}

/**
 * De todas las entregas de la franquicia, cuál manda para decidir el
 * mensaje.
 *
 * ---------------------------------------------------------------------
 * EL FALLO QUE ARREGLA ESTO (v179)
 *
 * Antes se miraba solo la PRIMERA ficha, que casi siempre es la serie
 * original. Buscando Mushoku Tensei, esa es la de 2021, que figura como
 * terminada — y la app soltaba que "después de cinco años lo normal es
 * que ya no se publique nada nuevo". Falso: la serie tiene temporada
 * nueva en producción ahora mismo, y esa información estaba en la propia
 * lista de resultados, dos entradas más abajo.
 *
 * Decir algo falso con seguridad es peor que no decir nada. Así que
 * ahora manda lo que esté vivo: si alguna entrega se está emitiendo o
 * está por estrenar, esa es la que habla. Solo cuando TODA la franquicia
 * está terminada se da por cerrada.
 * ---------------------------------------------------------------------
 */
function fichaQueManda(fichas: AnimeSearchResult[]): AnimeSearchResult | undefined {
  if (fichas.length === 0) return undefined;
  return (
    fichas.find((f) => f.status === "RELEASING") ??
    fichas.find((f) => f.status === "NOT_YET_RELEASED") ??
    // Si están todas acabadas, manda la más reciente.
    [...fichas].sort((a, b) => (b.startYear ?? 0) - (a.startYear ?? 0))[0]
  );
}

function analizar(termino: string, ficha: AnimeSearchResult | undefined): Caso {
  if (ficha?.status === "FINISHED" && ficha.endYear) {
    return {
      titulo: "Sin noticias recientes",
      /*
       * Se dice lo que se sabe —cuándo terminó— y NADA sobre el futuro.
       * Que una serie haya acabado no significa que no vaya a anunciarse
       * nada: pasa continuamente con secuelas, películas y refritos.
       */
      explicacion: `${ficha.title} terminó en ${ficha.endYear} y los medios que seguimos no han publicado nada suyo estos días.`,
      sugerencia:
        "Si anuncian una continuación será lo primero que te aparezca. Y si quieres saber si hay algo en marcha ahora mismo, pregúntaselo a Iris: sale a buscarlo.",
    };
  }

  if (ficha?.status === "NOT_YET_RELEASED") {
    return {
      titulo: "Todavía no ha empezado",
      explicacion: `${ficha.title} aún no se ha estrenado, y hasta que no se acerque la fecha no suele haber mucho que contar.`,
      sugerencia: "Síguela y te llegarán los primeros tráilers y fechas en cuanto se anuncien.",
    };
  }

  if (ficha?.status === "RELEASING") {
    return {
      titulo: "En emisión, pero sin novedades hoy",
      explicacion: `${ficha.title} se está emitiendo ahora mismo. Que no haya noticias significa simplemente que esta semana no ha pasado nada reseñable.`,
      sugerencia: "Síguela y no se te escapará el próximo anuncio.",
    };
  }

  return {
    titulo: "Nada por aquí, de momento",
    explicacion: `Ninguno de los medios que seguimos ha publicado sobre «${termino}» últimamente.`,
    sugerencia: "Puede que se escriba de otra forma, o que sea una obra de la que se habla poco.",
  };
}

export function SinNoticias({
  termino,
  fichas = [],
  ficha,
}: {
  termino: string;
  /** Todas las entregas encontradas de la franquicia. */
  fichas?: AnimeSearchResult[];
  ficha: AnimeSearchResult | undefined;
}) {
  // La que manda para el mensaje puede no ser la primera de la lista.
  const mandante = fichaQueManda(fichas.length > 0 ? fichas : ficha ? [ficha] : []);
  const caso = analizar(termino, mandante);
  // Para seguir sí vale la principal: es la obra que se ha buscado.
  const tituloReal = ficha?.title ?? termino;

  /*
   * "Siguiendo" se calcula EN CADA DIBUJADO, no una sola vez al montar.
   *
   * Antes se guardaba al montar el componente, y ahí estaba el fallo que
   * hacía que el botón dijera "Siguiendo How a Realist Hero Rebuilt the
   * Kingdom" sin haberlo seguido nunca: en el primer dibujado la ficha
   * todavía no ha llegado, así que se comparaba con lo que se había
   * ESCRITO en el buscador —que sí estaba en favoritos— y salía que sí.
   * Un instante después llegaba la ficha, el título cambiaba… pero el
   * "sí" ya estaba grabado y nadie lo volvía a mirar.
   */
  const [favoritos, setFavoritos] = useState<string[]>([]);
  useEffect(() => {
    const leer = () => setFavoritos(getPreferences().favoriteTitles);
    const id = setTimeout(leer, 0);
    window.addEventListener(PREFERENCES_CHANGED_EVENT, leer);
    return () => {
      clearTimeout(id);
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, leer);
    };
  }, []);

  const seguida = favoritos.some((t) => t.toLowerCase() === tituloReal.toLowerCase());

  const alternarSeguir = () => {
    const prefs = getPreferences();
    const nuevos = seguida
      ? prefs.favoriteTitles.filter((t) => t.toLowerCase() !== tituloReal.toLowerCase())
      : [...prefs.favoriteTitles, tituloReal];
    savePreferences({ ...prefs, favoriteTitles: nuevos });
    setFavoritos(nuevos);
    playSuccess();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="panel relative overflow-hidden rounded-2xl px-6 py-10 text-center sm:px-10"
    >
      {/* Resplandor de fondo, para que no sea una caja gris y muerta. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "color-mix(in srgb, var(--ice) 18%, transparent)" }}
        animate={{ opacity: [0.4, 0.75, 0.4], scale: [1, 1.12, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.span
        initial={{ opacity: 0, scale: 0.7, rotate: -20 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-ice/25"
        style={{ background: "color-mix(in srgb, var(--ice) 8%, transparent)" }}
      >
        <BrandMark size={20} />
      </motion.span>

      <motion.h3
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18 }}
        className="font-heading relative text-lg font-semibold text-foreground"
      >
        {caso.titulo}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.26 }}
        className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted"
      >
        {caso.explicacion}
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.34 }}
        className="relative mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted"
      >
        {caso.sugerencia}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.42 }}
        className="relative mt-6 flex flex-wrap items-center justify-center gap-2"
      >
        {ficha && (
          <div className="w-full">
            {/* Se puede dejar de seguir: antes el botón se quedaba
                deshabilitado para siempre y no había vuelta atrás desde
                aquí. */}
            {/*
              Antes era una pastilla de texto sin más. Ahora lleva icono
              y el texto va en dos alturas: arriba la acción y abajo lo
              que consigue, que es lo que de verdad decide si se pulsa.
              El título largo deja de ir dentro del botón — cabía mal y
              lo desbordaba en cuanto la serie tenía nombre oficial.
            */}
            <motion.button
              type="button"
              onClick={alternarSeguir}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={`pulsable group mx-auto flex items-center gap-3 rounded-full py-2.5 pl-3 pr-5 text-left ${
                seguida
                  ? "border border-ice/40 bg-ice/10"
                  : "accent-gradient text-white shadow-lg shadow-black/30"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  seguida ? "bg-ice/15" : "bg-white/15"
                }`}
              >
                <motion.svg
                  key={seguida ? "si" : "no"}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                >
                  {seguida ? (
                    <path
                      d="M3.5 8.5L6.5 11.5L12.5 5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <path
                      d="M8 3.5V12.5M3.5 8H12.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  )}
                </motion.svg>
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold leading-tight ${
                    seguida ? "text-ice" : "text-white"
                  }`}
                >
                  {seguida ? "La estás siguiendo" : "Seguir esta serie"}
                </span>
                <span
                  className={`block text-[11px] leading-tight ${
                    seguida ? "text-ice/70" : "text-white/70"
                  }`}
                >
                  {seguida ? "Toca para dejar de seguirla" : "Sus noticias, las primeras"}
                </span>
              </span>
            </motion.button>
            <p className="mx-auto mt-2.5 max-w-sm text-[11px] leading-snug text-muted">
              {seguida
                ? `Sigues «${tituloReal}». Te avisamos en cuanto salga algo, si tienes los avisos activados.`
                : `Se guardará «${tituloReal}» en tus favoritos.`}
            </p>
          </div>
        )}

        <p className="w-full text-xs text-muted">
          ¿Quieres saber si hay algo confirmado? Pregúntaselo a {siteConfig.assistantName}: sale a
          buscarlo y te dice qué está confirmado y qué solo se rumorea.
        </p>
      </motion.div>
    </motion.div>
  );
}
