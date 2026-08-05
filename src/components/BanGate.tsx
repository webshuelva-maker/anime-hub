"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { sancionActiva, tiempoRestante, Sancion } from "@/lib/bans";
import { escucharMisSanciones } from "@/lib/moderacion";
import { cerrarSesion } from "@/lib/sesion";
import { BrandMark } from "./BrandMark";
import { siteConfig } from "@/config/site";
import { legalConfig, emailModeracion } from "@/config/legal";
import { createClient } from "@/lib/supabase/client";

/**
 * Aviso de cuenta sancionada.
 *
 * Se monta en toda la app y, si la cuenta tiene una sanción activa, tapa
 * la pantalla entera y no deja hacer nada más. Solo quedan dos salidas:
 * cerrar sesión o escribir al correo de moderación.
 *
 * Que esto sea una pantalla en el navegador NO es lo que impide entrar:
 * eso lo hacen las políticas de la base de datos, que no devuelven datos
 * a una cuenta sancionada. Esta pantalla existe para que la persona sepa
 * qué ha pasado, por qué y hasta cuándo — enterarse de una expulsión
 * porque de repente nada funciona es la peor forma de enterarse.
 */
export function BanGate() {
  const [sancion, setSancion] = useState<Sancion | null>(null);

  useEffect(() => {
    let vivo = true;
    let dejarDeEscuchar: (() => void) | null = null;

    const comprobar = async () => {
      const s = await sancionActiva();
      if (vivo) setSancion(s);
    };
    void comprobar();

    /*
     * En directo. Antes esto solo se miraba al montar el componente y al
     * volver a la pestaña, así que expulsar a alguien que estaba usando
     * la app no hacía nada visible hasta que recargara — podía seguir
     * media hora dentro. Moderar sirve para cortar algo que está pasando
     * ahora; si tarda en aplicarse, no ha cortado nada.
     *
     * Al recibir el aviso NO se cree lo que llega por el canal: se vuelve
     * a preguntar a la base de datos con sancion_activa, que es la que
     * decide de verdad. Así una sanción levantada retira la pantalla sola
     * por el mismo camino, sin lógica duplicada aquí.
     */
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      (async () => {
        const { data } = await createClient().auth.getUser();
        if (!data.user || !vivo) return;
        dejarDeEscuchar = escucharMisSanciones(data.user.id, () => void comprobar());
      })();
    }

    // Se vuelve a comprobar al volver a la pestaña: así, cuando una
    // expulsión temporal caduca, se recupera el acceso sin recargar.
    const alVolver = () => {
      if (document.visibilityState === "visible") void comprobar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      dejarDeEscuchar?.();
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  if (!sancion) return null;

  const permanente = sancion.tipo === "permanente";

  const salir = async () => {
    await cerrarSesion();
    window.location.href = "/";
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed inset-0 z-[70] flex items-center justify-center px-6"
      style={{ background: "var(--background)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="panel w-full max-w-md rounded-2xl border border-rumor/30 p-7 text-center"
      >
        <motion.span
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-rumor/40"
          style={{ background: "color-mix(in srgb, var(--rumor) 12%, transparent)" }}
        >
          <BrandMark size={22} />
        </motion.span>

        <h1 className="font-heading text-xl font-bold">
          {permanente ? "Tu cuenta ha sido expulsada" : "Tu cuenta está suspendida"}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          {permanente
            ? `No puedes seguir usando ${siteConfig.name} con esta cuenta.`
            : `Podrás volver a entrar dentro de ${tiempoRestante(sancion.hasta)}.`}
        </p>

        <div className="mt-5 rounded-xl border border-panel-border/70 bg-panel-soft/40 p-4 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Motivo</p>
          <p className="mt-1 text-sm leading-snug text-foreground">{sancion.motivo}</p>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          Si crees que es un error, escribe a {emailModeracion} explicando qué ha pasado. Puedes
          consultar las{" "}
          <a href="/legal/normas" className="ice-text hover:underline">
            normas de convivencia
          </a>{" "}
          (versión {legalConfig.versionNormas}).
        </p>

        <button
          type="button"
          onClick={salir}
          className="mt-6 w-full rounded-full border border-panel-border px-4 py-2.5 text-sm text-muted transition-colors hover:border-ice/40 hover:text-foreground"
        >
          Cerrar sesión
        </button>
      </motion.div>
    </motion.div>
  );
}
