"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getPreferences, savePreferences, PREFERENCES_CHANGED_EVENT } from "@/lib/storage";
import { playToggle, playSuccess, playError } from "@/lib/sound";

/**
 * Lista de animes favoritos, con dos diferencias respecto a la anterior:
 *
 * 1. SE GUARDA SOLA. Antes había que acordarse de pulsar "Guardar
 *    cambios" abajo del todo; si salías de la pantalla sin darle, se
 *    perdía lo que habías escrito y no había ninguna pista de ello.
 * 2. COMPRUEBA QUE EL ANIME EXISTE. Antes aceptaba cualquier cosa, así
 *    que escribir "vghjwx" te dejaba un favorito inventado que no iba a
 *    coincidir nunca con ninguna noticia. Ahora se busca en AniList y, si
 *    no aparece, se dice.
 *
 * Además se guarda el título tal y como lo conoce la base de datos, no
 * como lo escribiste: así coincide con lo que traen las noticias aunque
 * lo hayas escrito a medias o con otra grafía.
 */

/** ¿El resultado se parece de verdad a lo que se pidió? */
function titulosCoinciden(pedido: string, encontrado: string): boolean {
  const palabras = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3);

  const a = palabras(pedido);
  const b = palabras(encontrado);
  if (a.length === 0 || b.length === 0) return false;
  return a.some((w) => b.includes(w)) || b.some((w) => a.includes(w));
}

export function FavoriteAnimeInput() {
  const [titles, setTitles] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [comprobando, setComprobando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimoAñadido, setUltimoAñadido] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setTitles(getPreferences().favoriteTitles);
    refresh();
    window.addEventListener(PREFERENCES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, refresh);
  }, []);

  const guardar = (nuevos: string[]) => {
    const prefs = getPreferences();
    savePreferences({ ...prefs, favoriteTitles: nuevos });
    setTitles(nuevos);
  };

  const añadir = async () => {
    const escrito = draft.trim();
    if (!escrito || comprobando) return;

    setError(null);

    if (titles.some((t) => t.toLowerCase() === escrito.toLowerCase())) {
      setError("Ese ya está en la lista.");
      setDraft("");
      return;
    }

    setComprobando(true);
    try {
      const res = await fetch(`/api/anime-facts?title=${encodeURIComponent(escrito)}`);
      const data = (await res.json()) as { facts?: { title?: string } | null };

      if (!data.facts?.title || !titulosCoinciden(escrito, data.facts.title)) {
        playError();
        setError(`No encuentro ningún anime que se llame «${escrito}». ¿Está bien escrito?`);
        return;
      }

      const canonico = data.facts.title;
      if (titles.some((t) => t.toLowerCase() === canonico.toLowerCase())) {
        setError("Ese ya está en la lista.");
        setDraft("");
        return;
      }

      guardar([...titles, canonico]);
      setDraft("");
      setUltimoAñadido(canonico);
      setTimeout(() => setUltimoAñadido(null), 2200);
      playSuccess();
    } catch {
      playError();
      setError("No he podido comprobarlo ahora mismo. Inténtalo en un momento.");
    } finally {
      setComprobando(false);
    }
  };

  const quitar = (titulo: string) => {
    guardar(titles.filter((t) => t !== titulo));
    playToggle();
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void añadir();
            }
          }}
          placeholder="Ej: One Piece"
          className="panel-elevated flex-1 rounded-lg px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void añadir()}
          disabled={comprobando || draft.trim().length === 0}
          className="accent-gradient rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {comprobando ? "Buscando…" : "Añadir"}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-xs text-rumor"
          >
            {error}
          </motion.p>
        )}
        {!error && ultimoAñadido && (
          <motion.p
            key="ok"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="ice-text mt-2 text-xs"
          >
            {ultimoAñadido} añadido y guardado.
          </motion.p>
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
