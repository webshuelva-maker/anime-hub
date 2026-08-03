"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDialog } from "./ConfirmDialog";
import { playError, playSuccess, playToggle } from "@/lib/sound";

/**
 * Sanciones sobre una persona concreta, dentro del panel de moderación.
 *
 * Antes desde aquí solo se podía responder. Poder responder pero no
 * actuar no es moderar: si alguien está acosando a otra persona, hace
 * falta cortarlo, y hace falta que quede constancia.
 *
 * Hay tres castigos a propósito, de menos a más, en vez de solo
 * "expulsar": la mayoría de los problemas se resuelven con un parón de
 * un día, y reservar la expulsión definitiva para lo grave hace que
 * signifique algo.
 */

interface SancionFila {
  id: string;
  tipo: "temporal" | "permanente";
  motivo: string;
  hasta: string | null;
  creado_en: string;
  levantada_en: string | null;
}

const CASTIGOS = [
  { etiqueta: "1 día", horas: 24 },
  { etiqueta: "7 días", horas: 24 * 7 },
  { etiqueta: "30 días", horas: 24 * 30 },
] as const;

export function SancionesPanel({ userId }: { userId: string }) {
  const [historial, setHistorial] = useState<SancionFila[]>([]);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoExpulsion, setConfirmandoExpulsion] = useState(false);

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

  const sancionar = async (tipo: "temporal" | "permanente", horas?: number) => {
    if (motivo.trim().length < 5) {
      playError();
      setAviso("Escribe el motivo. Queda guardado y la persona lo va a leer.");
      return;
    }

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
      setMotivo("");
      setConfirmandoExpulsion(false);
      await cargar();
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
    } finally {
      setOcupado(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="border-t border-panel-border px-5 py-4"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
          Sanciones
        </h3>
        {activa && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-full border border-rumor/40 bg-rumor/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rumor"
          >
            {activa.tipo === "permanente" ? "Expulsada" : "Suspendida"}
          </motion.span>
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
          <button
            type="button"
            onClick={() => levantar(activa.id)}
            disabled={ocupado}
            className="mt-3 rounded-full border border-panel-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground disabled:opacity-50"
          >
            Levantar sanción
          </button>
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

          <div className="mt-3 flex flex-wrap gap-2">
            {CASTIGOS.map((c) => (
              <motion.button
                key={c.etiqueta}
                type="button"
                onClick={() => sancionar("temporal", c.horas)}
                disabled={ocupado}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="rounded-full border border-panel-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground disabled:opacity-50"
              >
                Suspender {c.etiqueta}
              </motion.button>
            ))}

            <motion.button
              type="button"
              onClick={() => setConfirmandoExpulsion(true)}
              disabled={ocupado}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="rounded-full border border-rumor/40 px-3 py-1.5 text-xs font-semibold text-rumor transition-colors hover:bg-rumor/10 disabled:opacity-50"
            >
              Expulsar para siempre
            </motion.button>
          </div>
        </>
      )}

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
        onConfirm={() => sancionar("permanente")}
        onCancel={() => setConfirmandoExpulsion(false)}
      />
    </motion.div>
  );
}
