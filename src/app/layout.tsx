import type { Metadata } from "next";
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
import { AmbientGlow } from "@/components/AmbientGlow";

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AmbientGlow />
        <SiteChrome />
        {children}
      </body>
    </html>
  );
}
