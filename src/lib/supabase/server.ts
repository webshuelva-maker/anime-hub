import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para usar en Server Components, Route Handlers y
 * Server Actions — gestiona la sesión leyendo/escribiendo cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Se puede llamar desde un Server Component (sin permiso para
            // escribir cookies) — se ignora si el middleware ya refresca
            // la sesión por su cuenta.
          }
        },
      },
    }
  );
}
