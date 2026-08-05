"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserPreferences } from "@/types/news";
import { DEFAULT_PREFERENCES, PREFERENCES_CHANGED_EVENT, getPreferences } from "@/lib/storage";
import { getTopAffinities, removeAnimeInterest } from "@/lib/learning";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { playToggle } from "@/lib/sound";
import { getRenMemory, removeRenMemory } from "@/lib/renMemory";
import { genreLabel } from "@/lib/genreNames";
import { siteConfig } from "@/config/site";
import { FavoriteAnimeInput } from "./FavoriteAnimeInput";
import { caratulasDe } from "@/lib/conectar";
import { rellenarAfinidadPendiente } from "@/lib/afinidadTitulos";

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

/**
 * Los favoritos, con su carátula.
 *
 * Una lista de títulos en texto no se parece en nada a una estantería de
 * series. Las carátulas ya están descargadas para el feed, así que
 * enseñarlas aquí no cuesta ninguna petición nueva.
 */
function FavoritosConCaratula() {
  const [titulos, setTitulos] = useState<string[]>([]);
  const [caratulas, setCaratulas] = useState<Record<string, string>>({});
  /*
   * Para qué lista de títulos se ha terminado ya de preguntar.
   *
   * Se guarda la lista y no un simple sí/no para no tener que ponerlo a
   * "no" a mano cuando cambian los favoritos: si la lista es otra, esta
   * comparación ya da falso sola. Sirve para dejar de esperar cuando la
   * carátula sencillamente no existe — antes el hueco se quedaba
   * latiendo indefinidamente y parecía una imagen que no carga.
   */
  const [resueltoPara, setResueltoPara] = useState("");

  useEffect(() => {
    const leer = () => setTitulos(getPreferences().favoriteTitles ?? []);
    const id = setTimeout(leer, 0);
    // Se relee cuando cambian: el buscador de abajo guarda directamente
    // en las preferencias y avisa por este evento.
    window.addEventListener(PREFERENCES_CHANGED_EVENT, leer);
    return () => {
      clearTimeout(id);
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, leer);
    };
  }, []);

  useEffect(() => {
    if (titulos.length === 0) return;
    let vivo = true;
    const clave = titulos.join("|");
    void caratulasDe(titulos)
      .then((c) => {
        if (vivo) setCaratulas((prev) => ({ ...prev, ...c }));
      })
      .finally(() => {
        if (vivo) setResueltoPara(clave);
      });
    return () => {
      vivo = false;
    };
  }, [titulos]);

  if (titulos.length === 0) {
    return (
      <p className="rounded-xl border border-panel-border px-4 py-3 text-xs leading-relaxed text-muted">
        Todavía no has marcado ninguno. Búscalos aquí abajo: es lo que más cambia tu feed.
      </p>
    );
  }

  const resuelto = resueltoPara === titulos.join("|");

  return (
    <div className="flex flex-wrap gap-3">
      {titulos.map((t, i) => (
        <motion.div
          key={t}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: Math.min(i * 0.05, 0.3), ease: "easeOut" }}
          className="w-[86px]"
        >
          <div className="aspect-[2/3] overflow-hidden rounded-lg border border-panel-border bg-panel-soft">
            {caratulas[t] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={caratulas[t]} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : resuelto ? (
              // Sin carátula disponible: se enseña la inicial en vez de
              // un rectángulo vacío, para que se vea que la serie está
              // guardada y no que la pantalla se ha quedado a medias.
              <div className="flex h-full w-full items-center justify-center bg-panel-soft">
                <span className="font-heading text-lg text-muted">{t.slice(0, 1)}</span>
              </div>
            ) : (
              <div className="h-full w-full animate-pulse bg-panel-border/40" />
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted">{t}</p>
        </motion.div>
      ))}
    </div>
  );
}

