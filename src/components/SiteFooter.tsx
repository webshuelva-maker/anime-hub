import Link from "next/link";
import { siteConfig } from "@/config/site";

/**
 * Pie con los enlaces legales. No es decoración: la LSSI obliga a que la
 * información del prestador y las condiciones estén accesibles de forma
 * permanente y directa desde cualquier página.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-panel-border/70 px-4 py-6 sm:px-6">
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
