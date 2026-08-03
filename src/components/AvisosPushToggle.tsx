"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { playToggle } from "@/lib/sound";
import { createClient } from "@/lib/supabase/client";
import {
  EstadoPush,
  activarPush,
  appInstalada,
  desactivarPush,
  getEstadoPush,
  pushDisponible,
  ultimoErrorPush,
} from "@/lib/push";

/**
 * Activa los avisos al móvil para el administrador.
 *
 * Va dentro del panel de moderación y no en ajustes generales: de momento
 * el único aviso que existe es "hay una consulta nueva", que solo le
 * interesa a quien las atiende.
 */
export function AvisosPushToggle() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [instalada, setInstalada] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [diagnostico, setDiagnostico] = useState<string | null>(null);

  const probar = async () => {
    setOcupado(true);
    setDiagnostico("Probando…");
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const res = await fetch("/api/push/probar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user?.id }),
      });
      const json: { ok: boolean; detalle: string } = await res.json();
      setDiagnostico(json.detalle);
    } catch (e) {
      setDiagnostico(`No se pudo contactar con el servidor: ${e instanceof Error ? e.message : e}`);
    }
    setOcupado(false);
  };

  useEffect(() => {
    // Depende de APIs del navegador (matchMedia, Notification), así que
    // no puede resolverse durante el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalada(appInstalada());
    void getEstadoPush().then(setEstado);
  }, []);

  const alternar = async () => {
    setOcupado(true);
    playToggle();
    if (estado === "activo") {
      await desactivarPush();
      setEstado("sin-permiso");
    } else {
      const nuevo = await activarPush();
      setEstado(nuevo);
      // Si no ha quedado activo, se enseña el motivo en vez de dejar el
      // botón como si no hubiera pasado nada.
      setDiagnostico(nuevo === "activo" ? null : ultimoErrorPush);
    }
    setOcupado(false);
  };

  if (estado === null) return null;

  // En iPhone las notificaciones web solo existen si la app está añadida
  // a la pantalla de inicio. Enseñar el botón sin avisar de esto sería
  // dejar que lo pulse y no pase nada, sin explicación.
  const esIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="panel mt-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Avisarme al móvil</p>
          <p className="text-xs text-muted">
            {estado === "activo"
              ? "Recibirás una notificación cuando alguien abra una consulta."
              : estado === "denegado"
              ? "Bloqueaste las notificaciones. Para volver a activarlas hay que permitirlas en los ajustes del navegador."
              : estado === "no-disponible"
              ? "Este navegador no admite notificaciones."
              : "Ahora mismo no recibes avisos de consultas nuevas."}
          </p>
        </div>

        {estado !== "no-disponible" && estado !== "denegado" && (
          <motion.button
            type="button"
            onClick={alternar}
            disabled={ocupado}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              estado === "activo"
                ? "border border-panel-border text-muted transition-colors hover:border-ice/40 hover:text-foreground"
                : "accent-gradient text-white"
            }`}
          >
            {ocupado ? "…" : estado === "activo" ? "Desactivar" : "Activar avisos"}
          </motion.button>
        )}
      </div>

      {estado === "activo" && (
        <button
          type="button"
          onClick={probar}
          disabled={ocupado}
          className="mt-3 text-xs text-muted underline transition-colors hover:text-foreground disabled:opacity-50"
        >
          Enviarme un aviso de prueba
        </button>
      )}

      {diagnostico && (
        <p className="mt-2 rounded-lg border border-panel-border bg-panel-soft px-3 py-2 text-xs leading-relaxed text-muted">
          {diagnostico}
        </p>
      )}

      {esIOS && !instalada && pushDisponible() && (
        <p className="mt-3 rounded-lg border border-panel-border bg-panel-soft px-3 py-2 text-xs text-muted">
          En iPhone los avisos solo funcionan con la app añadida a la pantalla de inicio. Ábrela
          desde ahí y activa esto dentro.
        </p>
      )}
    </div>
  );
}
