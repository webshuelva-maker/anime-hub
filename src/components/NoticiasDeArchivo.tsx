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
 * noticias del feed: son de otra fuente y llevan a MyAnimeList en vez de
 * a un medio en español. Llegan traducidas al español, igual que el
 * resto del feed: esta era la única parte de la app donde aparecía texto
 * en inglés.
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

export function NoticiasDeArchivo({
  titulo,
  malId = null,
  malIds = [],
}: {
  titulo: string;
  /** Si ya se conoce, evita que el servidor tenga que buscar la serie. */
  malId?: number | null;
  /** Todas las entregas de la franquicia; se junta el archivo de todas. */
  malIds?: number[];
}) {
  const [noticias, setNoticias] = useState<NoticiaMal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [archivoUrl, setArchivoUrl] = useState<string | null>(null);
  const [traducidas, setTraducidas] = useState(false);
  const [intento, setIntento] = useState(0);
  // La lista en texto: un array nuevo en cada dibujado dispararía la
  // consulta sin parar aunque los identificadores sean los mismos.
  const clavesIds = malIds.join(",");

  useEffect(() => {
    let vivo = true;
    // El "cargando" se pone dentro del temporizador: llamar a setState
    // en el mismo paso del efecto encadena redibujados.
    const id = setTimeout(async () => {
      setCargando(true);
      try {
        const res = await fetch(
          `/api/anime-noticias?titulo=${encodeURIComponent(titulo)}${
            malId ? `&malId=${malId}` : ""
          }${clavesIds ? `&malIds=${clavesIds}` : ""}`
        );
        const json = (await res.json()) as {
          noticias?: NoticiaMal[];
          fallo?: boolean;
          motivo?: string | null;
          archivoUrl?: string | null;
          traducidas?: boolean;
        };
        if (vivo) {
          setNoticias(json.noticias ?? []);
          setFallo(Boolean(json.fallo));
          setMotivo(json.motivo ?? null);
          setArchivoUrl(json.archivoUrl ?? null);
          setTraducidas(Boolean(json.traducidas));
        }
      } catch {
        if (vivo) {
          setNoticias([]);
          setFallo(true);
          setMotivo("no se pudo llamar al servidor de la app");
        }
      } finally {
        if (vivo) setCargando(false);
      }
    }, 0);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [titulo, malId, clavesIds, intento]);

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

  if (noticias.length === 0) {
    // Solo se dice algo cuando la consulta ha FALLADO. Si simplemente no
    // hay noticias, callarse es mejor que anunciar un vacío.
    if (!fallo) return null;
    /*
     * Cuando el que falla es MyAnimeList, se dice y se ofrece la salida.
     *
     * Su API (Jikan) tiene un fallo conocido de errores intermitentes al
     * hablar con MyAnimeList; desde aquí no hay nada que arreglar. Pero
     * la web de MyAnimeList sí funciona, así que en vez de dejar un
     * error y un botón que quizá tampoco funcione, se ofrece ir directo
     * al archivo. Y se dice de quién es el problema: si no, parece que
     * la app esté rota.
     */
    const esDeEllos = Boolean(motivo && motivo.includes("MyAnimeList no responde"));

    return (
      <div className="mt-8 flex items-center gap-3 rounded-xl border border-panel-border px-4 py-3">
        <div className="flex-1">
          <p className="text-xs leading-snug text-muted">
            {esDeEllos
              ? "MyAnimeList no responde ahora mismo, así que su archivo no se puede consultar. No es cosa tuya: suele volver solo en un rato."
              : "No se ha podido consultar el archivo de MyAnimeList."}
          </p>
          {/* El motivo técnico, a la vista. Es feo, pero un fallo mudo
              cuesta tres versiones de adivinanzas y este texto lo
              resuelve en una. */}
          {motivo && <p className="mt-0.5 font-mono text-[10px] text-muted/70">{motivo}</p>}
        </div>
        {archivoUrl && (
          <a
            href={archivoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pulsable shrink-0 rounded-full border border-panel-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            Verlo en MyAnimeList
          </a>
        )}
        <button
          type="button"
          onClick={() => setIntento((n) => n + 1)}
          className="pulsable shrink-0 rounded-full border border-panel-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Noticias anteriores sobre esta serie
        </p>
        {/* Ya no dice "en inglés": el archivo llega traducido igual que
            el resto del feed. Se sigue diciendo de dónde viene, porque
            estas noticias no son de los medios que sigue la app y
            llevan a MyAnimeList en vez de a un medio en español. */}
        <p className="text-[10px] text-muted">
          Archivo de MyAnimeList{traducidas ? " · traducido" : ""}
        </p>
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
