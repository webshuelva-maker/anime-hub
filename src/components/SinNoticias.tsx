"use client";

import { motion } from "framer-motion";
import type { AnimeSearchResult } from "@/lib/anilist";
import { BrandMark } from "./BrandMark";
import { siteConfig } from "@/config/site";
import { getPreferences, savePreferences } from "@/lib/storage";
import { playSuccess } from "@/lib/sound";
import { useState } from "react";

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

function analizar(termino: string, ficha: AnimeSearchResult | undefined): Caso {
  if (ficha?.status === "FINISHED" && ficha.endYear) {
    const anios = new Date().getFullYear() - ficha.endYear;
    return {
      titulo: "Está todo contado",
      explicacion:
        anios >= 2
          ? `${ficha.title} terminó en ${ficha.endYear}. Después de ${anios} años, lo normal es que ya no se publique nada nuevo.`
          : `${ficha.title} terminó en ${ficha.endYear}, así que las noticias han ido apagándose.`,
      sugerencia:
        "Si algún día anuncian una continuación, será lo primero que aparezca en tu feed.",
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
  ficha,
}: {
  termino: string;
  ficha: AnimeSearchResult | undefined;
}) {
  const caso = analizar(termino, ficha);
  const tituloReal = ficha?.title ?? termino;
  const [seguida, setSeguida] = useState(() => {
    if (typeof window === "undefined") return false;
    return getPreferences().favoriteTitles.some(
      (t) => t.toLowerCase() === tituloReal.toLowerCase()
    );
  });

  const seguir = () => {
    const prefs = getPreferences();
    if (prefs.favoriteTitles.some((t) => t.toLowerCase() === tituloReal.toLowerCase())) return;
    savePreferences({ ...prefs, favoriteTitles: [...prefs.favoriteTitles, tituloReal] });
    setSeguida(true);
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
          <button
            type="button"
            onClick={seguir}
            disabled={seguida}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-transform hover:scale-105 active:scale-95 ${
              seguida
                ? "border border-ice/30 bg-ice/10 text-ice"
                : "accent-gradient text-white"
            }`}
          >
            {seguida ? `Siguiendo ${tituloReal}` : `Seguir ${tituloReal}`}
          </button>
        )}

        <p className="w-full text-xs text-muted">
          ¿Quieres saber si hay algo confirmado? Pregúntaselo a {siteConfig.assistantName}: sale a
          buscarlo y te dice qué está confirmado y qué solo se rumorea.
        </p>
      </motion.div>
    </motion.div>
  );
}
