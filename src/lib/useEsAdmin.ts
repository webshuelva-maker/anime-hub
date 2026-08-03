"use client";

import { useEffect, useState } from "react";
import { esAdministrador } from "@/lib/support";

/**
 * ¿La cuenta conectada es administradora?
 *
 * Se guarda en sessionStorage porque lo pregunta la barra de navegación
 * en cada cambio de página, y sin caché serían varias consultas por
 * minuto para algo que no cambia durante la sesión. Es solo para decidir
 * si se enseña un enlace: la seguridad de verdad está en las políticas de
 * la base de datos, que no devuelven ni un ticket a quien no lo sea.
 */
const CACHE_KEY = "anime-hub:es-admin";

export function useEsAdmin(): boolean {
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    let cancelado = false;

    const guardado = (() => {
      try {
        return sessionStorage.getItem(CACHE_KEY);
      } catch {
        return null;
      }
    })();

    if (guardado !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEsAdmin(guardado === "1");
      return;
    }

    void esAdministrador().then((valor) => {
      if (cancelado) return;
      setEsAdmin(valor);
      try {
        sessionStorage.setItem(CACHE_KEY, valor ? "1" : "0");
      } catch {
        // sin sessionStorage se consulta cada vez, no pasa nada
      }
    });

    return () => {
      cancelado = true;
    };
  }, []);

  return esAdmin;
}
