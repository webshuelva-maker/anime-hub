import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * A donde apuntan los enlaces de confirmación de correo y de "olvidé mi
 * contraseña" de Supabase. Sin esto, el enlace del email lleva a la app
 * con un "?code=..." en la URL que nadie llega a canjear por una sesión
 * de verdad — por eso antes no pasaba nada útil al confirmar el correo.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/perfil";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=No se pudo confirmar el enlace, prueba a iniciar sesión directamente`);
}
