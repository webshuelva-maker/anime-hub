"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { getPreferences } from "@/lib/storage";
import { Avatar } from "./AvatarPicker";

const LINKS = [
  { href: "/noticias", label: "Noticias" },
  { href: "/preferencias", label: "Afinidad" },
];

export function Navbar() {
  const pathname = usePathname();
  const [avatarId, setAvatarId] = useState("a1");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const prefs = getPreferences();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvatarId(prefs.avatarId);
    setPhotoDataUrl(prefs.avatarPhotoDataUrl);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 border-b border-panel-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/noticias" className="flex items-center gap-2.5">
          <span className="font-heading flex h-8 w-8 items-center justify-center rounded-full border border-ice/30 text-sm font-bold ice-text">
            愛
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
                className={`relative py-1 text-sm font-medium transition-colors ${
                  active ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute -bottom-[17px] left-0 right-0 h-[2px] bg-ice"
                    transition={{ type: "spring", stiffness: 320, damping: 34 }}
                  />
                )}
              </Link>
            );
          })}
          <Link href="/perfil" className="transition-transform hover:scale-105">
            <Avatar avatarId={avatarId} photoDataUrl={photoDataUrl} size="sm" rounded="full" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
