"use client";

import { marcarCargaEnCurso, marcarCargaTerminada } from "@/lib/arranque";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ANIME_TRIVIA } from "@/lib/trivia";
import { getPreferences } from "@/lib/storage";
import { runExclusive, waitForTokenBudget, recordTokenUsage } from "@/lib/apiQueue";
import { siteConfig } from "@/config/site";
import { BrandMark } from "./BrandMark";

const ROTATE_MS = 4500;
const REFILL_THRESHOLD = 5; // cuando queden menos de esto sin ver, se pide otro lote
const SHOWN_KEY = "anime-hub:trivia-shown";
const MAX_SHOWN_REMEMBERED = 600;

/*
 * Curiosidades de la espera. Dos fuentes, en este orden:
 *
 * 1. Una lista escrita a mano y comprobada (src/lib/trivia.ts, 100).
 * 2. Lotes generados con IA, que se van pidiendo a medida que se agotan.
 *
 * Por qué las dos y en ese orden: la lista de mano nunca miente pero se
 * acaba, y repetir curiosidades en la primera pantalla de la app queda
 * cutre. La IA no se acaba nunca, pero se inventa cosas — llegó a decir
 * que "el anime más largo en emisión lleva más de 900 episodios" (falso:
 * Sazae-san pasa de 8.000). Así que se empieza por las seguras, y la IA
 * solo entra cuando ya no quedan.
 *
 * TODO lo que se ha enseñado alguna vez se guarda en localStorage y se le
 * manda a la IA como lista de exclusión, así que no repite ni entre
 * sesiones. Antes solo se mandaban las últimas 60 y por eso volvían.
 */

function loadShown(): string[] {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveShown(facts: string[]) {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(facts.slice(-MAX_SHOWN_REMEMBERED)));
  } catch {
    // localStorage lleno o bloqueado: se pierde la memoria entre sesiones, nada más
  }
}

