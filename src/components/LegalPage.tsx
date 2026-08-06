"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { legalConfig } from "@/config/legal";
import { playToggle } from "@/lib/sound";

/**
 * Envoltorio común de los documentos legales: mismo encabezado, misma
 * navegación entre ellos y misma tipografía de lectura larga.
 *
 * Esta navegación pasaba en silencio: era el único sitio que "despliega"
 * una sección (Términos / Privacidad / Normas) sin el sonido de
 * desplegar que suena en el resto de la app para el mismo tipo de
 * cambio. Necesita "use client" solo por esto — el contenido largo de
 * cada página sigue llegando ya renderizado desde el servidor a través
 * de children.
 */
export function LegalPage({
  title,
  version,
  children,
}: {
  title: string;
  version: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const links = [
    { href: "/legal/terminos", label: "Términos de uso" },
    { href: "/legal/privacidad", label: "Privacidad" },
    { href: "/legal/normas", label: "Normas de convivencia" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">
        Versión {version} · última actualización {legalConfig.ultimaActualizacion}
      </p>

      <nav className="mt-6 flex flex-wrap gap-2">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => !active && playToggle()}
              className="rounded-full border border-panel-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-ice/40 hover:text-foreground"
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="legal-body panel mt-6 rounded-2xl p-6 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>
    </div>
  );
}
