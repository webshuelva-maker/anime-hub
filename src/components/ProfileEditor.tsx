"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_PREFERENCES, getPreferences, savePreferences } from "@/lib/storage";
import { UserPreferences } from "@/types/news";
import { AVATAR_OPTIONS } from "@/data/options";
import { AvatarPicker, Avatar, PhotoUploadButton } from "./AvatarPicker";
import { FavoriteAnimeInput } from "./FavoriteAnimeInput";
import { Toast } from "./Toast";
import { clearRenMemory } from "@/lib/renMemory";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { playSuccess, playToggle } from "@/lib/sound";

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

  // Antes se podía cambiar el email o la contraseña sin verificar nada —
  // si alguien conseguía entrar en una sesión ya abierta (por ejemplo un
  // ordenador compartido con la sesión iniciada), podía secuestrar la
  // cuenta cambiando la contraseña sin más. Ahora las dos acciones piden
  // primero la contraseña ACTUAL, y se comprueba de verdad volviendo a
  // iniciar sesión con ella antes de aplicar el cambio.
  const [currentPassword, setCurrentPassword] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const verifyCurrentPassword = async (): Promise<boolean> => {
    if (!currentPassword) {
      setEmailStatus("Escribe tu contraseña actual para confirmar el cambio.");
      setPasswordStatus("Escribe tu contraseña actual para confirmar el cambio.");
      return false;
    }
    if (!account || account === "loading" || !account.email) return false;
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: account.email, password: currentPassword });
    if (error) {
      setEmailStatus("Contraseña actual incorrecta.");
      setPasswordStatus("Contraseña actual incorrecta.");
      return false;
    }
    return true;
  };

  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return;
    if (!(await verifyCurrentPassword())) return;
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailStatus(
      error
        ? `No se pudo cambiar: ${error.message}`
        : "Te hemos mandado un enlace de confirmación a la nueva dirección — ábrelo para que se aplique el cambio."
    );
    if (!error) setCurrentPassword("");
  };

  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordStatus("Mínimo 6 caracteres.");
      return;
    }
    if (!(await verifyCurrentPassword())) return;
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordStatus(error ? `No se pudo cambiar: ${error.message}` : "Contraseña actualizada.");
    if (!error) {
      setNewPassword("");
      setCurrentPassword("");
    }
  };

  const isDirty = JSON.stringify(prefs) !== savedSnapshot;

  const handleSave = () => {
    if (!isDirty) return;

    // Los favoritos se guardan solos desde su propio componente, así que
    // se releen justo antes de guardar: si no, este guardado escribiría
    // la lista vieja que tenía en memoria y desharía lo recién añadido.
    savePreferences({ ...prefs, favoriteTitles: getPreferences().favoriteTitles });
    setSavedSnapshot(JSON.stringify(prefs));
    setSaved(true);
    playSuccess();
    setTimeout(() => setSaved(false), 2000);

    // Si hay sesión, el nombre también se guarda en el perfil de la
    // nube (antes solo quedaba en este navegador, aunque ya tuviera
    // cuenta creada).
    if (account && account !== "loading") {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          supabase.from("profiles").update({ display_name: prefs.displayName }).eq("id", data.user.id);
        }
      });
    }
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

        <div className="px-6 pb-8 pt-4 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Tu nombre (editable)</p>
          <div className="mt-1 inline-flex items-center gap-1.5 border-b border-dashed border-panel-border pb-1 transition-colors focus-within:border-ice/50">
            <input
              type="text"
              value={prefs.displayName}
              maxLength={24}
              onChange={(e) => setPrefs((p) => ({ ...p, displayName: e.target.value }))}
              placeholder="Tu nombre"
              className="font-heading bg-transparent text-center text-2xl font-semibold text-foreground outline-none placeholder:text-muted"
              style={{ width: `${Math.max(4, (prefs.displayName || "Tu nombre").length)}ch` }}
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted">
              <path d="m18 2 4 4-12 12H6v-4L18 2Z" />
            </svg>
          </div>
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
          Sus noticias te salen las primeras. Se guarda solo, no hace falta confirmar nada.
        </p>
        <div className="mt-3">
          <FavoriteAnimeInput />
        </div>
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
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-panel-soft text-ice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" strokeLinecap="round" />
            </svg>
          </span>
          <h2 className="font-heading text-lg font-semibold">Cuenta</h2>
        </div>
        {account === "loading" && <p className="mt-2 text-sm text-muted">Comprobando…</p>}
        {account === null && (
          <>
            <p className="mt-1 max-w-md text-sm text-muted">
              Todavía no has iniciado sesión — tu perfil solo se guarda en este navegador. Crea una cuenta para
              guardarlo en la nube y, más adelante, activar premium.
            </p>
            <motion.div className="mt-4 inline-block" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
              <Link
                href="/login"
                className="accent-gradient inline-block rounded-full px-5 py-2 text-sm font-semibold text-white"
              >
                Iniciar sesión / Crear cuenta
              </Link>
            </motion.div>
          </>
        )}
        {account && account !== "loading" && (
          <>
            <p className="mt-1 text-sm text-muted">
              Conectado como <span className="text-foreground">{account.email}</span> ·{" "}
              {account.isPremium ? "Premium activo" : "Plan gratuito"}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <motion.button
                type="button"
                onClick={() => {
                  setShowEmailForm((v) => !v);
                  setShowPasswordForm(false);
                  playToggle();
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
              >
                Cambiar email
              </motion.button>
              <motion.button
                type="button"
                onClick={() => {
                  setShowPasswordForm((v) => !v);
                  setShowEmailForm(false);
                  playToggle();
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
              >
                Cambiar contraseña
              </motion.button>
            </div>

            <AnimatePresence>
              {showEmailForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-xl border border-panel-border bg-panel-soft/40 p-4">
                    <label className="mb-1 block text-xs font-medium text-muted">Nuevo email</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder={account.email ?? ""}
                      className="w-full rounded-lg border border-panel-border bg-panel-soft px-3 py-2 text-sm outline-none focus:border-ice/50"
                    />
                    <label className="mb-1 mt-3 block text-xs font-medium text-muted">Confirma tu contraseña actual</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Tu contraseña actual"
                      className="w-full rounded-lg border border-panel-border bg-panel-soft px-3 py-2 text-sm outline-none focus:border-ice/50"
                    />
                    <motion.button
                      type="button"
                      onClick={handleChangeEmail}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 400, damping: 22 }}
                      className="accent-gradient mt-3 rounded-full px-5 py-2 text-sm font-semibold text-white"
                    >
                      Confirmar cambio
                    </motion.button>
                    {emailStatus && <p className="mt-2 text-xs text-muted">{emailStatus}</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showPasswordForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-xl border border-panel-border bg-panel-soft/40 p-4">
                    <label className="mb-1 block text-xs font-medium text-muted">Nueva contraseña</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full rounded-lg border border-panel-border bg-panel-soft px-3 py-2 text-sm outline-none focus:border-ice/50"
                    />
                    <label className="mb-1 mt-3 block text-xs font-medium text-muted">Confirma tu contraseña actual</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Tu contraseña actual"
                      className="w-full rounded-lg border border-panel-border bg-panel-soft px-3 py-2 text-sm outline-none focus:border-ice/50"
                    />
                    <motion.button
                      type="button"
                      onClick={handleChangePassword}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 400, damping: 22 }}
                      className="accent-gradient mt-3 rounded-full px-5 py-2 text-sm font-semibold text-white"
                    >
                      Confirmar cambio
                    </motion.button>
                    {passwordStatus && <p className="mt-2 text-xs text-muted">{passwordStatus}</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="button"
              onClick={handleLogout}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="mt-5 rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
            >
              Cerrar sesión
            </motion.button>
          </>
        )}
      </div>

      <div className="panel-elevated mt-10 rounded-2xl border border-panel-border p-6">
        <h2 className="font-heading text-lg font-semibold">Privacidad</h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          Ren recuerda cosas de tus conversaciones (gustos, cómo prefieres que te trate) en este navegador. Puedes
          borrar esa memoria cuando quieras, sin que afecte al resto de tu perfil.
        </p>
        <motion.button
          type="button"
          onClick={handleClearRenMemory}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className="mt-4 rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
        >
          Borrar memoria de Ren
        </motion.button>
        <p className="mt-3 text-sm text-muted">
          Puedes ver y borrar recuerdo a recuerdo en{" "}
          <Link href="/preferencias" className="ice-text hover:underline">
            Tus gustos
          </Link>
          .
        </p>
      </div>

      <div className="panel-elevated mt-10 rounded-2xl border border-panel-border p-6">
        <h2 className="font-heading text-lg font-semibold">Novedades</h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          Qué ha cambiado en la app últimamente.
        </p>
        <Link
          href="/novedades"
          className="mt-4 inline-block rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
        >
          Ver novedades →
        </Link>
      </div>

      <div className="panel-elevated mt-10 rounded-2xl border border-panel-border p-6">
        <h2 className="font-heading text-lg font-semibold">Ajustes de la app</h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          Plataformas donde ves anime, formatos que te interesan, hora del resumen diario, sonidos.
        </p>
        <Link
          href="/ajustes"
          className="mt-4 inline-block rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-ice/40 hover:text-foreground"
        >
          Abrir ajustes →
        </Link>
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
