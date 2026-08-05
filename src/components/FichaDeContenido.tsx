"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AnimeSearchResult } from "@/lib/anilist";
import { playToggle } from "@/lib/sound";

/**
 * La ficha de la obra buscada.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ SE REHACE (v176)
 *
 * Antes esto eran hasta cuatro tarjetas del mismo tamaño, una al lado de
 * otra. Buscando el nombre de una franquicia salían la serie, la
 * película, el especial y un recopilatorio, todos con el mismo peso
 * visual y sin decir qué relación tenían entre sí. Lo describió bien:
 * lioso.
 *
 * El cambio no es de adorno. Cuando alguien busca "Re:Zero" quiere UNA
 * cosa: la serie. Las demás entregas existen y está bien poder verlas,
 * pero no compiten por la atención: van recogidas debajo, en una línea,
 * y solo se despliegan si se piden.
 *
 * Además la primera ficha es la que usa el resto de la pantalla —el
 * botón de seguir y el archivo de noticias—, así que dejar claro cuál es
 * "la buena" no es solo estética: evita que el botón de seguir hable de
 * una película cuando querías la serie.
 * ---------------------------------------------------------------------
 */

const SUAVE = [0.16, 1, 0.3, 1] as const;

/** "TV · 2016" en vez de "TV · FINISHED · 2016". */
function subtitulo(a: AnimeSearchResult): string {
  const formato = (a.format ?? "").toUpperCase();
  const nombreFormato = formato.includes("TV")
    ? "Serie"
    : formato.includes("MOVIE")
    ? "Película"
    : formato.includes("OVA") || formato.includes("ONA")
    ? "Especial"
    : formato || "Obra";

  const años =
    a.startYear && a.endYear && a.endYear !== a.startYear
      ? `${a.startYear}–${a.endYear}`
      : a.startYear
      ? `${a.startYear}`
      : null;

  // "FINISHED" y "RELEASING" vienen en inglés de la base de datos y no
  // le dicen nada a nadie: se traducen o se callan.
  const estado = (a.status ?? "").toUpperCase();
  const enEmision = estado.includes("RELEASING") || estado.includes("CURRENTLY");
  const sinEstrenar = estado.includes("NOT_YET") || estado.includes("NOT YET");

  return [
    nombreFormato,
    años,
    enEmision ? "en emisión" : sinEstrenar ? "sin estrenar" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function FichaDeContenido({ resultados }: { resultados: AnimeSearchResult[] }) {
  const [verTodas, setVerTodas] = useState(false);
  if (resultados.length === 0) return null;

  const principal = resultados[0];
  const otras = resultados.slice(1, 7);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: SUAVE }}
      className="mb-8"
    >
      {/* La principal, grande y sola. */}
      <div className="panel flex gap-4 rounded-2xl p-5">
        {principal.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element -- fuente externa (AniList/MAL)
          <img
            src={principal.coverImage}
            alt=""
            className="h-36 w-24 flex-shrink-0 rounded-xl object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg font-semibold leading-tight text-foreground">
            {principal.title}
          </p>
          <p className="mt-1 text-xs text-ice">{subtitulo(principal)}</p>
          {principal.description && (
            <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-muted">
              {principal.description}
            </p>
          )}
        </div>
      </div>

      {/* Las demás entregas, recogidas. */}
      {otras.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => {
              setVerTodas((v) => !v);
              playToggle();
            }}
            className="pulsable flex w-full items-center justify-between rounded-xl border border-panel-border px-4 py-2.5 text-left"
          >
            <span className="text-xs text-muted">
              Hay {otras.length} {otras.length === 1 ? "entrega más" : "entregas más"} de esta
              franquicia
            </span>
            <motion.span
              animate={{ rotate: verTodas ? 180 : 0 }}
              transition={{ duration: 0.3, ease: SUAVE }}
              className="text-muted"
            >
              ⌄
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {verTodas && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.32, ease: SUAVE }}
                className="overflow-hidden"
              >
                <div className="mt-2 flex flex-col gap-1">
                  {otras.map((a, i) => (
                    <motion.div
                      key={`${a.id}-${a.title}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.28,
                        delay: Math.min(i * 0.04, 0.2),
                        ease: SUAVE,
                      }}
                      className="flex items-center gap-3 rounded-xl px-3 py-2"
                    >
                      {a.coverImage && (
                        // eslint-disable-next-line @next/next/no-img-element -- fuente externa
                        <img
                          src={a.coverImage}
                          alt=""
                          className="h-12 w-8 flex-shrink-0 rounded-md object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-foreground">{a.title}</p>
                        <p className="text-[11px] text-muted">{subtitulo(a)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
