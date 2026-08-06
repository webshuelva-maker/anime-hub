"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SancionesPanel } from "./SancionesPanel";
import { NotaDeVoz } from "./NotasDeVoz";
import { playClick, playError, playReceive, playSuccess, playToggle } from "@/lib/sound";
import {
  Denuncia,
  MensajeModeracion,
  escucharDenunciasNuevas,
  listarDenuncias,
  resolverDenuncia,
  transcripcionEntre,
} from "@/lib/denuncias";

/**
 * Denuncias — la mitad que faltaba.
 *
 * Se podían crear desde el chat de Conectar (ver ChatConversacion, el
 * botón "Denunciar"), pero no había ningún sitio en la app donde leerlas:
 * se quedaban guardadas y punto. Este panel es esa otra mitad — leerlas,
 * ver la conversación de por medio si la hay, sancionar desde el mismo
 * sitio, y dejar constancia de qué se decidió.
 *
 * Mismo patrón de plegado que Miembros, a propósito: es la sección
 * hermana, y quien ya sabe usar una sabe usar la otra.
 */

const SUAVE = [0.16, 1, 0.3, 1] as const;
const APERTURA = 0.42;

function haceCuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function colorEstado(estado: Denuncia["status"]): string {
  if (estado === "pendiente") return "bg-amber-400";
  if (estado === "resuelta") return "bg-emerald-400";
  return "bg-muted";
}

function textoEstado(estado: Denuncia["status"]): string {
  if (estado === "pendiente") return "Sin revisar";
  if (estado === "resuelta") return "Resuelta";
  return "Descartada";
}

