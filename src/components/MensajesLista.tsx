"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "./AvatarPicker";
import { ChatConversacion } from "./ChatConversacion";
import { playClick } from "@/lib/sound";
import {
  Coincidencia,
  ResultadoBusqueda,
  buscarEnMensajes,
  misCoincidencias,
} from "@/lib/conectar";

/**
 * Las conversaciones abiertas.
 *
 * ---------------------------------------------------------------------
 * EL FALLO QUE ARREGLA EL PORTAL (v161)
 *
 * El chat se abría con `position: fixed` para tapar la pantalla, pero se
 * veía la página entera por detrás: los perfiles, "Tu perfil", el botón
 * de borrar el perfil… todo asomando alrededor de la conversación.
 *
 * El motivo es una regla del navegador que ya nos mordió con el diálogo
 * de confirmación: `fixed` solo se refiere a la ventana si NINGÚN
 * antepasado tiene `transform`. Y framer-motion pone `transform` en todo
 * lo que anima — incluido el contenedor de Conectar. Con eso, el chat
 * pasaba a colocarse dentro de ese contenedor y quedaba del tamaño de la
 * columna de contenido en vez de cubrir la pantalla.
 *
 * Colgándolo del <body> con un portal, da igual dentro de cuántos
 * elementos animados esté escrito: se dibuja siempre arriba del todo.
 * ---------------------------------------------------------------------
 */

const SUAVE = [0.16, 1, 0.3, 1] as const;

function cuando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const minutos = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `${minutos} min`;
  if (d.toDateString() === new Date().toDateString())
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const dias = Math.floor(minutos / 1440);
  if (dias < 7) return `${dias} d`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function MensajesLista() {
  const [conversaciones, setConversaciones] = useState<Coincidencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState<Coincidencia | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  // Igual que en ConfirmDialog: saber si ya estamos en el navegador sin
  // estado ni efectos, que es lo que necesita createPortal.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const cargar = async () => {
    const lista = await misCoincidencias();
    setConversaciones(lista);
    setCargando(false);
  };

  useEffect(() => {
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
  }, []);

  /*
   * La búsqueda hace dos cosas a la vez y por eso no espera a nada para
   * la primera: filtrar por nombre es instantáneo (la lista ya está aquí)
   * y buscar dentro de los mensajes va a la base de datos, con freno de
   * 300 ms para no lanzar una consulta por letra.
   */
  useEffect(() => {
    // Todo dentro del temporizador, incluido el "buscando": llamar a
    // setState en el mismo paso del efecto encadena redibujados.
    const id = setTimeout(async () => {
      if (busqueda.trim().length < 2) {
        setResultados([]);
        setBuscando(false);
        return;
      }
      setBuscando(true);
      setResultados(await buscarEnMensajes(busqueda));
      setBuscando(false);
    }, 300);
    return () => clearTimeout(id);
  }, [busqueda]);

  const termino = busqueda.trim().toLowerCase();
  const filtradas =
    termino.length === 0
      ? conversaciones
      : conversaciones.filter(
          (c) =>
            c.alias.toLowerCase().includes(termino) ||
            (c.ultimo_texto ?? "").toLowerCase().includes(termino)
        );
  const porNombre = (id: string) => conversaciones.find((c) => c.user_id === id);

  return (
    <div>
      {/* El buscador solo aparece cuando hay conversaciones de sobra
          para necesitarlo: con dos, un campo de búsqueda encima es una
          pieza de interfaz que no hace nada. */}
      {!cargando && conversaciones.length > 2 && (
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o por lo que os dijisteis…"
          className="panel-elevated mb-3 w-full rounded-xl px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
        />
      )}

      {cargando ? (
        <div className="panel rounded-2xl p-10 text-center">
          <p className="text-sm text-muted">Cargando…</p>
        </div>
      ) : conversaciones.length === 0 ? (
        <div className="panel rounded-2xl px-8 py-14 text-center">
          <h2 className="font-heading text-lg font-semibold">Todavía no hay conversaciones</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
            Cuando dos personas os marquéis, se abrirá una conversación aquí. Nadie puede
            escribirte sin que tú le hayas dicho que sí antes.
          </p>
        </div>
      ) : (
        <div className="panel divide-y divide-panel-border overflow-hidden rounded-2xl">
          {filtradas.map((c, i) => (
            <motion.button
              key={c.user_id}
              type="button"
              onClick={() => {
                playClick();
                setAbierta(c);
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.28, delay: Math.min(i * 0.03, 0.18), ease: SUAVE }}
              className="pulsable flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-panel-soft/50"
            >
              <Avatar avatarId={c.avatar_id ?? ""} size="md" rounded="full" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-heading text-[15px] font-semibold">
                    {c.alias}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{cuando(c.ultimo_en)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      c.sin_leer > 0 ? "text-foreground" : "text-muted"
                    }`}
                  >
                    {c.ultimo_texto === null
                      ? "Decid algo — nadie ha empezado todavía"
                      : c.ultimo_texto.trim() === ""
                      ? "Nota de voz"
                      : c.ultimo_texto}
                  </span>
                  {c.sin_leer > 0 && (
                    <span className="accent-gradient shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white">
                      {c.sin_leer}
                    </span>
                  )}
                </span>
              </span>
            </motion.button>
          ))}
        </div>
      )}

      {/* Lo que se encontró DENTRO de las conversaciones. Va debajo de la
          lista porque lo primero que se busca casi siempre es a alguien,
          no una frase. */}
      {termino.length >= 2 && (
        <div className="mt-4">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {buscando
              ? "Buscando en los mensajes…"
              : resultados.length === 0
              ? "Ningún mensaje con esas palabras"
              : `${resultados.length} ${
                  resultados.length === 1 ? "mensaje encontrado" : "mensajes encontrados"
                }`}
          </p>

          {resultados.length > 0 && (
            <div className="panel mt-2 divide-y divide-panel-border overflow-hidden rounded-2xl">
              {resultados.map((r) => {
                const quien = porNombre(r.con_user_id);
                if (!quien) return null;
                return (
                  <button
                    key={r.mensaje_id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setAbierta(quien);
                    }}
                    className="pulsable flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel-soft/50"
                  >
                    <Avatar avatarId={quien.avatar_id ?? ""} size="sm" rounded="full" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-semibold">{quien.alias}</span>
                        <span className="shrink-0 text-[10px] text-muted">
                          {r.mio ? "tú" : "él o ella"} · {cuando(r.creado_en)}
                        </span>
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-[13px] leading-snug text-muted">
                        {r.texto}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {!buscando && (
            <p className="mt-2 px-1 text-[10px] leading-snug text-muted">
              Las notas de voz no salen aquí: no llevan texto que buscar.
            </p>
          )}
        </div>
      )}

      {/* Colgado del <body>: ver la explicación de arriba. */}
      {enNavegador &&
        createPortal(
          <AnimatePresence>
            {abierta && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[75] bg-background"
              >
                <div className="mx-auto h-full w-full max-w-2xl">
                  <ChatConversacion
                    con={abierta}
                    onCerrar={() => {
                      setAbierta(null);
                      void cargar();
                    }}
                    onSalirDeLaLista={() => {
                      setAbierta(null);
                      void cargar();
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
