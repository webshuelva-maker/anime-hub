"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PLATFORM_OPTIONS, CONTENT_FORMAT_OPTIONS } from "@/data/options";
import { Platform, UserPreferences } from "@/types/news";
import { DEFAULT_PREFERENCES, clearPreferences, getPreferences, savePreferences } from "@/lib/storage";
import { SelectableChip } from "./SelectableChip";
import { TagInput } from "./TagInput";
import { TimePicker } from "./TimePicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { DiagnosticoPanel } from "./DiagnosticoPanel";
import { playError, playToggle } from "@/lib/sound";

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

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const handleSave = () => {
    if (!isDirty) return;
    savePreferences(prefs);
    setSavedSnapshot(JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-muted">
            ¿Usas alguna otra que no esté aquí?
          </p>
          <TagInput
            values={prefs.customPlatforms}
            onChange={(customPlatforms) => setPrefs((p) => ({ ...p, customPlatforms }))}
            placeholder="Escribe el nombre y pulsa Añadir"
          />
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

        <motion.button
          type="button"
          onClick={handleSave}
          disabled={!isDirty && !saved}
          whileHover={isDirty ? { scale: 1.03 } : {}}
          whileTap={isDirty ? { scale: 0.95 } : {}}
          className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-colors ${
            saved
              ? "border border-ice/40 text-ice"
              : isDirty
              ? "accent-gradient text-white"
              : "cursor-default border border-panel-border text-muted"
          }`}
        >
          {saved && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          {saved ? "Guardado" : isDirty ? "Guardar cambios" : "Sin cambios"}
        </motion.button>
      </div>

      <div className="rule-line my-8" />

      <h2 className="font-heading text-lg font-semibold">Diagnóstico</h2>
      <p className="mt-1 text-sm text-muted">
        Qué está viendo tu navegador ahora mismo. Útil si algo no se comporta igual en tu ordenador
        que en tu móvil.
      </p>
      <DiagnosticoPanel />

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
