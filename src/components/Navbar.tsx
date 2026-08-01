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

const LINKS = [
  { href: "/noticias", label: "Noticias" },
  { href: "/preferencias", label: "Afinidad" },
];

export function Navbar() {
  const pathname = usePathname();
  const [avatarId, setAvatarId] = useState("a1");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const prefs = getPreferences();
      setAvatarId(prefs.avatarId);
      setPhotoDataUrl(prefs.avatarPhotoDataUrl);
    };
    refresh();
    window.addEventListener(PREFERENCES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, refresh);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 border-b border-panel-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/noticias" onClick={playClick} onMouseEnter={playHover} className="flex items-center gap-2.5">
          <span className="font-heading flex h-8 w-8 items-center justify-center rounded-full border border-ice/30 ice-text">
            <BrandMark size={14} />
          </span>
          <span className="font-heading text-lg font-semibold tracking-wide">
            {siteConfig.name}
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          {LINKS.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => !active && playToggle()}
                onMouseEnter={() => !active && playHover()}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-panel-soft text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <FullscreenButton />
          <Link
            href="/perfil"
            onClick={playClick}
            onMouseEnter={playHover}
            className="transition-transform hover:scale-105"
          >
            <Avatar avatarId={avatarId} photoDataUrl={photoDataUrl} size="sm" rounded="full" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