function AffinityRow({
  name,
  count,
  max,
  examples,
  delay = 0,
}: {
  name: string;
  count: number;
  max: number;
  examples: string[];
  delay?: number;
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
          // Arranca DESPUÉS de que la fila haya terminado de entrar (de ahí
          // el 0.3 de base) y tarda casi un segundo en llenarse. Antes salía
          // a la vez que el resto y de un tirón, y por eso se veía como un
          // pegote al final de la animación de la página.
          // Un segundo largo y arrancando tras la fila: en el ordenador, con
          // 0,65s se rellenaban de un plumazo y no daba tiempo a verlas.
          transition={{ duration: 1.05, delay: 0.35 + delay, ease: [0.22, 1, 0.36, 1] }}
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
  const [ready, setReady] = useState(false);

  // Los datos viven en localStorage, así que no existen hasta que el
  // componente ya está montado. Antes se pintaba la página vacía y las
  // barras aparecían después, de golpe y sin animación, que es lo que se
  // veía tan mal. Ahora no se pinta nada hasta tenerlo todo, y entonces
  // entra junto y animado.
  /*
   * useLayoutEffect y no useEffect: los datos están en localStorage, o
   * sea que se leen al instante, y esto ocurre ANTES de que el navegador
   * pinte. Así no se llega a ver el marcador de posición y las barras
   * empiezan su animación desde el primer fotograma.
   *
   * Con useEffect el navegador pintaba primero el esqueleto y después
   * cambiaba: en el ordenador, que va sobrado, eso se traducía en barras
   * que aparecían de golpe o a destiempo. En el móvil no se notaba
   * porque todo iba más lento y coincidía.
   */
  const usarEfectoDePintado = typeof window === "undefined" ? useEffect : useLayoutEffect;
  usarEfectoDePintado(() => {
    setPrefs(getPreferences());
    setMemories(getRenMemory());
    setReady(true);
  }, []);

  /*
   * Recupera los estudios de las series que ya tenías guardadas.
   *
   * Durante mucho tiempo, marcar un favorito apuntaba sus géneros pero
   * mandaba los estudios vacíos, y como esta sección solo se pinta si
   * hay algún estudio con puntos, se quedaba en blanco: desde fuera
   * parecía que el apartado hubiera desaparecido. Esto lo rellena una
   * sola vez con lo que ya está guardado, sin que haya que volver a
   * marcar nada.
   *
   * Va aparte del efecto de arriba y sin bloquear el pintado: la
   * pantalla sale al instante con lo que haya y, cuando llega la
   * respuesta, aparecen los estudios.
   */
  useEffect(() => {
    let vivo = true;
    void rellenarAfinidadPendiente().then((huboCambios) => {
      if (vivo && huboCambios) setPrefs(getPreferences());
    });
    return () => {
      vivo = false;
    };
  }, []);

  const handleForgetSeries = (title: string) => {
    removeAnimeInterest(title);
    setPrefs(getPreferences());
    playToggle();
  };

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

      <motion.div
        className="panel mt-8 rounded-2xl p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Se espera a las DOS cosas: a haber leído los datos del
            navegador (ready) y a saber si hay sesión (isLoggedIn deja de
            ser null). Antes bastaba con la primera, así que se dibujaba
            el contenido con las barras animándose y, al resolverse la
            segunda, se volvía a montar todo de golpe y sin animación. */}
        {!ready || isLoggedIn === null ? (
          // Marcador de posición mientras se leen los datos del navegador.
          // Ocupa el mismo sitio que el contenido real, así que al llegar
          // no da el salto que quedaba tan feo.
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="mb-2 h-3 w-32 rounded bg-panel-border/50" />
                <div className="h-1.5 w-full rounded-full bg-panel-border/40" />
              </div>
            ))}
          </div>
        ) : isLoggedIn === false ? (
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
        ) : (
          <>
        {/*
          Los favoritos, arriba del todo.

          Estaban SOLO en la pantalla de Perfil, así que la página que se
          llama "Tus gustos" no enseñaba lo que más peso tiene con
          diferencia al ordenar el feed. Se marcaban en un sitio y no
          aparecían en el otro, y desde fuera eso parece que no se hayan
          guardado.

          Van los primeros porque son lo único que eliges tú a mano: todo
          lo demás de esta página lo ha deducido la app.
        */}
        <div className="mb-8">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
            Tus favoritos
          </h2>
          <p className="mb-4 mt-1 text-[11px] leading-snug text-muted">
            Los eliges tú, y son lo que más pesa: sus noticias te salen las primeras y son con lo
            que se te empareja en Conectar.
          </p>
          <FavoritosConCaratula />
          <div className="mt-3">
            <FavoriteAnimeInput />
          </div>
        </div>

        {!hasLearned ? (
          <p className="text-sm text-muted">
            Todavía no hay nada. Dale <span className="ice-text">♡</span> a alguna noticia del feed o
            pregúntale a {siteConfig.assistantName} por una serie, y esto se irá llenando solo.
          </p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2">
            {topGenres.length > 0 && (
              <div>
                <h2 className="font-heading mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
                  Géneros
                </h2>
                <div className="flex flex-col gap-4">
                  {topGenres.map((g, i) => (
                    <motion.div
                      key={g.name}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.34, delay: i * 0.1, ease: "easeOut" }}
                    >
                      <AffinityRow
                        name={genreLabel(g.name)}
                        count={g.count}
                        max={maxCount}
                        examples={prefs.genreExamples?.[g.name] ?? []}
                        delay={i * 0.1}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {topStudios.length > 0 && (
              <div>
                <h2 className="font-heading mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
                  Estudios
                </h2>
                <div className="flex flex-col gap-4">
                  {topStudios.map((s, i) => (
                    <motion.div
                      key={s.name}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.34, delay: i * 0.1, ease: "easeOut" }}
                    >
                      <AffinityRow
                        name={s.name}
                        count={s.count}
                        max={maxCount}
                        examples={prefs.studioExamples?.[s.name] ?? []}
                        delay={i * 0.1}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}

        {topTitles.length > 0 && (
          <div className="mt-8 border-t border-panel-border/70 pt-6">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
              Series que sigues de cerca
            </h2>
            <p className="mb-4 mt-1 text-[11px] leading-snug text-muted">
              Sus noticias te salen antes. Quita las que no te interesen.
            </p>
            <div className="flex flex-wrap gap-2">
              {topTitles.map((t, i) => (
                <motion.span
                  key={t.name}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.9 + i * 0.04, ease: "easeOut" }}
                  className="inline-flex items-center gap-2 rounded-full border border-ice/25 bg-ice/5 py-1.5 pl-3 pr-2 text-xs text-foreground"
                >
                  {t.name}
                  <button
                    type="button"
                    onClick={() => handleForgetSeries(t.name)}
                    aria-label={`Dejar de seguir ${t.name}`}
                    title="Quitar de la lista"
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-muted transition-colors hover:bg-panel-soft hover:text-foreground"
                  >
                    ✕
                  </button>
                </motion.span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

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
