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

export function FichaDeContenido({
  resultados,
  cargando = false,
}: {
  resultados: AnimeSearchResult[];
  /** Mientras se pregunta a las bases de datos. */
  cargando?: boolean;
}) {
  const [verTodas, setVerTodas] = useState(false);

  /*
   * El HUECO SE RESERVA DESDE EL PRIMER MOMENTO.
   *
   * Las noticias del feed están ya en el navegador y se pintan al
   * instante; la ficha viene de tres bases de datos externas y tarda un
   * segundo largo. Como esta ficha va ARRIBA, al llegar empujaba hacia
   * abajo todo lo que ya estabas leyendo. Ese salto es de las cosas que
   * peor sientan de una interfaz, y no se arregla haciéndolo más rápido:
   * se arregla no moviendo nada.
   *
   * Así que mientras se busca se dibuja una silueta del mismo tamaño que
   * la ficha real. Cuando llega, ocupa ese hueco y no se mueve nada de
   * su sitio.
   */
  const principal = resultados[0];
  const otras = resultados.slice(1, 7);
  const mostrarSilueta = cargando && resultados.length === 0;

  /*
   * TODO va dentro de un único AnimatePresence, y esto era el fallo.
   *
   * La silueta y la ficha ya tenían su animación de salida, pero se
   * devolvían desde returns distintos, sin nada que las envolviera.
   * AnimatePresence es lo único que puede retener un elemento mientras
   * se va: sin él, la propiedad "exit" no se ejecuta NUNCA y React
   * cambia una cosa por otra de golpe. Por eso en el buscador de
   * favoritos —que sí lo tenía— se veía bien, y aquí no.
   *
   * "mode: wait" hace además que la silueta termine de desvanecerse
   * antes de que entre la ficha, en vez de solaparse.
   */
  return (
    <AnimatePresence mode="wait" initial={false}>
      {mostrarSilueta && (
      <motion.div
        key="silueta"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-8"
        aria-hidden
      >
        <div className="panel flex gap-4 rounded-2xl p-5">
          <div className="h-36 w-24 flex-shrink-0 animate-pulse rounded-xl bg-panel-soft" />
          <div className="min-w-0 flex-1 space-y-2.5 py-1">
            <div className="h-5 w-2/3 animate-pulse rounded bg-panel-soft" />
            <div className="h-3 w-24 animate-pulse rounded bg-panel-soft" />
            <div className="h-3 w-full animate-pulse rounded bg-panel-soft/70" />
            <div className="h-3 w-full animate-pulse rounded bg-panel-soft/70" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-panel-soft/70" />
          </div>
        </div>
        <div className="mt-2 h-[42px] animate-pulse rounded-xl border border-panel-border" />
      </motion.div>
      )}

      {principal && (
    <motion.div
      key="ficha"
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: SUAVE }}
      className="mb-8"
    >
      {/* La principal, grande y sola. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, delay: 0.06, ease: SUAVE }}
        className="panel flex gap-4 rounded-2xl p-5"
      >
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
      </motion.div>

      {/* Las demás entregas, recogidas. */}
      {otras.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.16, ease: SUAVE }}
          className="mt-2"
        >
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
            {/*
              Antes era el carácter "⌄", y por eso te bailaba: los signos
              de una tipografía se dibujan dentro de su propia caja, con
              su hueco arriba y abajo, así que centrarlo a ojo nunca
              cuadra del todo — y encima cada tipografía lo coloca a su
              manera. Un dibujo vectorial no tiene ese hueco: ocupa
              exactamente lo que ocupa y se centra solo.
            */}
            <motion.svg
              animate={{ rotate: verTodas ? 180 : 0 }}
              transition={{ duration: 0.32, ease: SUAVE }}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              className="shrink-0 text-muted"
            >
              <path
                d="M4 6.5L8 10.5L12 6.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          </button>

          <AnimatePresence initial={false}>
            {verTodas && (
              /*
                La CLAVE es lo que faltaba para que el cierre se animara.
                AnimatePresence necesita una clave en su hijo directo para
                seguirle la pista mientras se va; sin ella lo daba por
                desmontado al instante y el bloque desaparecía de golpe.
                Por eso abrir se veía bien y cerrar no.

                Y la opacidad se apaga más deprisa que la altura, para que
                el texto no se quede visible aplastándose contra el borde
                mientras el hueco se cierra.
              */
              <motion.div
                key="otras-entregas"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { duration: 0.34, ease: SUAVE },
                  opacity: { duration: verTodas ? 0.26 : 0.15, ease: "easeOut" },
                }}
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
        </motion.div>
      )}
    </motion.div>
      )}
    </AnimatePresence>
  );
}
