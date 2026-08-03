"use client";

import { useEffect } from "react";
import { pullCloudState, iniciarSincronizacionAlVolver } from "@/lib/cloudSync";
import { createClient } from "@/lib/supabase/client";

/**
 * Se monta una sola vez en toda la app y hace dos cosas:
 *
 * 1. Al abrir, si hay sesión, baja de Supabase los gustos aprendidos y
 *    la memoria de Ren. Así, al entrar desde otro dispositivo, Ren te
 *    conoce desde el primer mensaje en vez de empezar de cero.
 * 2. Se queda escuchando los cambios de sesión: en cuanto alguien inicia
 *    sesión, vuelve a sincronizar sin tener que recargar la página.
 *
 * No pinta nada en pantalla y no bloquea nada: si Supabase no está
 * configurado o falla, la app sigue funcionando entera en local.
 */
export function CloudSyncGate() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    void pullCloudState();
    const pararEscucha = iniciarSincronizacionAlVolver();

    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void pullCloudState();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      pararEscucha();
    };
  }, []);

  return null;
}