export function DenunciasPanel() {
  const [abierta, setAbierta] = useState(false);
  const [denuncias, setDenuncias] = useState<Denuncia[]>([]);
  const [incluirResueltas, setIncluirResueltas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [elegida, setElegida] = useState<Denuncia | null>(null);
  const [transcripcion, setTranscripcion] = useState<MensajeModeracion[]>([]);
  const [cargandoTranscripcion, setCargandoTranscripcion] = useState(false);
  const [verConversacion, setVerConversacion] = useState(false);
  const [resolucion, setResolucion] = useState("");
  const [pendientesSinAbrir, setPendientesSinAbrir] = useState(0);

  const cargar = async () => {
    setCargando(true);
    try {
      setDenuncias(await listarDenuncias(incluirResueltas));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!abierta) return;
    // En un temporizador a cero, igual que en SancionesPanel: cargar()
    // llama a setState de forma asíncrona pero el propio efecto la
    // dispara en el mismo paso, y el linter lo marca.
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, incluirResueltas]);

  // Avisa de denuncias nuevas aunque el panel esté plegado — un
  // administrador que ni sabe que ha entrado una no puede reaccionar a
  // tiempo, y de eso trata todo esto.
  useEffect(() => {
    return escucharDenunciasNuevas(() => {
      playReceive();
      if (abierta) void cargar();
      else setPendientesSinAbrir((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  const abrirDenuncia = (d: Denuncia) => {
    if (elegida?.id === d.id) {
      setElegida(null);
      return;
    }
    setElegida(d);
    setVerConversacion(false);
    setTranscripcion([]);
    setResolucion(d.resolucion ?? "");
    playClick();
  };

  const cargarConversacion = async () => {
    if (!elegida?.reporter_id) return;
    setCargandoTranscripcion(true);
    setVerConversacion(true);
    try {
      setTranscripcion(await transcripcionEntre(elegida.reporter_id, elegida.reported_id));
    } finally {
      setCargandoTranscripcion(false);
    }
  };

  const resolver = async (estado: "resuelta" | "descartada") => {
    if (!elegida) return;
    const ok = await resolverDenuncia(elegida.id, estado, resolucion);
    if (ok) {
      playSuccess();
      setElegida(null);
      await cargar();
    } else {
      playError();
    }
  };

  const pendientes = denuncias.filter((d) => d.status === "pendiente").length;
  const insignia = abierta ? pendientes : pendientes + pendientesSinAbrir;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: SUAVE }}
      className="panel mt-4 overflow-hidden rounded-2xl"
    >
      <button
        type="button"
        onClick={() => {
          setAbierta((v) => !v);
          setPendientesSinAbrir(0);
          playToggle();
        }}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-200 hover:bg-panel-soft/50"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-panel-border text-sm"
          style={{ background: "color-mix(in srgb, var(--rumor) 10%, transparent)" }}
        >
          ⚑
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block font-heading text-sm font-semibold">Denuncias</span>
            {insignia > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                style={{ background: "var(--rumor)" }}
              >
                {insignia}
              </span>
            )}
          </span>
          <span className="block text-xs text-muted">
            Lo que la gente denuncia en Conectar, con la conversación de por medio si la hay
          </span>
        </span>
        <motion.span
          animate={{ rotate: abierta ? 180 : 0 }}
          transition={{ duration: APERTURA, ease: SUAVE }}
          className="shrink-0 text-muted"
        >
          ⌄
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div
            key="cuerpo"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: APERTURA, ease: SUAVE },
              opacity: { duration: 0.24, ease: "easeOut" },
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-panel-border px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setIncluirResueltas((v) => !v);
                  playToggle();
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  incluirResueltas
                    ? "border-ice/40 bg-ice/10 text-ice"
                    : "border-panel-border text-muted hover:text-foreground"
                }`}
              >
                {incluirResueltas ? "Viendo también las resueltas" : "Solo pendientes"}
              </button>

              <p className="mt-2 text-[11px] text-muted">
                {cargando
                  ? "Cargando…"
                  : `${denuncias.length} ${denuncias.length === 1 ? "denuncia" : "denuncias"}`}
              </p>

              {!cargando && denuncias.length === 0 && (
                <p className="mt-3 text-sm text-muted">Ninguna denuncia por ahora.</p>
              )}

              <div className="mt-3 flex flex-col gap-1">
                {denuncias.map((d) => (
                  <div key={d.id} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => abrirDenuncia(d)}
                      className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                        elegida?.id === d.id ? "bg-panel-soft" : "hover:bg-panel-soft/60"
                      }`}
                    >
                      <p className="flex items-center gap-1.5 text-xs">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${colorEstado(d.status)}`} />
                        <span className="text-muted">{textoEstado(d.status)}</span>
                        <span className="ml-auto text-muted">{haceCuanto(d.created_at)}</span>
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        <span className="font-medium">{d.reported_alias ?? "Cuenta ya eliminada"}</span>
                        <span className="text-muted"> — {d.reason}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        Denunciado por {d.reporter_alias ?? "una cuenta ya eliminada"}
                      </p>
                    </button>

                    <AnimatePresence>
                      {elegida?.id === d.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: SUAVE }}
                          className="overflow-hidden"
                        >
                          <div className="mx-1 mb-2 rounded-xl border border-panel-border bg-panel-soft/40 p-4">
                            {d.details && (
                              <p className="text-sm leading-relaxed text-foreground/90">{d.details}</p>
                            )}
                            {d.resuelto_en && (
                              <p className="mt-1 text-[11px] text-muted">
                                Revisada el{" "}
                                {new Date(d.resuelto_en).toLocaleDateString("es-ES", {
                                  day: "numeric",
                                  month: "long",
                                })}
                              </p>
                            )}

                            {d.hay_conversacion && d.reporter_id && (
                              <button
                                type="button"
                                onClick={cargarConversacion}
                                className="pulsable mt-3 rounded-full border border-panel-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
                              >
                                {verConversacion ? "Actualizar conversación" : "Ver la conversación"}
                              </button>
                            )}

                            {verConversacion && (
                              <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-panel-border bg-background/60 p-3">
                                {cargandoTranscripcion ? (
                                  <p className="text-xs text-muted">Cargando…</p>
                                ) : transcripcion.length === 0 ? (
                                  <p className="text-xs text-muted">No hay mensajes.</p>
                                ) : (
                                  <div className="flex flex-col gap-2.5">
                                    {transcripcion.map((m) => (
                                      <div key={m.id} className="text-xs">
                                        <p className="flex flex-wrap items-center gap-1.5 text-muted">
                                          <span className="font-medium text-foreground">
                                            {m.autor_id === d.reported_id
                                              ? d.reported_alias ?? "Denunciado"
                                              : d.reporter_alias ?? "Denunciante"}
                                          </span>
                                          <span>{hora(m.creado_en)}</span>
                                          {m.eliminado_en && (
                                            <span className="text-rumor">
                                              — borrado por su autor el {haceCuanto(m.eliminado_en)}
                                            </span>
                                          )}
                                        </p>
                                        {m.audio_ruta ? (
                                          <div className="mt-1 max-w-[220px]">
                                            <NotaDeVoz
                                              ruta={m.audio_ruta}
                                              duracionMs={m.audio_ms}
                                              mio={m.autor_id === d.reported_id}
                                            />
                                          </div>
                                        ) : (
                                          <p className="mt-0.5 whitespace-pre-wrap text-foreground/90">
                                            {m.texto}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Sancionar directamente a quien se denuncia,
                                sin tener que ir a buscarlo aparte en
                                Miembros. */}
                            <div className="-mx-4 mt-1">
                              <SancionesPanel key={d.reported_id} userId={d.reported_id} />
                            </div>

                            {d.status === "pendiente" ? (
                              <div className="mt-1 border-t border-panel-border pt-3">
                                <textarea
                                  value={resolucion}
                                  onChange={(e) => setResolucion(e.target.value)}
                                  placeholder="Notas de la revisión (opcional, quedan guardadas)"
                                  rows={2}
                                  className="w-full resize-none rounded-lg border border-panel-border bg-panel-soft px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted focus:border-ice/50"
                                />
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => resolver("resuelta")}
                                    className="pulsable flex-1 rounded-full border border-ice/40 bg-ice/10 py-2 text-xs font-semibold text-ice"
                                  >
                                    Marcar como resuelta
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => resolver("descartada")}
                                    className="pulsable flex-1 rounded-full border border-panel-border py-2 text-xs font-medium text-muted hover:text-foreground"
                                  >
                                    Descartar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              d.resolucion && (
                                <p className="mt-3 border-t border-panel-border pt-3 text-xs leading-relaxed text-muted">
                                  <span className="font-medium text-foreground">Notas: </span>
                                  {d.resolucion}
                                </p>
                              )
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
