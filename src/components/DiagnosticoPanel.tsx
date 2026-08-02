"use client";

import { useEffect, useState } from "react";

/**
 * Panel de diagnóstico.
 *
 * Existe porque varios fallos ("en el ordenador no se ve la animación",
 * "no encuentra ningún anime") solo se daban en un equipo concreto, y
 * desde fuera no había forma de saber por qué. En vez de seguir
 * cambiando cosas a ciegas, esta pantalla dice qué está viendo el
 * navegador de verdad.
 *
 * Lo más importante es la primera línea: si el sistema tiene activado
 * "Reducir movimiento", el navegador desactiva las animaciones de la
 * página entera. Eso explica por sí solo que en un móvil se vean y en un
 * ordenador no, sin que haya ningún fallo en el código.
 */
export function DiagnosticoPanel() {
  const [datos, setDatos] = useState<{ etiqueta: string; valor: string }[]>([]);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    // En un temporizador a cero: leer estas medidas y guardarlas en el
    // mismo paso del efecto encadena renderizados y el linter lo marca.
    const id = setTimeout(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tactil = window.matchMedia("(pointer: coarse)").matches;
    let cache = "no";
    try {
      cache = sessionStorage.getItem("anime-hub:news-cache") ? "sí" : "no";
    } catch {
      cache = "no accesible";
    }

    setDatos([
      { etiqueta: "Reducir movimiento (sistema)", valor: reduce ? "ACTIVADO" : "desactivado" },
      { etiqueta: "Pantalla", valor: `${window.innerWidth} × ${window.innerHeight}` },
      { etiqueta: "Entrada", valor: tactil ? "táctil" : "ratón" },
      { etiqueta: "Noticias en caché de sesión", valor: cache },
      { etiqueta: "Modo instalado (app)", valor: window.matchMedia("(display-mode: standalone)").matches ? "sí" : "no" },
    ]);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const probarBuscador = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const res = await fetch("/api/anime-search?q=mushoku");
      const data = (await res.json()) as { results?: unknown[]; fuente?: string; debug?: string };
      setPrueba(
        `${data.results?.length ?? 0} resultado(s) · fuentes: ${data.fuente ?? "?"}\n${data.debug ?? ""}`
      );
    } catch (e) {
      setPrueba(`Error de red: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProbando(false);
    }
  };

  const reduceActivado = datos.some(
    (d) => d.etiqueta.startsWith("Reducir movimiento") && d.valor === "ACTIVADO"
  );

  return (
    <div className="panel mt-4 rounded-2xl p-6">
      <dl className="flex flex-col gap-2">
        {datos.map((d) => (
          <div key={d.etiqueta} className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="text-muted">{d.etiqueta}</dt>
            <dd className={d.valor === "ACTIVADO" ? "text-rumor" : "text-foreground"}>{d.valor}</dd>
          </div>
        ))}
      </dl>

      {reduceActivado && (
        <p className="mt-4 rounded-xl border border-rumor/30 bg-rumor/5 p-3 text-xs leading-relaxed text-foreground/90">
          Tu sistema tiene activado <strong>&laquo;Reducir movimiento&raquo;</strong>. El navegador
          desactiva las animaciones de cualquier web, así que la entrada de la app y las barras de
          Tus gustos aparecerán directamente en su estado final. No es un fallo de la app. En Windows
          se cambia en Configuración → Accesibilidad → Efectos visuales → Efectos de animación.
        </p>
      )}

      <button
        type="button"
        onClick={probarBuscador}
        disabled={probando}
        className="mt-5 rounded-full border border-panel-border px-4 py-2 text-sm text-muted transition-colors hover:border-ice/40 hover:text-foreground disabled:opacity-50"
      >
        {probando ? "Probando…" : "Probar el buscador de animes"}
      </button>

      {prueba && (
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-panel-border/70 bg-panel-soft/40 p-3 text-[11px] leading-snug text-muted">
          {prueba}
        </pre>
      )}
    </div>
  );
}
