"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { NOVEDADES, ULTIMA_VERSION } from "@/data/changelog";
import { getPreferences, savePreferences } from "@/lib/storage";
import { siteConfig } from "@/config/site";

/**
 * Pantalla de novedades.
 *
 * Al abrirla se marca la última versión como vista, que es lo que apaga
 * el punto del menú. Se hace aquí y no al pulsar el enlace a propósito:
 * si se marcara antes de llegar, bastaría rozar el botón sin querer para
 * perderse el aviso.
 */
export function NovedadesList() {
  useEffect(() => {
    const prefs = getPreferences();
    if (prefs.lastSeenChangelog !== ULTIMA_VERSION) {
      savePreferences({ ...prefs, lastSeenChangelog: ULTIMA_VERSION });
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">Novedades</h1>
      <p className="mt-1 text-sm text-muted">
        Lo que ha ido cambiando en {siteConfig.name}, de lo más reciente a lo más antiguo.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {NOVEDADES.map((entrada, i) => (
          <motion.article
            key={entrada.version}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="panel rounded-2xl p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-base font-semibold">{entrada.titulo}</h2>
              {i === 0 && (
                <span className="rounded-full border border-ice/40 bg-ice/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ice">
                  Nuevo
                </span>
              )}
              <span className="ml-auto text-[11px] text-muted">
                {new Date(entrada.fecha).toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>

            {entrada.intro && (
              <p className="mt-2 text-sm leading-relaxed text-foreground/85">{entrada.intro}</p>
            )}

            <ul className="mt-3 flex flex-col gap-1.5">
              {entrada.puntos.map((punto) => (
                <li key={punto} className="flex gap-2 text-sm leading-snug text-muted">
                  <span className="ice-text mt-[2px] flex-shrink-0">·</span>
                  <span>{punto}</span>
                </li>
              ))}
            </ul>
          </motion.article>
        ))}
      </div>
    </div>
  );
}