function barajar<T>(arr: T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Pantalla de carga a pantalla completa — SOLO en la primera visita real
 * (sin nada en caché todavía). Iteración 4: la barra respeta SIEMPRE el
 * tiempo mínimo calculado (estimatedDurationMs, lo pasa NewsFeed según
 * cuánto hay que traducir) para ir de 0 a 100 — si el trabajo real
 * termina antes, la barra NO se acelera ni salta, sigue su ritmo normal
 * (antes hacía eso, y si la traducción iba rápida la pantalla
 * desaparecía casi al instante, sin dar tiempo ni a ver el botón de
 * omitir). Si el trabajo real tarda más de lo estimado, sigue
 * acercándose al 99% sin quedarse nunca clavada. Solo llega a 100 (y
 * cierra, vía onComplete) cuando se cumplen LAS DOS cosas: ya pasó el
 * tiempo mínimo Y el trabajo real terminó de verdad.
 */
export function FirstLoadOverlay({
  progress,
  estimatedDurationMs,
  onComplete,
}: {
  progress: number;
  estimatedDurationMs: number;
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [fact, setFact] = useState<string>("");

  // Pendientes por enseñar en esta sesión. Se rellena con lo que quede de
  // la lista verificada y, cuando se agota, con lotes de la IA.
  const pendientesRef = useRef<string[]>([]);
  const vistasRef = useRef<string[]>([]);
  const pidiendoRef = useRef(false);

  const pedirLote = async () => {
    if (pidiendoRef.current) return;
    pidiendoRef.current = true;
    try {
      const prefs = getPreferences();
      const estimatedTokens = 1200;
      const data: { facts?: string[] } = await runExclusive(async () => {
        await waitForTokenBudget(estimatedTokens, "normal");
        const res = await fetch("/api/trivia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Se manda TODO el historial, no solo lo último: es lo que
            // evita que vuelvan curiosidades de sesiones anteriores.
            exclude: vistasRef.current,
            genres: prefs.genres,
            favoriteTitles: prefs.favoriteTitles,
          }),
        });
        const json = await res.json();
        recordTokenUsage(estimatedTokens);
        return json;
      }, "normal");

      if (data.facts?.length) {
        // Filtro de seguridad por si el modelo repite algo pese a la
        // lista de exclusión: no se fía, se comprueba aquí también.
        const nuevas = data.facts.filter((f) => f && !vistasRef.current.includes(f));
        pendientesRef.current.push(...nuevas);
      }
    } catch {
      // Si falla, se sigue con lo que haya pendiente; la pantalla nunca
      // se bloquea por esto.
    } finally {
      pidiendoRef.current = false;
    }
  };

  /** Saca la siguiente sin repetir y pide más si quedan pocas. */
  const siguiente = (): string => {
    const proxima = pendientesRef.current.shift();
    if (pendientesRef.current.length <= REFILL_THRESHOLD) void pedirLote();
    if (!proxima) return "";
    vistasRef.current.push(proxima);
    saveShown(vistasRef.current);
    return proxima;
  };

  useEffect(() => {
    // Mientras la pantalla de carga está puesta, el fondo no se mueve.
    // Si no, se podía desplazar el feed por detrás y verlo asomar.
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
      // Devuelve la barra superior y el orbe, que el script del layout
      // había escondido antes del primer pintado.
      document.documentElement.classList.remove("arrancando");
    };
  }, []);

  useEffect(() => {
    vistasRef.current = loadShown();
    // Las verificadas que esta persona todavía no ha visto van primero.
    pendientesRef.current = barajar(ANIME_TRIVIA.filter((f) => !vistasRef.current.includes(f)));
    // Si ya las ha visto todas, hace falta pedir a la IA desde el principio.
    if (pendientesRef.current.length <= REFILL_THRESHOLD) void pedirLote();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFact(siguiente());
    const timer = setInterval(() => {
      const proxima = siguiente();
      // Si el lote todavía no ha llegado, se deja la anterior en pantalla
      // en vez de dejarlo en blanco.
      if (proxima) {
        setFact(proxima);
        setIndex((i) => i + 1);
      }
    }, ROTATE_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contador animado dirigido por TIEMPO ESTIMADO, no por los saltos
  // discretos de "progress" (que solo cambia cuando un lote entero
  // termina, ej. de 33% a 67% de golpe). Se acerca al 99% de forma
  // asintótica durante estimatedDurationMs — nunca lo alcanza del todo
  // por sí solo, así que si el trabajo real tarda más de lo estimado, la
  // barra sigue viéndose avanzar (cada vez más despacio) en vez de
  // quedarse clavada esperando. En cuanto progress llega a 1 (traducción
  // real terminada), el objetivo pasa a ser 100 de verdad, y al
  // alcanzarlo se avisa a NewsFeed (onComplete) para cerrar la pantalla
  // — el cierre queda así atado al contador, nunca antes.
  const [displayPct, setDisplayPct] = useState(0);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  /*
   * Cerrar la pantalla de carga.
   *
   * Lo importante es el ORDEN. La marca "arrancando" mantiene escondidos
   * la barra superior, el orbe y el pie, y además pinta una manta opaca
   * por debajo de esta pantalla. Antes esa marca se retiraba al
   * desmontar el componente, o sea DESPUÉS del medio segundo de fundido:
   * así que lo que se veía era esta pantalla disolviéndose sobre un
   * fondo negro vacío, y al terminar, la app entera apareciendo de golpe.
   * Ese salto brusco es justo lo que se notaba al pulsar "Omitir" y al
   * llegar al 100%.
   *
   * Ahora la marca se quita ANTES de empezar el fundido. La app ya está
   * pintada debajo (invisible tras esta pantalla, que sigue opaca), así
   * que el fundido la va descubriendo: una transición de verdad en vez
   * de un corte.
   */
  const onCompleteRef = useRef(onComplete);

  const cerrar = useCallback(() => {
    document.documentElement.classList.remove("arrancando");
    // Avisa a quien espere a que la app esté lista: por ejemplo las
    // llamadas, que no deben entrar encima de esta pantalla.
    marcarCargaTerminada();
    onCompleteRef.current();
  }, []);

  // La cuenta atrás de la barra vive en un efecto sin dependencias, así
  // que necesita la función por referencia para no quedarse con una
  // versión vieja.
  const cerrarRef = useRef(cerrar);
  useEffect(() => {
    cerrarRef.current = cerrar;
  }, [cerrar]);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let raf: number;
    let finished = false;
    const startTime = performance.now();
    const tick = (now: number) => {
      if (finished) return;
      const elapsed = now - startTime;
      const t = elapsed / estimatedDurationMs;
      const done = progressRef.current >= 1;
      const minTimeElapsed = t >= 1;

      let value: number;
      if (done && minTimeElapsed) {
        // Las dos condiciones cumplidas: trabajo real terminado Y ya ha
        // pasado el tiempo mínimo calculado — ahora sí, a 100 y se cierra.
        value = 100;
      } else if (t <= 1) {
        // Fase normal: curva de frenado suave hacia 99%, ritmo fijado
        // por el tiempo estimado — NUNCA se acelera solo porque el
        // trabajo real ya haya terminado (eso es justo lo que hacía que
        // la pantalla desapareciera de golpe sin llegar a enseñar nada,
        // ni el botón de omitir, si la traducción iba rápida).
        value = 99 * (1 - Math.pow(1 - t, 2));
      } else {
        // Se pasó del tiempo estimado y el trabajo real AÚN no ha
        // terminado — sigue acercándose muy despacio a ~99.7% en vez de
        // quedarse clavada esperando.
        const overtime = elapsed - estimatedDurationMs;
        value = 99 + 0.7 * (1 - Math.exp(-overtime / 4000));
      }

      setDisplayPct((prev) => (value > prev ? value : prev));
      if (value >= 100) {
        finished = true;
        cerrarRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Solo se reinicia si cambia la duración estimada (ej. porque llegó
    // más trabajo a traducir) — nunca por progress, que se lee siempre
    // fresco vía la ref de arriba.
  }, [estimatedDurationMs]);

  const pct = Math.round(displayPct);

  // En vez de un foco de luz suelto seguiendo al cursor 1:1 (se sentía
  // como "arrastrar un círculo por la pantalla", repetitivo) — un
  // paralaje sutil: los DOS resplandores que ya respiran solos también
  // se desplazan un poco según dónde esté el ratón, en direcciones
  // opuestas entre sí, dando sensación de profundidad/reacción real de
  // la escena en vez de un elemento nuevo pegado al puntero.
  const glow1WrapRef = useRef<HTMLDivElement>(null);
  const glow2WrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const relX = e.clientX / window.innerWidth - 0.5; // -0.5 a 0.5
      const relY = e.clientY / window.innerHeight - 0.5;
      if (glow1WrapRef.current) {
        glow1WrapRef.current.style.transform = `translate(${relX * 50}px, ${relY * 35}px)`;
      }
      if (glow2WrapRef.current) {
        glow2WrapRef.current.style.transform = `translate(${relX * -40}px, ${relY * -30}px)`;
      }
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  const [skipHovered, setSkipHovered] = useState(false);

  // Se avisa de que hay carga en curso en cuanto se monta, para que quien
  // espere sepa que efectivamente hay algo por lo que esperar.
  useEffect(() => {
    marcarCargaEnCurso();
  }, []);

  return (
    <motion.div
      // 100dvh (no 100vh) y respeto del área segura: en el móvil la barra
      // del navegador se come la parte de abajo de 100vh, y por eso el
      // botón de omitir quedaba fuera de la pantalla.
      style={{ height: "100dvh", background: "var(--background)" }}
      className="fixed inset-x-0 top-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 text-center"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // Un pelín más largo y con salida suave: ahora que el fundido
      // descubre la app de verdad (y no un fondo negro), merece la pena
      // que se vea.
      transition={{ duration: 0.6, ease: "easeInOut" }}
    >
      {/* Resplandores ambientales — respiran solos (opacidad + deriva
          propia vía framer-motion) Y además reaccionan al ratón (el
          div contenedor de fuera, movido directamente por ref para que
          vaya fino a 60fps sin generar un render por cada movimiento). */}
      <div ref={glow1WrapRef} className="pointer-events-none absolute -left-32 top-1/3">
        <motion.div
          aria-hidden
          className="h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, var(--ice) 0%, transparent 70%)", filter: "blur(60px)" }}
          animate={{ opacity: [0.08, 0.2, 0.08], x: [0, 30, -10, 0], y: [0, -20, 15, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <div ref={glow2WrapRef} className="pointer-events-none absolute -right-32 bottom-1/3">
        <motion.div
          aria-hidden
          className="h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, var(--accent-from) 0%, transparent 70%)", filter: "blur(60px)" }}
          animate={{ opacity: [0.06, 0.18, 0.06], x: [0, -25, 15, 0], y: [0, 20, -15, 0] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        />
      </div>

      {/* Estos cuatro elementos se animan con CSS (clases boot-*) y no con
          framer-motion. Con framer empezaban invisibles y solo aparecían
          al hidratar React, así que durante dos décimas esta pantalla se
          veía vacía y parecía otra pantalla distinta. Con CSS la
          animación arranca en el primer fotograma. */}
      <span className="boot-mark mb-4 ice-text">
        <BrandMark size={26} />
      </span>

      <p className="boot-in font-heading text-lg tracking-[0.15em] text-foreground/90">
        {siteConfig.name}
      </p>
      <p className="boot-in-delay-1 mt-1 text-xs uppercase tracking-[0.2em] text-muted">
        Preparando tu feed
      </p>

      {/* Barra de progreso real, crece desde el centro hacia los lados.
          El ancho sigue a "pct" (el contador animado de arriba, no el
          dato en crudo) — así avanza número a número de forma continua
          en vez de saltar directamente al siguiente valor real. */}
      <div
        className="boot-in-delay-2 relative mt-8 h-[3px] w-56 overflow-hidden rounded-full"
        style={{ background: "var(--panel-border)" }}
      >
        <motion.div
          className="absolute inset-y-0 left-1/2 overflow-hidden rounded-full"
          style={{ background: "linear-gradient(90deg, var(--accent-from), var(--ice))", x: "-50%", width: `${pct}%` }}
        >
          {/* Destello que recorre lo ya rellenado: da sensación de que
              sigue trabajando aunque el porcentaje tarde en subir. */}
          <motion.div
            aria-hidden
            className="absolute inset-y-0 w-16"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)" }}
            animate={{ x: ["-4rem", "16rem"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.4 }}
          />
        </motion.div>
      </div>
      <p className="boot-pct mt-2 text-[11px] tabular-nums text-muted">{pct}%</p>

      <div className="mt-8 h-20 w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
            className="text-[15px] leading-relaxed text-foreground/85"
          >
            {fact}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Botón de omitir: aparece una vez hay avance real de sobra (35%)
          — para entonces lo esencial ya suele estar listo. Deja entrar
          ya, con lo que haya; seguir esperando trae más noticias y ya
          ordenadas de una sentada. (El texto decía "traducidas", de
          cuando las fuentes eran inglesas: desde que los medios son
          españoles no se traduce nada aquí.) La explicación solo
          aparece al pasar el ratón, como una etiqueta flotante — así no
          hay texto pequeño permanente compitiendo con el resto. */}
      <AnimatePresence>
        {pct >= 35 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            /*
              En móvil va en el flujo normal, debajo del contenido; en
              pantalla grande, flotando abajo a la derecha.
              
              Estaba siempre colocado por posición absoluta contra el
              borde inferior, y en móvil acababa fuera de la vista: entre
              el área segura del teléfono, la barra del navegador y la
              barra inferior de la app, ese borde no es donde uno cree.
              En el flujo normal no puede pasar: si el contenido cabe, el
              botón cabe.
            */
            /*
              Abajo a la derecha en todas las pantallas.
              
              Antes se salía de la vista en móvil, y al meterlo en el
              flujo normal acabó en el centro, que tampoco es su sitio.
              Vuelve a ir posicionado, pero con dos cambios que son los
              que arreglan lo de que se saliera: el hueco de abajo se
              calcula con max() en vez de sumando —sumar el área segura a
              1,5rem lo empujaba de más en los teléfonos que la
              declaran— y la caja se ancla también por la derecha, para
              que el texto de ayuda no la estire hacia fuera.
            */
            style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            className="absolute right-4 flex max-w-[70vw] flex-col items-end gap-2 sm:right-6 sm:max-w-none"
            onMouseEnter={() => setSkipHovered(true)}
            onMouseLeave={() => setSkipHovered(false)}
          >
            <AnimatePresence>
              {skipHovered && (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.25 }}
                  className="hidden max-w-[190px] rounded-lg border border-panel-border bg-panel px-3 py-2 text-right text-[11px] leading-snug text-muted shadow-lg sm:block"
                >
                  Esperar un poco más trae más noticias, y ya ordenadas según tus gustos
                </motion.span>
              )}
            </AnimatePresence>
            <motion.button
              type="button"
              onClick={cerrar}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="rounded-full border border-panel-border bg-panel px-4 py-2 text-xs font-medium text-foreground/90 hover:border-ice/40 hover:text-foreground"
            >
              Omitir →
            </motion.button>

            {/* En móvil no hay ratón, así que la explicación no puede
                depender de pasar por encima: se enseña siempre, debajo del
                botón y alineada con él. */}
            <p className="text-right text-[11px] leading-snug text-muted sm:hidden">
              Puedes entrar ya
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
