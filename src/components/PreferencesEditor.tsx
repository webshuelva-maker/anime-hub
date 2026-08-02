"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserPreferences } from "@/types/news";
import { DEFAULT_PREFERENCES, getPreferences } from "@/lib/storage";
import { getTopAffinities } from "@/lib/learning";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { playToggle } from "@/lib/sound";
import { getRenMemory, removeRenMemory } from "@/lib/renMemory";
import { siteConfig } from "@/config/site";

/**
 * Pantalla de Afinidad: SOLO lo que la app ha aprendido de ti.
 *
 * Antes esta página llevaba encima también todos los ajustes y el botón
 * de borrarlo todo, mientras que en Perfil había otros ajustes distintos.
 * Los ajustes se han ido a su propia pantalla; aquí solo queda lo que la
 * app sabe de tus gustos, que es lo que el nombre promete.
 *
 * Y se explica en cristiano. Una barra con un "14" al lado no le dice
 * nada a nadie, y menos en la sección de estudios: casi nadie sabe qué es
 * Bones ni CloverWorks, pero todo el mundo reconoce las series que ha
 * visto. Así que cada afinidad va con el porqué: de qué series te viene.
 */

/** Traduce la fuerza de una afinidad a algo que se entienda de un vistazo. */
function strengthLabel(pct: number): string {
  if (pct >= 80) return "te encanta";
  if (pct >= 55) return "te gusta bastante";
  if (pct >= 30) return "te gusta";
  return "te llama algo";
}

function AffinityRow({
  name,
  count,
  max,
  examples,
}: {
  name: string;
  count: number;
  max: number;
  examples: string[];
}) {
  const pct = Math.max(8, Math.round((count / max) * 100));

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm text-foreground">{name}</span>
        <span className="text-[11px] text-muted">{strengthLabel(pct)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-border/60">
        <motion.div
          className="accent-gradient h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      {examples.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          Te viene de {examples.slice(0, 2).join(" y ")}
        </p>
      )}
    </div>
  );
}

export function PreferencesEditor() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [memories, setMemories] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(getPreferences());
    setMemories(getRenMemory());
  }, []);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(() =>
    process.env.NEXT_PUBLIC_SUPABASE_URL ? null : false
  );
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user));
  }, []);

  const handleForget = (fact: string) => {
    removeRenMemory(fact);
    setMemories((prev) => prev.filter((m) => m !== fact));
    playToggle();
  };

  const topGenres = getTopAffinities(prefs.genreInteractionCounts, 5);
  const topStudios = getTopAffinities(prefs.studioInteractionCounts, 5);
  const topTitles = getTopAffinities(prefs.titleInterestCounts ?? {}, 8);
  const maxCount = Math.max(1, ...topGenres.map((g) => g.count), ...topStudios.map((s) => s.count));
  const hasLearned = topGenres.length > 0 || topStudios.length > 0 || topTitles.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">Tus gustos</h1>
      <p className="mt-1 text-sm text-muted">
        Lo que la app ha ido aprendiendo sola, con lo que lees, lo que marcas con{" "}
        <span className="ice-text">♡</span> y lo que le preguntas a {siteConfig.assistantName}. Con
        esto ordena tu feed.
      </p>

      <div className="panel mt-8 rounded-2xl p-6">
        {isLoggedIn === false ? (
          <div className="text-center">
            <p className="text-sm text-muted">
              Los gustos aprendidos son una función de cuenta — créate una gratis para que el feed
              aprenda de ti.
            </p>
            <Link
              href="/login"
              className="accent-gradient mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
            >
              Iniciar sesión / Crear cuenta
            </Link>
          </div>
        ) : !hasLearned ? (
          <p className="text-sm text-muted">
            Todavía no hay nada. Dale <span className="ice-text">♡</span> a alguna noticia del feed o
            pregúntale a {siteConfig.assistantName} por una serie, y esto se irá llenando solo.
          </p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2">
            {topGenres.length > 0 && (
              <div>
                <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
                  Qué tipo de historias buscas
                </h2>
                <p className="mb-4 mt-1 text-[11px] leading-snug text-muted">
                  Los géneros que más se repiten en lo que lees.
                </p>
                <div className="flex flex-col gap-4">
                  {topGenres.map((g) => (
                    <motion.div
                      key={g.name}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <AffinityRow
                        name={g.name}
                        count={g.count}
                        max={maxCount}
                        examples={prefs.genreExamples?.[g.name] ?? []}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {topStudios.length > 0 && (
              <div>
                <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
                  Quién lo hace
                </h2>
                <p className="mb-4 mt-1 text-[11px] leading-snug text-muted">
                  Los estudios de animación detrás de lo que te gusta. No hace falta que los
                  conozcas: debajo de cada uno pone de qué series te viene.
                </p>
                <div className="flex flex-col gap-4">
                  {topStudios.map((s) => (
                    <motion.div
                      key={s.name}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <AffinityRow
                        name={s.name}
                        count={s.count}
                        max={maxCount}
                        examples={prefs.studioExamples?.[s.name] ?? []}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {topTitles.length > 0 && (
          <div className="mt-8 border-t border-panel-border/70 pt-6">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
              Series que sigues de cerca
            </h2>
            <p className="mb-4 mt-1 text-[11px] leading-snug text-muted">
              Sus noticias te salen antes en el feed.
            </p>
            <div className="flex flex-wrap gap-2">
              {topTitles.map((t) => (
                <motion.span
                  key={t.name}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="inline-flex items-center rounded-full border border-ice/25 bg-ice/5 px-3 py-1.5 text-xs text-foreground"
                >
                  {t.name}
                </motion.span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rule-line my-8" />

      <h2 className="font-heading text-lg font-semibold">
        Lo que {siteConfig.assistantName} recuerda de ti
      </h2>
      <p className="mt-1 text-sm text-muted">
        Cosas que ha ido guardando mientras hablabais. Si algo no es verdad, quítalo y dejará de
        tenerlo en cuenta.
      </p>

      <div className="panel mt-4 rounded-2xl p-6">
        {memories.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no recuerda nada tuyo. Se irá llenando según habléis.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {memories.map((m) => (
              <motion.div
                key={m}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex items-start gap-3 rounded-xl border border-panel-border/70 bg-panel-soft/40 px-3 py-2"
              >
                <span className="flex-1 text-sm leading-snug text-foreground">{m}</span>
                <button
                  type="button"
                  onClick={() => handleForget(m)}
                  aria-label="Olvidar esto"
                  title="Olvidar esto"
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-soft hover:text-foreground"
                >
                  ✕
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <Link
          href="/ajustes"
          className="rounded-full border border-panel-border px-4 py-2 text-sm text-muted transition-colors hover:border-ice/40 hover:text-foreground"
        >
          Ajustes de la app →
        </Link>
      </div>
    </div>
  );
}
