"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { getPreferences, savePreferences, PREFERENCES_CHANGED_EVENT } from "@/lib/storage";
import { boostCategories } from "@/lib/learning";
import { playToggle, playSuccess } from "@/lib/sound";

/**
 * Añadir animes favoritos BUSCANDO, no escribiendo a ciegas.
 *
 * La versión anterior pedía el título exacto y lo validaba en un
 * segundo paso: si no coincidía, te decía que no existía. Y fallaba
 * incluso con títulos correctos, porque cualquier tropiezo en la
 * consulta de fichas se traducía en "no lo encuentro" — un diagnóstico
 * falso y muy frustrante.
 *
 * Ahora escribes y salen resultados reales con su carátula y su año, y
 * eliges. Ya no hay nada que "acertar": si la serie está, la ves. Y de
 * paso se resuelven los nombres a medias ("re zero", "sao", "mushoku").
 *
 * Todo se guarda al momento, sin botón de confirmar.
 */

interface Resultado {
  id: number;
  title: string;
  coverImage: string | null;
  startYear: number | null;
  format: string | null;
  genres: string[];
  studios: string[];
}

export function FavoriteAnimeInput() {
  const [titles, setTitles] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Qué contestó cada base de datos. Se enseña solo cuando no hay nada. */
  const [diagnostico, setDiagnostico] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setTitles(getPreferences().favoriteTitles);
    refresh();
    window.addEventListener(PREFERENCES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, refresh);
  }, []);

  // Búsqueda con freno: se espera a que dejes de teclear 400ms para no
  // lanzar una petición por cada letra.
  useEffect(() => {
    const termino = draft.trim();

    // Todo el trabajo va dentro del temporizador, incluido el limpiar los
    // resultados: cambiar estado directamente en el cuerpo del efecto
    // encadena renderizados y el linter lo marca con razón.
    const id = setTimeout(async () => {
      if (termino.length < 2) {
        setResultados([]);
        setAviso(null);
        return;
      }
      // El "Buscando…" se enciende dentro del temporizador, no al
      // teclear: si no, parpadearía con cada letra aunque todavía no se
      // haya pedido nada.
      setBuscando(true);
      try {
        const res = await fetch(`/api/anime-search?q=${encodeURIComponent(termino)}`);
        const data = (await res.json()) as {
          results?: Resultado[];
          fuente?: string;
          debug?: string;
        };
        const encontrados = data.results ?? [];
        setResultados(encontrados.slice(0, 6));
        setDiagnostico(encontrados.length === 0 ? (data.debug ?? null) : null);
        // Se distingue "no existe" de "no he podido buscar". Antes se
        // decía siempre lo primero, y con las dos bases caídas eso es un
        // diagnóstico falso: el anime existe, lo que falla es la consulta.
        setAviso(
          encontrados.length > 0
            ? null
            : data.fuente === "ninguna"
              ? "No he podido consultar la base de datos ahora mismo. Inténtalo en unos segundos."
              : "No hay ningún anime con ese nombre. Prueba con menos palabras."
        );
      } catch {
        setResultados([]);
        setAviso("No he podido consultar la base de datos ahora mismo. Inténtalo en unos segundos.");
      } finally {
        setBuscando(false);
      }
    }, 400);

    return () => clearTimeout(id);
  }, [draft]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setResultados([]);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const añadir = (r: Resultado) => {
    const prefs = getPreferences();
    if (prefs.favoriteTitles.some((t) => t.toLowerCase() === r.title.toLowerCase())) {
      setDraft("");
      setResultados([]);
      return;
    }

    savePreferences({ ...prefs, favoriteTitles: [...prefs.favoriteTitles, r.title] });
    // Sus géneros Y estudios cuentan también para la afinidad: marcar
    // algo como favorito es la señal más clara que existe de lo que te
    // gusta. Antes aquí siempre se mandaba [] de estudios, así que un
    // favorito nunca reforzaba ningún estudio y la sección "Estudios" de
    // Tus gustos se quedaba vacía por más favoritos que marcaras.
    boostCategories(r.genres ?? [], r.studios ?? [], 3, r.title);
    setTitles([...prefs.favoriteTitles, r.title]);
    setDraft("");
    setResultados([]);
    playSuccess();
  };

  const quitar = (titulo: string) => {
    const prefs = getPreferences();
    const nuevos = prefs.favoriteTitles.filter((t) => t !== titulo);
    savePreferences({ ...prefs, favoriteTitles: nuevos });
    setTitles(nuevos);
    playToggle();
  };

  return (
    <div ref={cajaRef} className="relative">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Escribe y elige de la lista — ej: mushoku"
        className="panel-elevated w-full rounded-lg px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
      />

      <AnimatePresence>
        {draft.trim().length >= 2 && (resultados.length > 0 || buscando || aviso) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            // "layout" hace que el recuadro cambie de alto animándose al
            // pasar de una línea ("Buscando…") a la lista de resultados,
            // en vez de dar el estirón de golpe.
            layout
            className="panel absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-panel-border shadow-xl shadow-black/40"
          >
            {/*
               El contenido cambia con un CRUCE, no de golpe.

               El desplegable ya entraba animado, pero por dentro el
               "Buscando…" se sustituía por la lista entera de una
               tacada: el recuadro pegaba un estirón y los resultados
               aparecían de golpe. Es el momento más visible de toda la
               búsqueda y era el único sin transición.

               "mode: wait" hace que lo viejo termine de irse antes de
               que entre lo nuevo, y animar la altura evita el salto del
               recuadro al pasar de una línea a seis resultados.
            */}
            <AnimatePresence mode="wait" initial={false}>
              {buscando && resultados.length === 0 && (
                <motion.p
                  key="buscando"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="px-3 py-3 text-xs text-muted"
                >
                  Buscando…
                </motion.p>
              )}

              {resultados.length > 0 && (
                <motion.div
                  key="resultados"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  {resultados.map((r, i) => (
                    <motion.button
                      key={r.id}
                      type="button"
                      onClick={() => añadir(r)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      // Escalonado corto y con tope: con ocho resultados,
                      // esperar a que entre el último sería más molesto
                      // que el salto que se quería evitar.
                      transition={{ duration: 0.22, delay: Math.min(i * 0.035, 0.18) }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-panel-soft"
                    >
                      {r.coverImage ? (
                        <Image
                          src={r.coverImage}
                          alt=""
                          width={32}
                          height={44}
                          unoptimized
                          className="h-11 w-8 flex-shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="h-11 w-8 flex-shrink-0 rounded bg-panel-soft" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{r.title}</span>
                        <span className="text-[11px] text-muted">
                          {[r.format, r.startYear].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {!buscando && aviso && resultados.length === 0 && (
              <div className="px-3 py-3">
                <p className="text-xs text-muted">{aviso}</p>
                {/* Detalle técnico a la vista cuando no hay resultados:
                    dice qué respondió cada base de datos, para no tener
                    que adivinar por qué una búsqueda vuelve vacía. */}
                {diagnostico && (
                  <p className="mt-1.5 break-words text-[10px] leading-snug text-muted/70">
                    {diagnostico}
                  </p>
                )}
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>

      {titles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {titles.map((titulo) => (
              <motion.span
                key={titulo}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="inline-flex items-center gap-2 rounded-full border border-ice/25 bg-ice/5 py-1.5 pl-3 pr-2 text-xs text-foreground"
              >
                {titulo}
                <button
                  type="button"
                  onClick={() => quitar(titulo)}
                  aria-label={`Quitar ${titulo}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-muted transition-colors hover:bg-panel-soft hover:text-foreground"
                >
                  ✕
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
