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

  /*
   * Aquí se llega cuando el canje falla, y el motivo casi siempre es el
   * mismo: el correo se ha abierto en un navegador distinto de aquel
   * donde se pidió el enlace, así que el secreto del canje (PKCE) no
   * está. Por eso los correos de confirmación apuntan ahora a
   * /auth/confirmar, que no depende del navegador. Esta ruta se queda
   * para los enlaces antiguos que sigan circulando.
   */
  const aviso =
    "Ese enlace tiene que abrirse en el mismo navegador desde el que lo pediste. Vuelve a pedirlo desde aquí y ábrelo en este dispositivo.";
  return NextResponse.redirect(`${origin}/login?aviso=${encodeURIComponent(aviso)}`);
}
