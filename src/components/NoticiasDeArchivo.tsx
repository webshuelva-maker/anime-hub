"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * El archivo de noticias de una serie, traído de MyAnimeList.
 *
 * Aparece cuando los medios que sigue el feed no han publicado nada
 * reciente sobre lo buscado. Antes ahí se acababa la pantalla con un
 * "nada por aquí": ahora se va a buscar el historial de esa serie, que
 * suele tener justo lo que se estaba buscando (cuándo se confirmó la
 * siguiente temporada, cuándo se anunció la fecha…).
 *
 * Se enseña separado y con su origen a la vista, porque no son las
 * noticias del feed: son de otra fuente, en inglés, y llevan a MAL en
 * vez de a un medio en español.
 */

interface NoticiaMal {
  title: string;
  url: string;
  date: string | null;
  excerpt: string;
}

const SUAVE = [0.16, 1, 0.3, 1] as const;

function fecha(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

export function NoticiasDeArchivo({ titulo }: { titulo: string }) {
  const [noticias, setNoticias] = useState<NoticiaMal[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    // El "cargando" se pone dentro del temporizador: llamar a setState
    // en el mismo paso del efecto encadena redibujados.
    const id = setTimeout(async () => {
      setCargando(true);
      try {
        const res = await fetch(`/api/anime-noticias?titulo=${encodeURIComponent(titulo)}`);
        const json = (await res.json()) as { noticias?: NoticiaMal[] };
        if (vivo) setNoticias(json.noticias ?? []);
      } catch {
        if (vivo) setNoticias([]);
      } finally {
        if (vivo) setCargando(false);
      }
    }, 0);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [titulo]);

  if (cargando) {
    return (
      <motion.p
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        className="mt-8 text-xs text-muted"
      >
        Buscando en el archivo de MyAnimeList…
      </motion.p>
    );
  }

  if (noticias.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Noticias anteriores sobre esta serie
        </p>
        <p className="text-[10px] text-muted">Archivo de MyAnimeList · en inglés</p>
      </div>

      <div className="panel divide-y divide-panel-border overflow-hidden rounded-2xl">
        {noticias.map((n, i) => (
          <motion.a
            key={n.url}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: Math.min(i * 0.05, 0.3), ease: SUAVE }}
            className="pulsable block px-4 py-3 transition-colors duration-200 hover:bg-panel-soft/50"
          >
            <p className="font-heading text-sm font-semibold leading-snug text-foreground">
              {n.title}
            </p>
            {n.date && <p className="mt-0.5 text-[11px] text-ice">{fecha(n.date)}</p>}
            {n.excerpt && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{n.excerpt}</p>
            )}
          </motion.a>
        ))}
      </div>
    </div>
  );
}
