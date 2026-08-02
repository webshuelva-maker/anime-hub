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
    <html
      lang="es"
      className="h-full antialiased"
      // El fondo va TAMBIÉN aquí y en línea, no solo en la hoja de
      // estilos. Entre que el navegador recibe el HTML y termina de
      // aplicar el CSS hay un instante en el que pinta el lienzo con su
      // color por defecto, que es blanco; en un documento nuevo (al
      // abrir la app o al llegar desde el redirect de la raíz) eso es un
      // fogonazo claro de una o dos décimas. Un atributo style se aplica
      // en el mismo momento de leer la etiqueta, antes que cualquier
      // hoja externa. color-scheme dark hace lo propio con los elementos
      // que pinta el sistema (barras de desplazamiento, fondo del
      // navegador durante la carga).
      style={{ background: "#06070a", colorScheme: "dark" }}
    >
      <head>
        {/*
          Se ejecuta ANTES del primer pintado, a propósito.

          Aquí también arranca la petición de noticias. Es lo que hace
          que la presentación de entrada no sea tiempo perdido: mientras
          se ve la animación, el servidor ya está trabajando. Esta línea
          se ejecuta unas cuatro décimas antes de que React llegue a
          pedirlo, y la promesa se guarda en window para que NewsFeed la
          reutilice en vez de pedir lo mismo dos veces.

          Lo primero es el reparto desde la raíz. Normalmente ya lo ha
          hecho el servidor (ver src/proxy.ts) y aquí no se llega; esto
          es la red de seguridad para quien todavía no tiene la cookie
          puesta, típicamente alguien que ya usaba la app antes. Salta al
          instante y deja la cookie lista, así que solo ocurre una vez.

          La barra superior y el orbe de Ren viven aquí, en el layout, y
          se pintan de inmediato; la pantalla de carga vive dentro de la
          página y tarda un pelín más en montarse. Ese desfase de una o
          dos décimas es lo que dejaba asomar la home al abrir la app.

          Como React no llega a tiempo de decidirlo, se decide aquí: si no
          hay noticias en caché, esta va a ser una carga con pantalla de
          espera, así que se marca el documento y el CSS esconde la barra
          y el orbe desde el primer fotograma. FirstLoadOverlay quita la
          marca cuando termina.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(location.pathname==='/'){var p=localStorage.getItem('anime-hub:preferences');var ok=false;try{ok=!!(p&&JSON.parse(p).onboardingCompleted)}catch(e){}document.cookie='anime-hub-onboarded='+(ok?'1':'0')+'; path=/; max-age=31536000; SameSite=Lax';location.replace(ok?'/noticias':'/onboarding')}}catch(e){}
try{var enNoticias=location.pathname==='/'||location.pathname.indexOf('/noticias')===0;if(enNoticias&&!sessionStorage.getItem('anime-hub:news-cache')){var d=document.documentElement;d.classList.add('arrancando');setTimeout(function(){d.classList.remove('arrancando')},20000);window.__animeHubNoticias=fetch('/api/news').then(function(r){return r.json()}).catch(function(){return null})}}catch(e){}`,
          }}
        />
      </head>
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
