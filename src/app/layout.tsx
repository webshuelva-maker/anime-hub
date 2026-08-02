import type { Metadata, Viewport } from "next";
import "@fontsource/shippori-mincho/400.css";
import "@fontsource/shippori-mincho/600.css";
import "@fontsource/shippori-mincho/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import { siteConfig } from "@/config/site";
import { SiteChrome } from "@/components/SiteChrome";
import { SiteFooter } from "@/components/SiteFooter";
import { CloudSyncGate } from "@/components/CloudSyncGate";
import { AmbientGlow } from "@/components/AmbientGlow";

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
  applicationName: siteConfig.name,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    // Sin esto, iOS abre la app añadida a inicio dentro de Safari con su
    // barra encima — y además es requisito para las notificaciones.
    capable: true,
    title: siteConfig.name,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#06070a",
  // La app ya usa 100dvh y safe-area-inset por dentro, así que puede
  // dibujar bajo la muesca y la barra inferior sin que se corte nada.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <CloudSyncGate />
        <AmbientGlow />
        <SiteChrome />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
