"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EstadoPush, activarPush, appInstalada, getEstadoPush, pushDisponible } from "@/lib/push";
import { playError, playSuccess } from "@/lib/sound";

/**
 * Pide los avisos a quien de verdad los necesita.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ NO LLEGABAN LAS LLAMADAS
 *
 * El interruptor de avisos existía, pero SOLO dentro del panel de
 * moderación, porque cuando se hizo el único aviso que había era "hay una
 * consulta nueva". A un usuario normal nunca se le preguntaba, así que
 * nunca tenía los avisos activados, y por tanto una llamada con la app
 * cerrada no le llegaba nunca. No fallaba el envío: no había a dónde
 * enviar.
 *
 * Esto aparece donde tiene sentido —en Conectar, cuando ya hay alguien
 * con quien hablar— y no al entrar en la app. Pedir permiso de avisos
 * nada más abrir es la forma más rápida de que te lo denieguen para
 * siempre: sin saber para qué son, la respuesta natural es que no. Aquí,
 * con una conversación abierta delante, la pregunta se explica sola.
 *
 * Y se pide UNA vez. Si se dice que no, no se vuelve a insistir.
 * ---------------------------------------------------------------------
 */

const CLAVE_DESCARTADO = "anime-hub:avisos-descartado";

export function InvitacionAvisos() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [descartado, setDescartado] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(async () => {
      if (!pushDisponible()) return;
      try {
        setDescartado(window.localStorage.getItem(CLAVE_DESCARTADO) === "1");
      } catch {
        setDescartado(false);
      }
      setEstado(await getEstadoPush());
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const activar = async () => {
    setOcupado(true);
    setFallo(null);
    try {
      const nuevo = await activarPush();
      setEstado(nuevo);
      if (nuevo === "activo") {
        playSuccess();
      } else if (nuevo === "denegado") {
        playError();
        setFallo(
          "El navegador los tiene bloqueados para esta web. Se cambia desde el candado de la barra de direcciones."
        );
      }
    } finally {
      setOcupado(false);
    }
  };

  const cerrar = () => {
    try {
      window.localStorage.setItem(CLAVE_DESCARTADO, "1");
    } catch {
      // Sin almacenamiento volverá a preguntarse; tampoco es grave.
    }
    setDescartado(true);
  };

  const visible = estado === "sin-permiso" && !descartado;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div
            className="mb-4 rounded-2xl border px-4 py-3.5"
            style={{
              borderColor: "color-mix(in srgb, var(--ice) 32%, transparent)",
              background: "color-mix(in srgb, var(--ice) 7%, transparent)",
            }}
          >
            <p className="text-sm font-medium text-foreground">
              Enciende los avisos para que no se te escape nada
            </p>
            <p className="mt-1 text-xs leading-snug text-muted">
              Sin ellos solo te enteras de un mensaje o de una llamada si tienes la app abierta en
              ese momento. Con ellos, te avisa el móvil.
            </p>

            {fallo && <p className="mt-2 text-xs leading-snug text-rumor">{fallo}</p>}

            {!appInstalada() && (
              <p className="mt-2 text-[11px] leading-snug text-muted">
                En el móvil funcionan mejor si instalas la app desde el menú del navegador.
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={activar}
                disabled={ocupado}
                className="accent-gradient pulsable rounded-full px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {ocupado ? "Un momento…" : "Activar avisos"}
              </button>
              <button
                type="button"
                onClick={cerrar}
                className="pulsable rounded-full border border-panel-border px-4 py-2 text-xs text-muted hover:text-foreground"
              >
                Ahora no
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
