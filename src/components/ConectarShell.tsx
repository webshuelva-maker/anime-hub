"use client";

import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DescubrirPerfiles } from "./DescubrirPerfiles";
import { MensajesLista } from "./MensajesLista";
import { InvitacionAvisos } from "./InvitacionAvisos";
import { playToggle } from "@/lib/sound";
import { misCoincidencias } from "@/lib/conectar";

/**
 * La estructura de Conectar.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ SE REORGANIZA (v161)
 *
 * Todo vivía apilado en una sola página, en este orden: la ficha de
 * turno, debajo la lista de coincidencias, debajo los datos de tu perfil
 * y al final el botón de borrarlo. Tres asuntos que no tienen nada que
 * ver entre sí, uno detrás de otro, así que al quedarte sin perfiles que
 * ver la pantalla se convertía en un revoltijo: "No queda nadie por
 * ahora", "Habéis coincidido", "Tu perfil", "Salir del apartado social".
 * Parecía una lista de sobras.
 *
 * Son tres cosas distintas y ahora son tres sitios distintos:
 *
 *   Descubrir — conocer gente. Es a lo que se viene, así que abre aquí.
 *   Mensajes  — hablar con quien ya has coincidido.
 *   Tu perfil — lo que los demás ven de ti, y la puerta de salida.
 *
 * Las pestañas llevan el número de mensajes sin leer, que es la única
 * razón por la que alguien querría cambiar de sitio sin haberlo pensado.
 * ---------------------------------------------------------------------
 */

const SUAVE = [0.16, 1, 0.3, 1] as const;

type Pestana = "descubrir" | "mensajes" | "perfil";

export function ConectarShell({ perfil }: { perfil: ReactNode }) {
  const [pestana, setPestana] = useState<Pestana>("descubrir");
  const [sinLeer, setSinLeer] = useState(0);

  // El contador se refresca al montar y al volver a la pestaña: si
  // alguien te escribe mientras miras perfiles, se nota sin recargar.
  useEffect(() => {
    let vivo = true;
    const contar = async () => {
      const lista = await misCoincidencias();
      if (vivo) setSinLeer(lista.reduce((n, c) => n + c.sin_leer, 0));
    };
    const id = setTimeout(() => void contar(), 0);
    const alVolver = () => {
      if (document.visibilityState === "visible") void contar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      clearTimeout(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [pestana]);

  const pestanas: { id: Pestana; texto: string; insignia?: number }[] = [
    { id: "descubrir", texto: "Descubrir" },
    { id: "mensajes", texto: "Mensajes", insignia: sinLeer },
    { id: "perfil", texto: "Tu perfil" },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10 sm:px-6">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Conectar</h1>
      <p className="mt-1.5 text-sm text-muted">
        Gente con tus mismos gustos. Nadie sabe a quién marcas salvo que sea mutuo.
      </p>

      {/* Selector. La pastilla que resalta se desliza entre pestañas con
          layoutId, así que el cambio se sigue con la vista en vez de
          aparecer de golpe en otro sitio. */}
      <div className="mt-7 flex gap-1 rounded-full border border-panel-border p-1">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPestana(p.id);
              playToggle();
            }}
            className="pulsable relative flex-1 rounded-full px-3 py-2 text-sm font-medium"
          >
            {pestana === p.id && (
              <motion.span
                layoutId="pestana-activa"
                transition={{ duration: 0.3, ease: SUAVE }}
                className="absolute inset-0 rounded-full bg-panel-soft"
              />
            )}
            <span
              className={`relative flex items-center justify-center gap-1.5 ${
                pestana === p.id ? "text-foreground" : "text-muted"
              }`}
            >
              {p.texto}
              {!!p.insignia && p.insignia > 0 && (
                <span className="accent-gradient rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {p.insignia}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Se pide aquí, con las conversaciones delante: nada más entrar en
          la app la pregunta no se entiende y se responde que no. */}
      <div className="mt-6">
        <InvitacionAvisos />
      </div>

      <div className="mt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={pestana}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: SUAVE }}
          >
            {pestana === "descubrir" && (
              <DescubrirPerfiles onIrAMensajes={() => setPestana("mensajes")} />
            )}
            {pestana === "mensajes" && <MensajesLista />}
            {pestana === "perfil" && perfil}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
