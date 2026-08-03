"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";
import { getPreferences, PREFERENCES_CHANGED_EVENT } from "@/lib/storage";
import { Avatar } from "./AvatarPicker";
import { FullscreenButton } from "./FullscreenButton";
import { BrandMark } from "./BrandMark";
import { playToggle, playHover, playClick } from "@/lib/sound";
import { useEsAdmin } from "@/lib/useEsAdmin";
import { ULTIMA_VERSION } from "@/data/changelog";

const LINK_MODERACION = { href: "/admin/soporte", label: "Moderación" };

const LINKS = [
  { href: "/noticias", label: "Noticias" },
  { href: "/conectar", label: "Conectar" },
  { href: "/preferencias", label: "Tus gustos" },
];

export function Navbar() {
  const pathname = usePathname();
  const esAdmin = useEsAdmin();
  const [avatarId, setAvatarId] = useState("a1");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [hayNovedades, setHayNovedades] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const prefs = getPreferences();
      setAvatarId(prefs.avatarId);
      setPhotoDataUrl(prefs.avatarPhotoDataUrl);
      setHayNovedades(prefs.lastSeenChangelog !== ULTIMA_VERSION);
    };
    refresh();
    window.addEventListener(PREFERENCES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, refresh);
  }, [pathname]);

  // Solo para administradores; el resto ni ve el enlace.
  const enlaces = esAdmin ? [...LINKS, LINK_MODERACION] : LINKS;

  return (
    <header data-chrome-app className="sticky top-0 z-20 border-b border-panel-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-4 sm:px-6">
        <Link href="/noticias" onClick={playClick} onMouseEnter={playHover} className="flex shrink-0 items-center gap-2.5">
          <span className="font-heading flex h-8 w-8 items-center justify-center rounded-full border border-ice/30 ice-text">
            <BrandMark size={14} />
          </span>
          {/* El nombre se esconde en pantallas estrechas: junto a los tres
              enlaces, el icono y el avatar la barra medía ~600px y se
              salía de un móvil de 390px, dejando arrastrar toda la web
              de lado. El emblema ya identifica la app de sobra. */}
          <span className="font-heading text-lg font-semibold tracking-wide">
            {siteConfig.name}
          </span>
        </Link>

        {/* Los enlaces y el avatar se van a la barra inferior en móvil
            (MobileNav): arriba se queda solo el emblema, que es lo que
            pidió el usuario y además libera toda la fila para el título. */}
        <nav className="hidden min-w-0 items-center gap-0.5 sm:flex sm:gap-6">
          {enlaces.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => !active && playToggle()}
                onMouseEnter={() => !active && playHover()}
                className={`whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] font-medium sm:px-3 sm:text-sm ${
                  active ? "bg-panel-soft text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {/* Oculto en móvil: ahí no cabe, y además iOS no admite la API
              de pantalla completa, así que no haría nada. Para tenerla
              sin barras en el móvil está la instalación en pantalla de
              inicio. */}
          <span className="hidden sm:inline">
            <FullscreenButton />
          </span>
          <Link
            href="/perfil"
            onClick={playClick}
            onMouseEnter={playHover}
            className="relative ml-1 shrink-0 transition-transform hover:scale-105 sm:ml-0"
          >
            <Avatar avatarId={avatarId} photoDataUrl={photoDataUrl} size="sm" rounded="full" />
            {/* Punto de novedades sin leer. Va sobre el avatar porque la
                pantalla de Novedades cuelga del perfil. */}
            {hayNovedades && (
              <span
                aria-label="Hay novedades sin leer"
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                style={{ background: "var(--ice)" }}
              />
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
