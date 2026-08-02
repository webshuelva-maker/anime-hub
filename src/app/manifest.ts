import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * Manifiesto de aplicación instalable (PWA).
 *
 * Va como archivo .ts y no como manifest.json estático para que el nombre
 * salga de siteConfig: si algún día se renombra la app, se cambia en un
 * único sitio y esto lo sigue.
 *
 * "display: standalone" es lo que hace que, una vez añadida a la pantalla
 * de inicio, se abra sin barra de navegador — que es además el requisito
 * de iOS para poder mandar notificaciones.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} — ${siteConfig.tagline}`,
    short_name: siteConfig.shortName,
    description: siteConfig.description,
    start_url: "/noticias",
    display: "standalone",
    orientation: "portrait",
    background_color: "#06070a",
    theme_color: "#06070a",
    lang: "es",
    categories: ["news", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android recorta el icono con la forma que quiera (círculo,
      // cuadrado redondeado...). Esta versión lleva el dibujo más
      // pequeño para que no le corte las puntas al recortarlo.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
