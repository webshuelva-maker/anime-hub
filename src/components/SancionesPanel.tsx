"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDialog } from "./ConfirmDialog";
import { playError, playSuccess, playToggle } from "@/lib/sound";

/**
 * Sanciones sobre una persona concreta.
 *
 * Antes desde aquí solo se podía responder. Poder responder pero no
 * actuar no es moderar: si alguien está acosando a otra persona, hace
 * falta cortarlo, y hace falta que quede constancia.
 *
 * Hay cuatro castigos a propósito, de menos a más, en vez de solo
 * "expulsar": la mayoría de los problemas se resuelven con un parón de
 * un día, y reservar la expulsión definitiva para lo grave hace que
 * signifique algo.
 *
 * ITERACIÓN — antes cada duración ERA su propio botón ("Suspender 1
 * día", "Suspender 7 días"…). Parecían pastillas de selección y no
 * acciones, y justo encima la sección de avisos sí tenía su botón claro
 * de "Enviar aviso": el resultado era que no se encontraba dónde aplicar
 * la sanción. Ahora la duración se ELIGE y hay un único botón, cuyo
 * texto dice exactamente lo que va a pasar al pulsarlo.
 *
 * OJO al usarlo: hay que pasarle key={userId}. Al cambiar de persona,
 * React reaprovecharía el componente y se quedaría dentro el motivo
 * escrito para el anterior — es muy fácil redactar una sanción para uno
 * y acabar aplicándosela al siguiente. Con la clave, se monta de cero.
 */

interface SancionFila {
  id: string;
  tipo: "temporal" | "permanente";
  motivo: string;
  hasta: string | null;
  creado_en: string;
  levantada_en: string | null;
}

type Castigo = { etiqueta: string; horas: number | null };

const CASTIGOS: Castigo[] = [
  { etiqueta: "1 día", horas: 24 },
  { etiqueta: "7 días", horas: 24 * 7 },
  { etiqueta: "30 días", horas: 24 * 30 },
  { etiqueta: "Para siempre", horas: null },
];

const SUAVE = [0.16, 1, 0.3, 1] as const;

