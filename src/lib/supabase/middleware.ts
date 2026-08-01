import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresca el token de sesión de Supabase en cada petición — sin esto,
 * la sesión podría caducar en mitad del uso normal de la app. Se llama
 * desde middleware.ts en la raíz del proyecto.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Si aún no hay claves de Supabase configuradas, no se rompe nada —
  // simplemente no hay sesión que refrescar todavía.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  // Refresca la sesión si hace falta — necesario para que los Server
  // Components puedan leer al usuario autenticado de forma fiable.
  await supabase.auth.getUser();

  return supabaseResponse;
}
