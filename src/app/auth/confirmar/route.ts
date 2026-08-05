import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * A donde lleva el botón del correo de confirmación.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ ESTA RUTA Y NO LA DE ANTES (/auth/callback)
 *
 * El enlace de confirmación llevaba a /auth/callback, que canjea un
 * "code" por una sesión. Ese canje usa PKCE: al registrarte, el navegador
 * guarda un secreto, y para completar el canje hay que presentar ese
 * mismo secreto. Funciona bien... si abres el correo EN EL MISMO
 * NAVEGADOR donde te registraste.
 *
 * Pero el correo casi nunca se abre ahí. Te registras en el ordenador y
 * abres el Gmail en el móvil; o te registras en Chrome y el enlace se
 * abre en el navegador del propio Gmail. En cuanto eso pasa, el secreto
 * no está, el canje falla y la única salida del código anterior era
 * mandarte a /login sin explicar nada. De ahí lo que describías: pulsas
 * el botón del correo y acabas otra vez en la pantalla de entrar, sin
 * saber si se ha confirmado o no.
 *
 * Esta ruta usa el otro método que ofrece Supabase, verifyOtp con un
 * token_hash, que NO depende de secretos guardados en el navegador. El
 * enlace vale desde cualquier dispositivo.
 * ---------------------------------------------------------------------
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const siguiente = searchParams.get("next");

  const aLogin = (aviso: string) =>
    NextResponse.redirect(`${origin}/login?aviso=${encodeURIComponent(aviso)}`);

  /*
   * Camino B: la plantilla de fábrica de Supabase.
   *
   * Desde junio de 2026, los proyectos gratuitos con el correo por
   * defecto NO pueden editar las plantillas, así que el enlace sigue
   * siendo el {{ .ConfirmationURL }} de fábrica y llega aquí con "code"
   * en vez de "token_hash".
   *
   * Lo importante: cuando el navegador llega hasta aquí, la cuenta YA
   * ESTÁ CONFIRMADA. La verificación ocurre en el servidor de Supabase,
   * en el paso anterior; este "code" solo sirve para dejar la sesión
   * abierta de paso. Si el canje falla —que fallará siempre que el correo
   * se abra en otro navegador, porque el secreto PKCE se quedó en el
   * primero— lo único que se pierde es entrar sin escribir la contraseña.
   *
   * Por eso, cuando falla, no se dice "no se ha podido confirmar" (que
   * sería falso y es lo que hacía antes): se dice la verdad, que la
   * cuenta está lista y solo hay que entrar.
   */
  const code = searchParams.get("code");
  if (!tokenHash && code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${siguiente ?? "/auth/bienvenida"}`);
    }
    return NextResponse.redirect(`${origin}/auth/bienvenida?entrar=1`);
  }

  if (!tokenHash || !tipo) {
    return aLogin(
      "Ese enlace no traía la información necesaria. Prueba a entrar con tu correo y contraseña."
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("expired")) {
      return aLogin(
        "Ese enlace ya ha caducado. Vuelve a crear la cuenta con el mismo correo y te mandaremos uno nuevo."
      );
    }
    if (m.includes("already") || m.includes("invalid")) {
      return aLogin(
        "Ese enlace ya se había usado. Si tu cuenta está confirmada, entra normalmente con tu correo y contraseña."
      );
    }
    return aLogin("No se ha podido confirmar el enlace. Prueba a entrar con tu correo y contraseña.");
  }

  // Para recuperar la contraseña hay que ir a elegir una nueva; para
  // todo lo demás, a la pantalla que explica que ya está.
  if (tipo === "recovery") {
    return NextResponse.redirect(`${origin}/auth/reset-password`);
  }
  return NextResponse.redirect(`${origin}${siguiente ?? "/auth/bienvenida"}`);
}
