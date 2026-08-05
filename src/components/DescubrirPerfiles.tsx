"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "./AvatarPicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { playClick, playError, playSuccess, playToggle } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";
import {
  Coincidencia,
  MOTIVOS_DENUNCIA,
  PerfilDescubierto,
  bloquear,
  decidir,
  denunciar,
  descubrirPerfiles,
  esperandoRespuesta,
  etiquetaAfinidad,
  misCoincidencias,
  sincronizarGustos,
} from "@/lib/conectar";

/**
 * Descubrir perfiles: la primera mitad de Conectar.
 *
 * Se enseña UNA persona cada vez, no una cuadrícula. Una cuadrícula
 * invita a repasar caras deprisa; una ficha sola obliga a leer lo que
 * pone, que es de lo que va esto — aquí lo que se comparte son gustos,
 * no fotos.
 *
 * Y por eso lo primero que se ve de cada persona no es su descripción,
 * sino QUÉ TENÉIS EN COMÚN. El orden lo decide la base de datos por
 * afinidad de gustos, así que enseñar el motivo por el que ha salido esa
 * persona es simplemente explicar lo que ya está pasando.
 *
 * Denunciar y bloquear están desde el primer momento y a la vista, no
 * escondidos en un menú. En un sitio donde hablas con desconocidos, las
 * herramientas de protección tienen que llegar antes que el problema.
 */

const SUAVE = [0.16, 1, 0.3, 1] as const;

