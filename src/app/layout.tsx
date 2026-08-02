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
  // OJO: al declarar este objeto se sustituye el viewport por defecto de
  // Next.js, así que width e initialScale hay que ponerlos a mano. Sin
  // "width: device-width" el móvil renderiza a ancho de escritorio y deja
  // hacer zoom y arrastrar la página — y con eso se podía mover la
  // pantalla de carga a un lado y ver el feed por debajo.
  width: "device-width",
  initialScale: 1,
  // Sin zoom manual: la app está pensada como pantalla completa y al
  // ampliar se descoloca todo lo anclado (barra superior, orbe de Ren).
  maximumScale: 1,
  userScalable: false,
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
