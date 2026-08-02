/*
 * Service worker de Anime Hub.
 *
 * Su única razón de ser ahora mismo es recibir notificaciones cuando la
 * app está cerrada: el navegador lo despierta él solo al llegar un aviso,
 * sin que haya ninguna pestaña abierta. A propósito NO cachea nada — la
 * app va contra datos que cambian (noticias, tickets) y una caché mal
 * hecha es la forma más rápida de que alguien se quede viendo contenido
 * viejo sin entender por qué.
 */

self.addEventListener("install", (event) => {
  // Entra en vigor sin esperar a que se cierren las pestañas antiguas.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = {};
  }

  const titulo = datos.titulo || "Anime Hub";
  const opciones = {
    body: datos.cuerpo || "Tienes un aviso nuevo.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Con la misma etiqueta, un aviso nuevo sustituye al anterior en vez
    // de apilar diez notificaciones del mismo ticket.
    tag: datos.etiqueta || "anime-hub",
    data: { url: datos.url || "/" },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      // Si la app ya está abierta, se reutiliza esa ventana en vez de
      // abrir una segunda copia.
      for (const ventana of ventanas) {
        if ("focus" in ventana) {
          ventana.navigate(destino);
          return ventana.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