export function DescubrirPerfiles() {
  const [perfiles, setPerfiles] = useState<PerfilDescubierto[]>([]);
  const [coincidencias, setCoincidencias] = useState<Coincidencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [decidiendo, setDecidiendo] = useState(false);
  const [nuevaCoincidencia, setNuevaCoincidencia] = useState<PerfilDescubierto | null>(null);
  /*
   * Qué acaba de pasar al pulsar.
   *
   * Faltaba por completo: dabas a "Me interesa", la tarjeta se cambiaba
   * por la siguiente y no había ni una señal de que hubiera ocurrido
   * algo. Ni de que la otra persona tiene que marcarte a ti para que
   * pase nada. Sin esto, el botón parecía roto.
   */
  const [ultimaAccion, setUltimaAccion] = useState<{
    alias: string;
    decision: "interesa" | "paso";
  } | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [vistos, setVistos] = useState(0);
  const [confirmandoBloqueo, setConfirmandoBloqueo] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  const [motivoDenuncia, setMotivoDenuncia] = useState<string | null>(null);
  const [avisoDenuncia, setAvisoDenuncia] = useState<string | null>(null);
  const arrancadoRef = useRef(false);

  const actual = perfiles[0] ?? null;

  const cargar = async () => {
    setCargando(true);
    try {
      const [lista, matches, enEspera] = await Promise.all([
        descubrirPerfiles(),
        misCoincidencias(),
        esperandoRespuesta(),
      ]);
      setPerfiles(lista);
      setCoincidencias(matches);
      setPendientes(enEspera);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (arrancadoRef.current) return;
    arrancadoRef.current = true;
    const id = setTimeout(async () => {
      // Primero se suben los gustos y luego se pide la tanda: al revés,
      // la primera visita se ordenaría con los gustos vacíos.
      await sincronizarGustos();
      await cargar();
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const responder = async (decision: "interesa" | "paso") => {
    if (!actual || decidiendo) return;
    setDecidiendo(true);
    setUltimaAccion(null);
    const objetivo = actual;
    try {
      const hayCoincidencia = await decidir(objetivo.user_id, decision);
      if (decision === "interesa") {
        playToggle();
        vibrar(10);
      } else {
        playClick();
      }

      setPerfiles((prev) => prev.filter((p) => p.user_id !== objetivo.user_id));
      setVistos((n) => n + 1);

      if (hayCoincidencia) {
        playSuccess();
        vibrar([12, 60, 12]);
        setNuevaCoincidencia(objetivo);
        setCoincidencias(await misCoincidencias());
      } else {
        // Se dice qué ha pasado y, si has marcado, que ahora toca
        // esperar. El aviso se queda hasta que decidas sobre la
        // siguiente persona, no se va solo a los dos segundos.
        setUltimaAccion({ alias: objetivo.alias, decision });
        if (decision === "interesa") setPendientes((n) => n + 1);
      }
    } finally {
      setDecidiendo(false);
    }
  };

  const confirmarBloqueo = async () => {
    if (!actual) return;
    const objetivo = actual;
    setConfirmandoBloqueo(false);
    await bloquear(objetivo.user_id);
    setPerfiles((prev) => prev.filter((p) => p.user_id !== objetivo.user_id));
    playToggle();
  };

  const enviarDenuncia = async () => {
    if (!actual || !motivoDenuncia) {
      playError();
      setAvisoDenuncia("Elige un motivo.");
      return;
    }
    const objetivo = actual;
    const ok = await denunciar(objetivo.user_id, motivoDenuncia);
    if (!ok) {
      playError();
      setAvisoDenuncia("No se ha podido enviar. Inténtalo otra vez.");
      return;
    }
    // Denunciar bloquea también: nadie denuncia a alguien con quien
    // quiere seguir cruzándose.
    await bloquear(objetivo.user_id);
    setPerfiles((prev) => prev.filter((p) => p.user_id !== objetivo.user_id));
    setDenunciando(false);
    setMotivoDenuncia(null);
    setAvisoDenuncia(null);
    playSuccess();
  };

  const enComun = actual
    ? [
        ...actual.favoritos_comunes.map((t) => ({ texto: t, fuerte: true })),
        ...actual.generos_comunes.map((t) => ({ texto: t, fuerte: false })),
        ...actual.estudios_comunes.map((t) => ({ texto: t, fuerte: false })),
      ]
    : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Conectar</h1>
        {coincidencias.length > 0 && (
          <span className="ice-text text-sm">
            {coincidencias.length}{" "}
            {coincidencias.length === 1 ? "coincidencia" : "coincidencias"}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Gente ordenada por lo que compartís. Cuanto más se parezcan vuestros gustos, antes aparece.
      </p>

      {/* Cuántos quedan y cuántos esperan respuesta. Antes no había forma
          de saber si ibas por el primero o por el último. */}
      {!cargando && (perfiles.length > 0 || pendientes > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {perfiles.length > 0 && (
            <span>
              {vistos + 1} de {vistos + perfiles.length}
            </span>
          )}
          {pendientes > 0 && (
            <span className="ice-text">
              {pendientes} {pendientes === 1 ? "esperando respuesta" : "esperando respuesta"}
            </span>
          )}
        </div>
      )}

      {/* Qué ha pasado con la persona anterior. Se queda hasta que
          decidas sobre la siguiente. */}
      <AnimatePresence mode="wait">
        {ultimaAccion && (
          <motion.div
            key={ultimaAccion.alias + ultimaAccion.decision}
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: SUAVE }}
            className="overflow-hidden"
          >
            <div
              className="mt-4 rounded-xl border px-4 py-3"
              style={
                ultimaAccion.decision === "interesa"
                  ? {
                      borderColor: "color-mix(in srgb, var(--ice) 35%, transparent)",
                      background: "color-mix(in srgb, var(--ice) 8%, transparent)",
                    }
                  : { borderColor: "var(--panel-border)" }
              }
            >
              {ultimaAccion.decision === "interesa" ? (
                <p className="text-sm leading-snug text-foreground">
                  Le has dicho que sí a{" "}
                  <span className="ice-text font-medium">{ultimaAccion.alias}</span>.{" "}
                  <span className="text-muted">
                    No se le avisa. Si te marca a ti también, os aparecerá la coincidencia a los
                    dos.
                  </span>
                </p>
              ) : (
                <p className="text-sm leading-snug text-muted">
                  Has pasado de {ultimaAccion.alias}. No volverá a salirte y no se entera de nada.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- La ficha de turno ------------------------------------------- */}
      <div className="mt-6">
        <AnimatePresence mode="wait">
          {cargando ? (
            <motion.div
              key="cargando"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="panel rounded-2xl p-10 text-center"
            >
              <p className="text-sm text-muted">Buscando gente con tus gustos…</p>
            </motion.div>
          ) : actual ? (
            <motion.div
              key={actual.user_id}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ duration: 0.38, ease: SUAVE }}
              className="panel overflow-hidden rounded-2xl"
            >
              {/* Cabecera con un resplandor cuya intensidad es la
                  afinidad: lo primero que se ve ya dice cuánto encajáis,
                  antes de leer una palabra. */}
              <div
                className="relative px-6 pb-5 pt-7"
                style={{
                  background: `radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--ice) ${Math.round(
                    etiquetaAfinidad(actual.afinidad).fuerza * 22
                  )}%, transparent), transparent 70%)`,
                }}
              >
                <div className="flex items-center gap-4">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: SUAVE }}
                  >
                    <Avatar avatarId={actual.avatar_id ?? ""} size="xl" rounded="full" />
                  </motion.div>
                  <div className="min-w-0">
                    <p className="font-heading text-2xl font-bold leading-tight">{actual.alias}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {actual.edad} años · {actual.gender}
                    </p>
                    <p
                      className="mt-2 inline-block rounded-full border px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        borderColor: `color-mix(in srgb, var(--ice) ${Math.round(
                          etiquetaAfinidad(actual.afinidad).fuerza * 60
                        )}%, transparent)`,
                        color:
                          etiquetaAfinidad(actual.afinidad).fuerza > 0.4
                            ? "var(--ice)"
                            : "var(--muted)",
                      }}
                    >
                      {etiquetaAfinidad(actual.afinidad).texto}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6">

              {/* Lo que tenéis en común va ANTES que la descripción: es el
                  motivo por el que esta persona ha salido, y es lo único
                  que se puede comprobar (la descripción la escribe cada
                  uno). */}
              {enComun.length > 0 ? (
                <div className="mt-5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Lo que compartís
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {enComun.slice(0, 10).map((c, i) => (
                      <motion.span
                        key={`${c.texto}-${i}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.3,
                          delay: Math.min(0.06 + i * 0.03, 0.28),
                          ease: SUAVE,
                        }}
                        className="rounded-full border px-2.5 py-1 text-xs"
                        style={
                          c.fuerte
                            ? {
                                borderColor: "color-mix(in srgb, var(--ice) 45%, transparent)",
                                color: "var(--ice)",
                                background: "color-mix(in srgb, var(--ice) 10%, transparent)",
                              }
                            : { borderColor: "var(--panel-border)", color: "var(--muted)" }
                        }
                      >
                        {c.texto}
                      </motion.span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-xs leading-snug text-muted">
                  Todavía no compartís nada concreto. Marca más favoritos y géneros en tus gustos y
                  las coincidencias se afinarán.
                </p>
              )}

              {actual.bio && (
                <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {actual.bio}
                </p>
              )}

              <p className="mt-6 text-center text-[11px] leading-snug text-muted">
                Si marcáis los dos, se abre la coincidencia. Nadie se entera de lo que marques
                salvo que sea mutuo.
              </p>
              <div className="mt-3 flex gap-3">
                <motion.button
                  type="button"
                  onClick={() => responder("paso")}
                  disabled={decidiendo}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.2, ease: SUAVE }}
                  className="flex-1 rounded-full border border-panel-border py-2.5 text-sm font-medium text-muted transition-colors duration-200 hover:border-ice/30 hover:text-foreground disabled:opacity-40"
                >
                  Paso
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => responder("interesa")}
                  disabled={decidiendo}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.2, ease: SUAVE }}
                  className="accent-gradient flex-1 rounded-full py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Me interesa
                </motion.button>
              </div>

              {/* A la vista, no escondido en un menú. */}
              <div className="mt-4 flex items-center justify-center gap-4 text-[11px]">
                <button
                  type="button"
                  onClick={() => setConfirmandoBloqueo(true)}
                  className="text-muted transition-colors duration-200 hover:text-foreground"
                >
                  Bloquear
                </button>
                <span className="text-muted/40">·</span>
                <button
                  type="button"
                  onClick={() => setDenunciando(true)}
                  className="text-muted transition-colors duration-200 hover:text-rumor"
                >
                  Denunciar
                </button>
              </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="vacio"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: SUAVE }}
              className="panel rounded-2xl p-8 text-center"
            >
              <p className="font-heading text-base font-semibold">No queda nadie por ahora</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                Has visto a toda la gente que encaja contigo ahora mismo. Según entren perfiles
                nuevos irán apareciendo aquí.
              </p>
              <motion.button
                type="button"
                onClick={() => void cargar()}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.2, ease: SUAVE }}
                className="mt-5 rounded-full border border-panel-border px-5 py-2 text-sm text-muted transition-colors duration-200 hover:border-ice/40 hover:text-foreground"
              >
                Volver a mirar
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- Coincidencias ------------------------------------------------ */}
      {coincidencias.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: SUAVE }}
          className="panel mt-6 rounded-2xl p-5"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Habéis coincidido
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {coincidencias.map((c, i) => (
              <motion.div
                key={c.user_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.2), ease: SUAVE }}
                className="flex items-center gap-3 rounded-xl px-2 py-1.5"
              >
                <Avatar avatarId={c.avatar_id ?? ""} size="sm" rounded="full" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.alias}</span>
                <span className="shrink-0 text-[11px] text-muted">{c.edad} años</span>
              </motion.div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-snug text-muted">
            El chat es lo siguiente que llega. Vuestras coincidencias se guardan y os esperarán
            aquí: no hay que volver a marcarse.
          </p>
        </motion.div>
      )}

      {/* --- Aviso de coincidencia nueva ---------------------------------- */}
      <AnimatePresence>
        {nuevaCoincidencia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-6"
            style={{
              background: "color-mix(in srgb, var(--background) 88%, transparent)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
            onClick={() => setNuevaCoincidencia(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="panel w-full max-w-sm rounded-2xl border border-ice/30 p-7 text-center"
            >
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.1, ease: SUAVE }}
                className="mx-auto mb-4"
              >
                <Avatar avatarId={nuevaCoincidencia.avatar_id ?? ""} size="lg" rounded="full" />
              </motion.div>
              <h2 className="font-heading text-xl font-bold">
                Habéis coincidido con {nuevaCoincidencia.alias}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Los dos os habéis marcado. Cuando el chat esté listo, podréis hablar desde aquí.
              </p>
              <button
                type="button"
                onClick={() => setNuevaCoincidencia(null)}
                className="accent-gradient mt-6 w-full rounded-full py-2.5 text-sm font-semibold text-white"
              >
                Seguir mirando
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Denuncia ------------------------------------------------------ */}
      <AnimatePresence>
        {denunciando && actual && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setDenunciando(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22, ease: SUAVE }}
              onClick={(e) => e.stopPropagation()}
              className="panel w-full max-w-sm rounded-2xl p-6"
            >
              <h3 className="font-heading text-lg font-semibold">Denunciar a {actual.alias}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Lo revisa una persona del equipo. Al denunciar, también dejaréis de veros.
              </p>

              <div className="mt-4 flex flex-col gap-1.5">
                {MOTIVOS_DENUNCIA.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMotivoDenuncia(m);
                      setAvisoDenuncia(null);
                      playToggle();
                    }}
                    className="rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-200"
                    style={
                      motivoDenuncia === m
                        ? {
                            borderColor: "color-mix(in srgb, var(--rumor) 50%, transparent)",
                            color: "var(--rumor)",
                            background: "color-mix(in srgb, var(--rumor) 10%, transparent)",
                          }
                        : { borderColor: "var(--panel-border)", color: "var(--muted)" }
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>

              {avisoDenuncia && <p className="mt-3 text-xs text-rumor">{avisoDenuncia}</p>}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDenunciando(false)}
                  className="flex-1 rounded-full border border-panel-border py-2.5 text-sm text-muted transition-colors duration-200 hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={enviarDenuncia}
                  className="flex-1 rounded-full border py-2.5 text-sm font-semibold text-rumor"
                  style={{
                    borderColor: "color-mix(in srgb, var(--rumor) 50%, transparent)",
                    background: "color-mix(in srgb, var(--rumor) 10%, transparent)",
                  }}
                >
                  Denunciar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmandoBloqueo}
        title={`Bloquear a ${actual?.alias ?? ""}`}
        message="No volveréis a apareceros el uno al otro. No se le avisa de nada."
        confirmLabel="Bloquear"
        onConfirm={confirmarBloqueo}
        onCancel={() => setConfirmandoBloqueo(false)}
      />
    </div>
  );
}
