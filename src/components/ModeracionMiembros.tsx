"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SancionesPanel } from "./SancionesPanel";
import { playClick, playError, playSuccess, playToggle } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";
import {
  Aviso,
  Gravedad,
  Miembro,
  avisarMiembro,
  avisosDe,
  buscarMiembros,
  nombreVisible,
} from "@/lib/moderacion";

/**
 * Moderar a cualquiera, tenga ticket abierto o no.
 *
 * Este es el agujero que tenía el panel: se podía sancionar únicamente
 * desde la conversación de soporte, así que la única gente moderable era
 * la que había pedido ayuda. Justo al revés de lo que hace falta.
 *
 * La sección va plegada por defecto y se abre con animación, como el
 * resto de la app: es una lista de personas reales con sus correos, y no
 * tiene por qué estar a la vista cada vez que se entra a contestar un
 * ticket.
 */

const GRAVEDADES: { valor: Gravedad; etiqueta: string; ayuda: string }[] = [
  { valor: "leve", etiqueta: "Leve", ayuda: "Un toque de atención, sin más." },
  { valor: "normal", etiqueta: "Normal", ayuda: "Queda constancia; a la próxima, suspensión." },
  { valor: "grave", etiqueta: "Grave", ayuda: "Último aviso antes de expulsar." },
];

function colorGravedad(g: Gravedad): string {
  if (g === "grave") return "var(--rumor)";
  if (g === "normal") return "var(--ice)";
  return "var(--muted)";
}

function haceCuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" });
}

