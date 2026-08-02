"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/config/site";

/** Pantallas de paso, donde el pie solo sería un destello al arrancar. */
const OCULTO_EN = ["/", "/onboarding"];

/**
 * Pie con los enlaces legales. No es decoración: la LSSI obliga a que la
 * información del prestador y las condiciones estén accesibles de forma
 * permanente y directa desde cualquier página.
 */
export function SiteFooter() {
  const pathname = usePathname();
  if (OCULTO_EN.includes(pathname ?? "")) return null;

  return (
    // data-chrome-app: lo esconde durante el arranque, igual que la barra
    // superior y el orbe. Sin esto asomaba una franja con los enlaces
    // legales antes de que apareciera la pantalla de carga.
    <footer
      data-chrome-app
      className="border-t border-panel-border/70 px-4 py-6 sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-[11px] text-muted">
          {siteConfig.name} — las noticias pertenecen a sus medios originales.
        </p>
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/legal/terminos" className="text-[11px] text-muted transition-colors hover:text-foreground">
            Términos de uso
          </Link>
          <Link href="/legal/privacidad" className="text-[11px] text-muted transition-colors hover:text-foreground">
            Privacidad
          </Link>
          <Link href="/legal/normas" className="text-[11px] text-muted transition-colors hover:text-foreground">
            Normas de convivencia
          </Link>
          <Link href="/soporte" className="text-[11px] text-muted transition-colors hover:text-foreground">
            Contacto y denuncias
          </Link>
        </nav>
      </div>
    </footer>
  );
}
