import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const ONBOARDED_COOKIE = "anime-hub-onboarded";

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  /*
   * Reparto desde el servidor de la página raíz.
   *
   * "/" no es una pantalla: es solo una decisión (¿noticias u
   * onboarding?). Antes esa decisión la tomaba React en un efecto, o sea
   * después de descargar el JavaScript, interpretarlo e hidratar — medio
   * segundo largo durante el cual el navegador pintaba la raíz. Ese era
   * el parpadeo.
   *
   * Ahora, si la cookie está puesta, se responde directamente con un
   * redirect y el navegador NUNCA llega a pintar la raíz. Cero parpadeo,
   * y encima funciona aunque el JavaScript tarde o falle.
   *
   * Si la cookie no está (alguien que ya usaba la app antes de esto), no
   * se redirige a ciegas: mandarlo al onboarding sería borrarle la
   * bienvenida a alguien que ya la hizo. En ese caso se deja pasar y es
   * la propia raíz la que decide y deja la cookie puesta para la próxima.
   */
  if (request.nextUrl.pathname === "/") {
    const onboarded = request.cookies.get(ONBOARDED_COOKIE)?.value;
    if (onboarded === "1" || onboarded === "0") {
      const destino = new URL(onboarded === "1" ? "/noticias" : "/onboarding", request.url);
      const redirect = NextResponse.redirect(destino);
      // Las cookies de sesión que acabe de refrescar Supabase tienen que
      // viajar también en el redirect; si no, se pierde la sesión al
      // entrar por la raíz.
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Se ejecuta en todas las rutas excepto archivos estáticos e
     * imágenes, para no gastar tiempo de más en peticiones que no lo
     * necesitan.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