export function ModeracionMiembros() {
  const [abierta, setAbierta] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [elegido, setElegido] = useState<Miembro | null>(null);
  const yaCargadoRef = useRef(false);

  const cargar = async (termino: string) => {
    setCargando(true);
    try {
      const lista = await buscarMiembros(termino);
      setMiembros(lista);
      setFallo(
        lista.length === 0 && termino.trim() === ""
          ? "No llega ningún miembro. Si acabas de añadir la moderación por miembros, falta ejecutar el SQL nuevo en Supabase."
          : null
      );
    } finally {
      setCargando(false);
    }
  };

  // La primera carga se hace al abrir la sección, no al montar el panel:
  // esto trae correos de gente real y no hay motivo para pedirlos si
  // solo se venía a contestar un ticket.
  useEffect(() => {
    if (!abierta || yaCargadoRef.current) return;
    yaCargadoRef.current = true;
    const id = setTimeout(() => void cargar(""), 0);
    return () => clearTimeout(id);
  }, [abierta]);

  // Búsqueda con freno: se espera a que deje de teclear. Sin esto sale
  // una consulta por letra.
  useEffect(() => {
    if (!abierta) return;
    const id = setTimeout(() => void cargar(busqueda), 350);
    return () => clearTimeout(id);
  }, [busqueda, abierta]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="panel mt-4 overflow-hidden rounded-2xl"
    >
      <button
        type="button"
        onClick={() => {
          setAbierta((v) => !v);
          playToggle();
        }}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-panel-soft/50"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-panel-border text-sm"
          style={{ background: "color-mix(in srgb, var(--ice) 8%, transparent)" }}
        >
          ⚖
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-sm font-semibold">Miembros</span>
          <span className="block text-xs text-muted">
            Avisar, suspender o expulsar a cualquiera, tenga consulta abierta o no
          </span>
        </span>
        <motion.span
          animate={{ rotate: abierta ? 180 : 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-panel-border px-5 py-4">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, alias o correo…"
                className="panel-elevated w-full rounded-lg px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
              />

              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={cargando ? "buscando" : `n-${miembros.length}`}
                    initial={{ opacity: 0, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 3 }}
                    transition={{ duration: 0.18 }}
                  >
                    {cargando
                      ? "Buscando…"
                      : `${miembros.length} ${miembros.length === 1 ? "miembro" : "miembros"}`}
                  </motion.span>
                </AnimatePresence>
              </div>

              {fallo && <p className="mt-2 text-xs leading-snug text-rumor">{fallo}</p>}

              <div className="mt-3 flex max-h-[42vh] flex-col gap-1 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {miembros.map((m, i) => {
                    const sancionado = m.sancion_tipo !== null;
                    return (
                      <motion.button
                        key={m.id}
                        type="button"
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          duration: 0.28,
                          delay: Math.min(i * 0.025, 0.3),
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        onClick={() => {
                          playClick();
                          setElegido(elegido?.id === m.id ? null : m);
                        }}
                        className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                          elegido?.id === m.id ? "bg-panel-soft" : "hover:bg-panel-soft/60"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {nombreVisible(m)}
                          </span>
                          {m.es_administrador && (
                            <span className="shrink-0 rounded-full border border-ice/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ice">
                              Moderación
                            </span>
                          )}
                          {m.avisos > 0 && (
                            <span className="shrink-0 text-[10px] text-muted">
                              {m.avisos} {m.avisos === 1 ? "aviso" : "avisos"}
                            </span>
                          )}
                          {sancionado && (
                            <span className="shrink-0 rounded-full border border-rumor/40 bg-rumor/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rumor">
                              {m.sancion_tipo === "permanente" ? "Expulsado" : "Suspendido"}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                          <span className="min-w-0 flex-1 truncate">{m.email ?? "Sin correo"}</span>
                          <span className="shrink-0">{haceCuanto(m.creado_en)}</span>
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence>
              {elegido && (
                <motion.div
                  key={elegido.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden border-t border-panel-border"
                >
                  <FichaMiembro
                    miembro={elegido}
                    onCerrar={() => setElegido(null)}
                    onCambio={() => void cargar(busqueda)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/** Lo que se puede hacer sobre una persona concreta. */
function FichaMiembro({
  miembro,
  onCerrar,
  onCambio,
}: {
  miembro: Miembro;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [gravedad, setGravedad] = useState<Gravedad>("normal");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [historial, setHistorial] = useState<Aviso[]>([]);

  const cargarHistorial = async () => setHistorial(await avisosDe(miembro.id));

  useEffect(() => {
    const id = setTimeout(() => void cargarHistorial(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miembro.id]);

  const enviar = async () => {
    if (motivo.trim().length < 5) {
      playError();
      setAviso("Escribe qué ha hecho. Es literalmente lo que va a leer.");
      return;
    }
    setEnviando(true);
    setAviso(null);
    try {
      const error = await avisarMiembro(miembro.id, motivo, gravedad);
      if (error) {
        playError();
        setAviso(`No se ha podido enviar: ${error}`);
        return;
      }
      playSuccess();
      vibrar(12);
      setMotivo("");
      setEnviado(true);
      setTimeout(() => setEnviado(false), 2200);
      await cargarHistorial();
      onCambio();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold">{nombreVisible(miembro)}</p>
          <p className="truncate text-xs text-muted">{miembro.email ?? "Sin correo"}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="shrink-0 rounded-full border border-panel-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
        >
          Cerrar
        </button>
      </div>

      {/* Aviso: el escalón que faltaba entre no hacer nada y expulsar. */}
      <div className="border-t border-panel-border px-5 py-4">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
          Enviar un aviso
        </h3>

        <input
          type="text"
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            if (aviso) setAviso(null);
          }}
          placeholder="Qué ha hecho (lo lee tal cual)"
          className="panel-elevated mt-3 w-full rounded-lg px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {GRAVEDADES.map((g) => (
            <motion.button
              key={g.valor}
              type="button"
              onClick={() => {
                setGravedad(g.valor);
                playToggle();
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                gravedad === g.valor
                  ? {
                      borderColor: colorGravedad(g.valor),
                      color: colorGravedad(g.valor),
                      background: `color-mix(in srgb, ${colorGravedad(g.valor)} 12%, transparent)`,
                    }
                  : { borderColor: "var(--panel-border)", color: "var(--muted)" }
              }
            >
              {g.etiqueta}
            </motion.button>
          ))}

          <motion.button
            type="button"
            onClick={enviar}
            disabled={enviando}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="accent-gradient ml-auto rounded-full px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {enviando ? "Enviando…" : "Enviar aviso"}
          </motion.button>
        </div>

        <p className="mt-2 text-[11px] leading-snug text-muted">
          {GRAVEDADES.find((g) => g.valor === gravedad)?.ayuda} Le aparece en pantalla al momento,
          esté donde esté dentro de la app.
        </p>

        <AnimatePresence>
          {aviso && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-xs text-rumor"
            >
              {aviso}
            </motion.p>
          )}
          {enviado && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="ice-text mt-2 text-xs"
            >
              Aviso entregado.
            </motion.p>
          )}
        </AnimatePresence>

        {historial.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Avisos anteriores ({historial.length})
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {historial.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-baseline gap-2 text-[11px] leading-snug">
                  <span className="shrink-0 font-medium" style={{ color: colorGravedad(a.gravedad) }}>
                    {a.gravedad === "grave" ? "Grave" : a.gravedad === "leve" ? "Leve" : "Aviso"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">{a.motivo}</span>
                  <span className="shrink-0 text-muted/70">
                    {a.leido_en ? "leído" : "sin leer"} · {haceCuanto(a.creado_en)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Suspender y expulsar: el mismo panel que ya se usaba desde la
          conversación de soporte, sin duplicar nada. */}
      <SancionesPanel userId={miembro.id} onCambio={onCambio} />
    </div>
  );
}
