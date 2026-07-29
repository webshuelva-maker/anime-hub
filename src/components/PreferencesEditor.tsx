"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PLATFORM_OPTIONS, CONTENT_FORMAT_OPTIONS } from "@/data/options";
import { Platform, UserPreferences } from "@/types/news";
import { DEFAULT_PREFERENCES, clearPreferences, getPreferences, savePreferences } from "@/lib/storage";
import { getTopAffinities } from "@/lib/learning";
import { SelectableChip } from "./SelectableChip";
import { TagInput } from "./TagInput";

function AffinityBar({ name, count, max }: { name: string; count: number; max: number }) {
  const pct = Math.max(8, Math.round((count / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-foreground">{name}</span>
        <span className="text-xs text-muted">{count}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-border/60">
        <div className="accent-gradient h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PreferencesEditor() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(getPreferences());
  }, []);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const handleSave = () => {
    savePreferences(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    clearPreferences();
    router.push("/onboarding");
  };

  const topGenres = getTopAffinities(prefs.genreInteractionCounts, 5);
  const topStudios = getTopAffinities(prefs.studioInteractionCounts, 5);
  const maxCount = Math.max(1, ...topGenres.map((g) => g.count), ...topStudios.map((s) => s.count));
  const hasLearned = topGenres.length > 0 || topStudios.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">Afinidad</h1>
      <p className="mt-1 text-sm text-muted">
        Se construye sola, con lo que lees y con lo que marcas con <span className="ice-text">♡</span> en el feed.
      </p>

      <div className="panel mt-8 rounded-2xl p-6">
        {!hasLearned ? (
          <p className="text-sm text-muted">
            Todavía no hay datos. Dale <span className="ice-text">♡</span> a alguna noticia en el feed y esto se irá rellenando.
          </p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2">
            {topGenres.length > 0 && (
              <div>
                <h2 className="font-heading mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                  Géneros
                </h2>
                <div className="flex flex-col gap-3">
                  {topGenres.map((g) => (
                    <motion.div
                      key={g.name}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <AffinityBar name={g.name} count={g.count} max={maxCount} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            {topStudios.length > 0 && (
              <div>
                <h2 className="font-heading mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                  Estudios
                </h2>
                <div className="flex flex-col gap-3">
                  {topStudios.map((s) => (
                    <motion.div
                      key={s.name}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <AffinityBar name={s.name} count={s.count} max={maxCount} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rule-line my-8" />

      <h2 className="font-heading text-lg font-semibold">Ajustes</h2>
      <p className="mt-1 text-sm text-muted">Opcionales — no hacen falta para usar la app.</p>

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
        <input
          type="time"
          value={prefs.digestTime}
          onChange={(e) => setPrefs((p) => ({ ...p, digestTime: e.target.value }))}
          className="panel-elevated mt-3 rounded-lg px-3 py-2 text-sm text-foreground outline-none"
        />

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
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleReset}
          className="text-sm font-medium text-muted transition-colors hover:text-accent"
        >
          Borrar todo y empezar de cero
        </button>

        <motion.button
          type="button"
          onClick={handleSave}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
          className="accent-gradient rounded-full px-6 py-2.5 text-sm font-semibold text-white"
        >
          {saved ? "Guardado ✓" : "Guardar cambios"}
        </motion.button>
      </div>
    </div>
  );
}
