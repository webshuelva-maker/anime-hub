"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getPreferences, PREFERENCES_CHANGED_EVENT } from "@/lib/storage";
import { Avatar } from "./AvatarPicker";
import { playToggle } from "@/lib/sound";
import { vibrar } from "@/lib/haptics";
import { ULTIMA_VERSION } from "@/data/changelog";
import { useEsAdmin } from "@/lib/useEsAdmin";

/**
 * Barra de navegación inferior, solo en móvil.
 *
 * Arriba, los enlaces quedaban en la zona a la que peor llega el pulgar y
 * con un área de toque de unos 28px — bastante por debajo de los ~44px
 * que hacen que no falles al pulsar. Abajo se llega sin recolocar la mano
 * y cada pestaña ocupa toda su columna, así que acertar es trivial.
 *
 * En pantallas grandes no aparece: ahí la barra de arriba funciona bien y
 * una barra flotante abajo solo estorbaría.
 */

const TABS = [
  {
    href: "/noticias",
    label: "Noticias",
    icon: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/conectar",
    label: "Conectar",
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="10" r="2.5" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 19a4 4 0 0 1 5.5-3.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/preferencias",
    label: "Tus gustos",
    icon: (
      <>
        <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z" />
      </>
    ),
  },
];

/*
 * Pestaña de moderación. Va aparte de TABS porque solo la ve quien es
 * administrador: para todos los demás la barra sigue teniendo cuatro
 * columnas exactas y no cambia nada.
 */
const TAB_MODERACION = {
  href: "/admin/soporte",
  label: "Moderar",
  icon: (
    <>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 8.5-4.1-.9-7-4.3-7-8.5V6l7-3Z" />
      <path d="M9.5 12l1.8 1.8 3.4-3.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function MobileNav() {
  const pathname = usePathname();
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

  const esAdmin = useEsAdmin();
  const perfilActivo = pathname?.startsWith("/perfil");

  // Con la pestaña de moderación son cinco columnas en vez de cuatro, así
  // que cada una se estrecha: se recorta el texto un pelín para que
  // "Tus gustos" no se parta en dos líneas en pantallas pequeñas.
  const tabs = esAdmin ? [...TABS, TAB_MODERACION] : TABS;

  return (
    <nav
      data-chrome-app
      // El relleno inferior extra es la franja del gesto de inicio en los
      // móviles sin botón: sin él, la última fila de iconos queda justo
      // debajo de la barra del sistema.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      className="fixed inset-x-0 bottom-0 z-30 sm:hidden"
    >
      {/*
        Translúcida, pero NO transparente del todo.
        Transparente entera se ve muy bien con un fondo liso y fatal en
        cuanto pasa por debajo la portada clara de una noticia: los
        iconos desaparecen justo cuando vas a pulsarlos. Y una barra
        opaca con línea encima corta la pantalla en dos y parece una web.
        El término medio es el de las apps del sistema: desenfoque fuerte,
        fondo a medio camino y un degradado por encima que disuelve el
        contenido al llegar a la barra, sin ninguna línea dura.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-full h-8"
        style={{ background: "linear-gradient(to top, var(--background), transparent)" }}
      />
      <div
        className="relative flex items-stretch justify-around backdrop-blur-md"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--background) 62%, transparent), color-mix(in srgb, var(--background) 88%, transparent))",
        }}
      >
        {tabs.map((tab) => {
          const active = pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => {
                if (active) return;
                playToggle();
                vibrar(8);
              }}
              // min-h de 56px: por encima de los 44px recomendados, con
              // sitio de sobra para el dedo.
              className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2"
            >
              {active && (
                <motion.span
                  layoutId="tab-activa"
                  className="absolute inset-x-3 top-0 h-[2px] rounded-full"
                  style={{ background: "var(--ice)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className={active ? "ice-text" : "text-muted"}
              >
                {tab.icon}
              </svg>
              <span
                className={`${esAdmin ? "text-[9px]" : "text-[10px]"} leading-none ${active ? "font-semibold text-foreground" : "text-muted"}`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}

        <Link
          href="/perfil"
          onClick={() => {
            if (perfilActivo) return;
            playToggle();
            vibrar(8);
          }}
          className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2"
        >
          {perfilActivo && (
            <motion.span
              layoutId="tab-activa"
              className="absolute inset-x-3 top-0 h-[2px] rounded-full"
              style={{ background: "var(--ice)" }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <span className={`relative ${perfilActivo ? "rounded-full ring-1 ring-ice/60" : ""}`}>
            <Avatar avatarId={avatarId} photoDataUrl={photoDataUrl} size="sm" rounded="full" />
            {hayNovedades && (
              <span
                aria-label="Hay novedades sin leer"
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                style={{ background: "var(--ice)" }}
              />
            )}
          </span>
          <span
            className={`${esAdmin ? "text-[9px]" : "text-[10px]"} leading-none ${perfilActivo ? "font-semibold text-foreground" : "text-muted"}`}
          >
            Perfil
          </span>
        </Link>
      </div>
    </nav>
  );
}