export function SancionesPanel({
  userId,
  onCambio,
}: {
  userId: string;
  /** Para que la lista de miembros se entere y refresque su etiqueta. */
  onCambio?: () => void;
}) {
  const [historial, setHistorial] = useState<SancionFila[]>([]);
  const [motivo, setMotivo] = useState("");
  // Arranca en lo más suave: para expulsar hay que elegirlo a mano.
  const [castigo, setCastigo] = useState<Castigo>(CASTIGOS[0]);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoExpulsion, setConfirmandoExpulsion] = useState(false);

  const permanente = castigo.horas === null;

  const cargar = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("user_bans")
      .select("id, tipo, motivo, hasta, creado_en, levantada_en")
      .eq("user_id", userId)
      .order("creado_en", { ascending: false });
    setHistorial((data as SancionFila[]) ?? []);
  };

  useEffect(() => {
    // En un temporizador a cero para no encadenar renderizados: la
    // consulta es asíncrona, pero cargar() se llama de forma síncrona
    // dentro del efecto y el linter lo marca.
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const activa = historial.find(
    (s) => !s.levantada_en && (s.tipo === "permanente" || (s.hasta && new Date(s.hasta) > new Date()))
  );

  const aplicar = async () => {
    if (motivo.trim().length < 5) {
      playError();
      setAviso("Escribe el motivo. Queda guardado y la persona lo va a leer.");
      return;
    }
    if (permanente) {
      setConfirmandoExpulsion(true);
      return;
    }
    await ejecutar("temporal", castigo.horas!);
  };

  const ejecutar = async (tipo: "temporal" | "permanente", horas?: number) => {
    setOcupado(true);
    setAviso(null);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("user_bans").insert({
        user_id: userId,
        tipo,
        motivo: motivo.trim(),
        hasta: horas ? new Date(Date.now() + horas * 3_600_000).toISOString() : null,
        creado_por: auth.user?.id ?? null,
      });
      if (error) {
        playError();
        setAviso(`No se ha podido aplicar: ${error.message}`);
        return;
      }
      playSuccess();

      // Aviso al móvil. Si falla no importa: la sanción ya está aplicada
      // y le aparecerá en pantalla en cuanto tenga la app delante.
      void fetch("/api/push/moderacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tipo: "sancion", texto: motivo.trim() }),
      }).catch(() => {});

      setMotivo("");
      setCastigo(CASTIGOS[0]);
      setConfirmandoExpulsion(false);
      await cargar();
      onCambio?.();
    } finally {
      setOcupado(false);
    }
  };

  const levantar = async (id: string) => {
    setOcupado(true);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      await supabase
        .from("user_bans")
        .update({ levantada_en: new Date().toISOString(), levantada_por: auth.user?.id ?? null })
        .eq("id", id);
      playToggle();
      await cargar();
      onCambio?.();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.06, ease: SUAVE }}
      className="border-t border-panel-border px-5 py-4"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
          Suspender o expulsar
        </h3>
        {activa && (
          <span className="rounded-full border border-rumor/40 bg-rumor/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rumor">
            {activa.tipo === "permanente" ? "Expulsada" : "Suspendida"}
          </span>
        )}
      </div>

      {activa ? (
        <div className="mt-3 rounded-xl border border-rumor/30 bg-rumor/5 p-3">
          <p className="text-sm leading-snug text-foreground">{activa.motivo}</p>
          <p className="mt-1 text-[11px] text-muted">
            {activa.tipo === "permanente"
              ? "Expulsión definitiva"
              : `Hasta el ${new Date(activa.hasta!).toLocaleString("es-ES", {
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`}
          </p>
          <motion.button
            type="button"
            onClick={() => levantar(activa.id)}
            disabled={ocupado}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.2, ease: SUAVE }}
            className="mt-3 rounded-full border border-panel-border px-4 py-2 text-xs font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground disabled:opacity-50"
          >
            Levantar sanción
          </motion.button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (aviso) setAviso(null);
            }}
            placeholder="Motivo (lo verá la persona sancionada)"
            className="panel-elevated mt-3 w-full rounded-lg px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
          />

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Duración
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CASTIGOS.map((c) => {
              const elegido = c.etiqueta === castigo.etiqueta;
              const color = c.horas === null ? "var(--rumor)" : "var(--ice)";
              return (
                <motion.button
                  key={c.etiqueta}
                  type="button"
                  onClick={() => {
                    setCastigo(c);
                    playToggle();
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.2, ease: SUAVE }}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200"
                  style={
                    elegido
                      ? {
                          borderColor: color,
                          color,
                          background: `color-mix(in srgb, ${color} 12%, transparent)`,
                        }
                      : { borderColor: "var(--panel-border)", color: "var(--muted)" }
                  }
                >
                  {c.etiqueta}
                </motion.button>
              );
            })}
          </div>

          {/* Un solo botón, y su texto dice lo que va a pasar. */}
          <motion.button
            type="button"
            onClick={aplicar}
            disabled={ocupado}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2, ease: SUAVE }}
            className={`mt-4 w-full rounded-full py-2.5 text-sm font-semibold transition-colors duration-200 disabled:opacity-40 ${
              permanente ? "border text-rumor" : "accent-gradient text-white"
            }`}
            style={
              permanente
                ? {
                    borderColor: "color-mix(in srgb, var(--rumor) 50%, transparent)",
                    background: "color-mix(in srgb, var(--rumor) 10%, transparent)",
                  }
                : undefined
            }
          >
            {ocupado
              ? "Aplicando…"
              : permanente
              ? "Expulsar para siempre"
              : `Suspender ${castigo.etiqueta}`}
          </motion.button>

          <p className="mt-2 text-[11px] leading-snug text-muted">
            {permanente
              ? "Pedirá confirmación. Se puede levantar después, pero queda registrado."
              : "Se le corta el acceso al momento y ve el motivo en pantalla."}
          </p>
        </>
      )}

      <AnimatePresence>
        {aviso && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: SUAVE }}
            className="mt-2 text-xs text-rumor"
          >
            {aviso}
          </motion.p>
        )}
      </AnimatePresence>

      {historial.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Historial ({historial.length})
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {historial.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-baseline gap-2 text-[11px] leading-snug">
                <span className={s.levantada_en ? "text-muted line-through" : "text-foreground"}>
                  {s.tipo === "permanente" ? "Expulsión" : "Suspensión"}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">{s.motivo}</span>
                <span className="shrink-0 text-muted/70">
                  {new Date(s.creado_en).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmandoExpulsion}
        title="Expulsar para siempre"
        message="Esta persona no podrá volver a usar la app con esta cuenta. Queda registrado quién lo ha hecho y por qué, y se puede levantar después. Úsalo solo para cosas graves."
        confirmLabel="Sí, expulsar"
        onConfirm={() => ejecutar("permanente")}
        onCancel={() => setConfirmandoExpulsion(false)}
      />
    </motion.div>
  );
}
