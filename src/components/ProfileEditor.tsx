"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PREFERENCES, getPreferences, savePreferences } from "@/lib/storage";
import { UserPreferences } from "@/types/news";
import { AVATAR_OPTIONS } from "@/data/options";
import { AvatarPicker, Avatar, PhotoUploadButton } from "./AvatarPicker";
import { TagInput } from "./TagInput";
import { Toast } from "./Toast";
import { clearRenMemory } from "@/lib/renMemory";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface AccountProfile {
  email: string | null;
  isPremium: boolean;
}

export function ProfileEditor() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(JSON.stringify(DEFAULT_PREFERENCES));
  const [saved, setSaved] = useState(false);
  const [account, setAccount] = useState<AccountProfile | null | "loading">(() =>
    process.env.NEXT_PUBLIC_SUPABASE_URL ? "loading" : null
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const loaded = getPreferences();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loaded);
    setSavedSnapshot(JSON.stringify(loaded));
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setAccount(null);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("id", data.user.id)
        .single();
      setAccount({ email: data.user.email ?? null, isPremium: profile?.is_premium ?? false });
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setAccount(null);
    setToast("Sesión cerrada.");
    setTimeout(() => setToast(null), 2000);
  };

  const isDirty = JSON.stringify(prefs) !== savedSnapshot;

  const handleSave = () => {
    if (!isDirty) return;
    savePreferences(prefs);
    setSavedSnapshot(JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handlePremiumClick = () => {
    setToast("Próximamente: implementaremos los pagos en cuanto conectemos un backend real. ¡Gracias por tu paciencia!");
    setTimeout(() => setToast(null), 3500);
  };

  const handleClearRenMemory = () => {
    clearRenMemory();
    setToast("Memoria de Ren borrada.");
    setTimeout(() => setToast(null), 2500);
  };

  const currentMeaning = AVATAR_OPTIONS.find((a) => a.id === prefs.avatarId)?.meaning;

  const stats = [
    { label: "Géneros seguidos", value: prefs.genres.length },
    { label: "Estudios seguidos", value: prefs.studios.length },
    { label: "Plataformas", value: prefs.platforms.length + prefs.customPlatforms.length },
    { label: "Animes favoritos", value: prefs.favoriteTitles.length },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 ">
      {/* Cabecera de perfil: banner con textura + avatar circular flotando sobre la costura */}
      <div className="panel overflow-hidden rounded-2xl pt-12 text-center">
        <div className="relative mx-auto -mb-2 w-fit">
          <div className="relative rounded-full p-[3px]" style={{ background: "linear-gradient(135deg, var(--ice), var(--accent-from))" }}>
            <div className="rounded-full bg-background p-1">
              <Avatar
                avatarId={prefs.avatarId}
                photoDataUrl={prefs.avatarPhotoDataUrl}
                size="xl"
                rounded="full"
              />
            </div>
            <PhotoUploadButton
              variant="badge"
              onSelect={(dataUrl) =>
                setPrefs((p) => ({ ...p, avatarPhotoDataUrl: dataUrl }))
              }
            />
          </div>
        </div>

        <div className="px-6 pb-8 pt-4">
          <input
            type="text"
            value={prefs.displayName}
            maxLength={24}
            onChange={(e) => setPrefs((p) => ({ ...p, displayName: e.target.value }))}
            placeholder="Tu nombre"
            className="font-heading w-full bg-transparent text-center text-2xl font-semibold text-foreground outline-none placeholder:text-muted"
          />
          {!prefs.avatarPhotoDataUrl && currentMeaning && (
            <p className="mt-1 text-sm text-muted">emblema · {currentMeaning}</p>
          )}
          {prefs.avatarPhotoDataUrl && (
            <button
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, avatarPhotoDataUrl: null }))}
              className="mt-1 text-xs font-medium text-muted transition-colors hover:text-accent"
            >
              Quitar foto y volver al emblema
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 ">
        {stats.map((s) => (
          <div key={s.label} className="panel rounded-xl p-4 text-center card-hover">
            <p className="font-heading accent-gradient-text text-2xl font-bold">{s.value}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-6 rounded-2xl p-6">
        <h2 className="font-heading text-lg font-semibold">Emblema</h2>
        <p className="mt-1 text-sm text-muted">
          Cada emblema tiene un significado en japonés. Pulsa el icono de cámara sobre tu avatar para subir una foto en su lugar.
        </p>
        <div className="mt-4">
          <AvatarPicker
            selectedId={prefs.avatarId}
            onSelect={(avatarId) => setPrefs((p) => ({ ...p, avatarId, avatarPhotoDataUrl: null }))}
          />
        </div>
      </div>

      <div className="panel mt-6 rounded-2xl p-6">
        <h2 className="font-heading text-lg font-semibold">Animes favoritos</h2>
        <p className="mt-1 text-sm text-muted">
          Te priorizamos noticias sobre estos títulos en tu feed.
        </p>
        <div className="mt-3">
          <TagInput
            values={prefs.favoriteTitles}
            onChange={(favoriteTitles) => setPrefs((p) => ({ ...p, favoriteTitles }))}
            placeholder="Ej: One Piece"
          />
        </div>
      </div>

      <div className="panel mt-6 rounded-2xl p-6">
        <h2 className="font-heading text-lg font-semibold">Cuenta</h2>
        <p className="mt-1 text-sm text-muted">
          De momento tu perfil vive solo en este navegador (sin servidor todavía),
          así que no hay usuario y contraseña reales — sería una seguridad falsa.
          En cuanto conectemos un backend, aquí mismo añadiremos inicio de sesión de verdad.
        </p>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty && !saved}
          className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all ${
            saved
              ? "border border-ice/40 text-ice"
              : isDirty
              ? "accent-gradient text-white hover:scale-[1.03] active:scale-95"
              : "cursor-default border border-panel-border text-muted"
          }`}
        >
          {saved && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          {saved ? "Guardado" : isDirty ? "Guardar cambios" : "Sin cambios"}
        </button>
      </div>

      <div className="panel-elevated mt-10 rounded-2xl border border-panel-border p-6">
        <h2 className="font-heading text-lg font-semibold">Cuenta</h2>
        {account === "loading" && <p className="mt-2 text-sm text-muted">Comprobando…</p>}
        {account === null && (
          <>
            <p className="mt-1 max-w-md text-sm text-muted">
              Todavía no has iniciado sesión — tu perfil solo se guarda en este navegador. Crea una cuenta para
              guardarlo en la nube y, más adelante, activar premium.
            </p>
            <Link
              href="/login"
              className="accent-gradient mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
            >
              Iniciar sesión / Crear cuenta
            </Link>
          </>
        )}
        {account && account !== "loading" && (
          <>
            <p className="mt-1 text-sm text-muted">
              Conectado como <span className="text-foreground">{account.email}</span> ·{" "}
              {account.isPremium ? "Premium activo" : "Plan gratuito"}
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
            >
              Cerrar sesión
            </button>
          </>
        )}
      </div>

      <div className="panel-elevated mt-10 rounded-2xl border border-panel-border p-6">
        <h2 className="font-heading text-lg font-semibold">Privacidad</h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          Ren recuerda cosas de tus conversaciones (gustos, cómo prefieres que te trate) en este navegador. Puedes
          borrar esa memoria cuando quieras, sin que afecte al resto de tu perfil.
        </p>
        <button
          type="button"
          onClick={handleClearRenMemory}
          className="mt-4 rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
        >
          Borrar memoria de Ren
        </button>
      </div>

      <div className="panel-elevated relative mt-10 overflow-hidden rounded-2xl border border-ice/25 p-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <span className="inline-block rounded-full bg-ice px-3 py-1 text-xs font-bold text-black">
              PREMIUM
            </span>
            <h2 className="font-heading mt-3 text-lg font-semibold">
              Desbloquea la experiencia completa
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              Feed sin límites, alertas instantáneas, asistente de IA personal y
              emblemas exclusivos. Próximamente, desde 0,99 €/mes.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePremiumClick}
            className="whitespace-nowrap rounded-full border border-ice/40 px-5 py-2.5 text-sm font-semibold text-ice transition-colors hover:bg-ice/10"
          >
            Próximamente
          </button>
        </div>
      </div>

      <Toast message={toast} />
    </div>
  );
}
