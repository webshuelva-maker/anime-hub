"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { PLATFORM_OPTIONS, CONTENT_FORMAT_OPTIONS } from "@/data/options";
import { Platform, UserPreferences } from "@/types/news";
import { DEFAULT_PREFERENCES, clearPreferences, getPreferences, savePreferences } from "@/lib/storage";
import { SelectableChip } from "./SelectableChip";
import { TimePicker } from "./TimePicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { playError, playToggle, arrancarAmbiente, pararAmbiente, ambienteActivo } from "@/lib/sound";

/**
 * Ajustes de la app. Antes vivía dentro de la página de Afinidad, mezclado
 * con lo que la app ha aprendido de ti y con lo que Ren recuerda — tres
 * cosas distintas en una sola pantalla, y encima con más ajustes en Perfil.
 * Ahora cada pantalla hace una cosa: Afinidad enseña, Ajustes configura,
 * Perfil es quién eres.
 */
export function SettingsEditor() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  // Refleja si el ambiente está sonando AHORA. No va en preferencias: no
  // se guarda entre visitas a propósito.
  // Valor inicial leído del propio motor de sonido: si se vuelve a
  // Ajustes con el ambiente ya sonando, el interruptor lo refleja. Se
  // hace aquí y no en un efecto para no encadenar un redibujado de más.
  const [ambienteEncendido, setAmbienteEncendido] = useState(() => ambienteActivo());

  const [savedSnapshot, setSavedSnapshot] = useState<string>(JSON.stringify(DEFAULT_PREFERENCES));
  const [saved, setSaved] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    const loaded = getPreferences();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loaded);
    setSavedSnapshot(JSON.stringify(loaded));
  }, []);

  const isDirty = JSON.stringify(prefs) !== savedSnapshot;

  /*
   * Guardado automático, igual que en Perfil. Medio segundo desde el
   * último cambio para no escribir en cada pulsación ni mandar diez
   * sincronizaciones seguidas a la nube.
   */
  useEffect(() => {
    if (!isDirty) return;
    const id = setTimeout(() => {
      savePreferences(prefs);
      setSavedSnapshot(JSON.stringify(prefs));
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }, 500);
    return () => clearTimeout(id);
  }, [prefs, isDirty]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];


  const handleReset = () => {
    clearPreferences();
    playError();
    router.push("/onboarding");
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">Ajustes</h1>
      <p className="mt-1 text-sm text-muted">
        Cómo quieres que funcione la app. Nada de esto es obligatorio.
      </p>

      <div className="panel mt-4 rounded-2xl p-6">
        <h3 className="font-heading text-base font-semibold">Plataformas</h3>
        <p className="mt-1 text-sm text-muted">
          Dónde ves anime. Se guarda solo al tocarlas.
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {PLATFORM_OPTIONS.map((platform: Platform) => (
            <SelectableChip
              key={platform}
              label={platform}
              selected={prefs.platforms.includes(platform)}
              onClick={() =>
                setPrefs((p) => ({ ...p, platforms: toggle(p.platforms, platform) }))
              }
            />
          ))}
        </div>
      </div>

      <div className="panel mt-6 rounded-2xl p-6">
        <h3 className="font-heading text-base font-semibold">Formato preferido</h3>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {CONTENT_FORMAT_OPTIONS.map((opt) => (
            <SelectableChip
              key={opt.value}
              label={opt.label}
              selected={prefs.contentFormat === opt.value}
              onClick={() => setPrefs((p) => ({ ...p, contentFormat: opt.value }))}
            />
          ))}
        </div>
      </div>

      <div className="panel mt-6 rounded-2xl p-6">
        <h3 className="font-heading text-base font-semibold">Resumen diario</h3>
        <p className="mt-1 text-sm text-muted">
          Hora aproximada a la que te gustaría recibir el resumen del día (demo visual, aún sin notificaciones reales).
        </p>
        <div className="mt-3">
          <TimePicker
            value={prefs.digestTime}
            onChange={(digestTime) => setPrefs((p) => ({ ...p, digestTime }))}
          />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Modo sin spoilers</p>
            <p className="text-xs text-muted">Oculta detalles de tramas en los resúmenes.</p>
          </div>
          <button
            type="button"
            onClick={() => setPrefs((p) => ({ ...p, spoilerFreeMode: !p.spoilerFreeMode }))}
            className={`h-6 w-11 rounded-full transition-colors ${
              prefs.spoilerFreeMode ? "accent-gradient" : "bg-panel-border"
            }`}
          >
            <motion.span
              className="block h-5 w-5 rounded-full bg-white"
              animate={{ x: prefs.spoilerFreeMode ? 22 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Sonidos de interfaz</p>
            <p className="text-xs text-muted">Clics suaves al pulsar botones, dar &quot;me gusta&quot;, etc.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !prefs.soundEnabled;
              setPrefs((p) => ({ ...p, soundEnabled: next }));
              if (next) playToggle();
            }}
            className={`h-6 w-11 rounded-full transition-colors ${
              prefs.soundEnabled ? "accent-gradient" : "bg-panel-border"
            }`}
          >
            <motion.span
              className="block h-5 w-5 rounded-full bg-white"
              animate={{ x: prefs.soundEnabled ? 22 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
        </div>

        {/*
          Ambiente de fondo, APAGADO por defecto y con su propio
          interruptor.

          Un sonido continuo es lo más fácil de convertir en molestia:
          quien oye un zumbido que no ha pedido silencia la pestaña. Va
          aparte de los sonidos de interfaz porque son cosas distintas —
          hay a quien le gustan los clics y no quiere un fondo sonando—,
          y no se guarda en preferencias a propósito: dura lo que dure la
          visita, para que nadie se encuentre con música al abrir la web.
        */}
        <div className="mt-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Ambiente de fondo</p>
            <p className="text-xs text-muted">
              Un acorde grave y muy flojo mientras navegas. Se apaga al cerrar la página.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (ambienteEncendido) {
                pararAmbiente();
                setAmbienteEncendido(false);
              } else {
                arrancarAmbiente();
                setAmbienteEncendido(true);
              }
              playToggle();
            }}
            aria-pressed={ambienteEncendido}
            className={`h-6 w-11 rounded-full transition-colors ${
              ambienteEncendido ? "accent-gradient" : "bg-panel-border"
            }`}
          >
            <motion.span
              className="block h-5 w-5 rounded-full bg-white"
              animate={{ x: ambienteEncendido ? 22 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
        </div>

        {/*
          Animaciones. Va aquí y no escondido porque para quien tenga
          "Reducir movimiento" activado en su sistema es la diferencia
          entre ver la app entera o verla en corto sin saber por qué.
        */}
        <div className="mt-6 border-t border-panel-border pt-5">
          <p className="text-sm font-medium">Animaciones</p>
          <p className="mt-0.5 text-xs leading-snug text-muted">
            Por defecto se hace caso a lo que pidas en tu sistema operativo. Si tienes activado
            «Reducir movimiento» y aun así quieres verlas aquí, ponlo en completas.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                { valor: "sistema", texto: "Según mi sistema" },
                { valor: "completas", texto: "Completas" },
                { valor: "minimas", texto: "Mínimas" },
              ] as const
            ).map((opcion) => {
              const elegida = (prefs.animaciones ?? "sistema") === opcion.valor;
              return (
                <button
                  key={opcion.valor}
                  type="button"
                  onClick={() => {
                    setPrefs((p) => ({ ...p, animaciones: opcion.valor }));
                    // Se aplica al momento, sin esperar al guardado: si no,
                    // el cambio no se ve hasta recargar y parece que no ha
                    // hecho nada.
                    document.documentElement.setAttribute("data-animaciones", opcion.valor);
                    playToggle();
                  }}
                  className="pulsable rounded-full border px-3.5 py-1.5 text-xs font-medium"
                  style={
                    elegida
                      ? {
                          borderColor: "var(--ice)",
                          color: "var(--ice)",
                          background: "color-mix(in srgb, var(--ice) 12%, transparent)",
                        }
                      : { borderColor: "var(--panel-border)", color: "var(--muted)" }
                  }
                >
                  {opcion.texto}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <motion.button
          type="button"
          onClick={() => setConfirmingReset(true)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className="rounded-full border border-rumor/40 px-4 py-2 text-sm font-medium text-rumor transition-colors hover:bg-rumor/10"
        >
          Borrar todo y empezar de cero
        </motion.button>

        {/* Sin botón de guardar: cada cambio se guarda solo, como en
            Perfil y en los animes favoritos. */}
        <AnimatePresence>
          {saved && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="ice-text self-center text-xs"
            >
              Guardado
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={confirmingReset}
        title="Borrar todo y empezar de cero"
        message="Esto borra tu nombre, avatar, géneros y estudios favoritos, animes favoritos, plataformas, la hora del resumen diario, y todo lo que la app ha aprendido de ti (afinidad, me gusta, historial de búsqueda) — y te lleva de vuelta al onboarding inicial, como si acabaras de entrar por primera vez. No se puede deshacer."
        confirmLabel="Sí, borrar todo"
        onConfirm={handleReset}
        onCancel={() => setConfirmingReset(false)}
      />
    </div>
  );
}
