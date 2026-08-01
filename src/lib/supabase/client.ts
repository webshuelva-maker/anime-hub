"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para usar en componentes de cliente ("use client").
 * Lee la URL y la clave pública (anon) de las variables de entorno —
 * ambas son seguras de exponer al navegador, están pensadas para eso
 * (la seguridad de verdad la dan las políticas de Row Level Security
 * configuradas en la base de datos, no el secreto de esta clave).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
