"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "./BrandMark";
import { siteConfig } from "@/config/site";
import { playToggle } from "@/lib/sound";
import { traducirErrorAuth } from "@/lib/erroresAuth";

type Mode = "login" | "signup";

const BENEFITS = [
  "El feed se ordena solo según lo que lees y marcas",
  "Tu perfil te espera igual entres desde el móvil o el ordenador",
  "El primer paso para desbloquear Iris premium más adelante",
];

export function LoginForm() {
  const router = useRouter();
  // Los avisos que llegan del enlace del correo (caducado, ya usado…)
  // se leen de la dirección para poder explicarlos aquí.
  const avisoDeEnlace =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("aviso");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestSignup, setSuggestSignup] = useState(false);
  const [suggestReset, setSuggestReset] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const missingConfig = !process.env.NEXT_PUBLIC_SUPABASE_URL;

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Escribe tu email arriba primero.");
      return;
    }
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirmar?next=/auth/reset-password`,
    });
    // Se muestra el mismo mensaje exista o no esa cuenta — igual que
    // signInWithPassword, esto también podría revelar qué emails están
    // registrados si se distinguiera.
    setResetSent(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuggestSignup(false);
    setSuggestReset(false);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirmar` },
        });
        if (signUpError) throw signUpError;
        // Truco conocido de Supabase: si el email YA tiene una cuenta
        // confirmada, signUp() no da error (por seguridad, para no
        // revelar qué emails están registrados) — pero devuelve
        // "identities" vacío en vez de con la nueva identidad, a
        // diferencia de un registro genuinamente nuevo. Antes esto
        // enseñaba "revisa tu correo" sin que llegara nada de verdad.
        if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
          setError("Ya hay una cuenta con este correo. Cambia arriba a «Iniciar sesión» para entrar.");
          setSuggestReset(true);
          setMode("login");
        } else {
          setConfirmSent(true);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push("/perfil");
        router.refresh();
      }
    } catch (err) {
      // Nunca el mensaje crudo de Supabase: viene en inglés y escrito
      // para quien programa.
      const t = traducirErrorAuth(err instanceof Error ? err.message : "");
      setError(t.texto);
      setSuggestSignup(Boolean(t.ofrecerRegistro) && mode === "login");
      setSuggestReset(Boolean(t.ofrecerRecuperar) && mode === "login");
    } finally {
      setLoading(false);
    }
  };

  if (missingConfig) {
    return (
      <div className="panel rounded-2xl p-6 text-center text-sm text-muted">
        Todavía no hay una conexión a Supabase configurada en esta instalación.
      </div>
    );
  }

  if (confirmSent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="panel rounded-2xl p-6 text-center"
      >
        <h2 className="font-heading text-lg font-semibold">Te falta un paso</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Hemos mandado un correo a <span className="text-foreground">{email}</span>. Ábrelo y pulsa
          el botón <span className="text-foreground">Confirmar mi cuenta</span>: con eso quedará
          activada y podrás entrar.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Si no aparece en unos minutos, mira en la carpeta de spam o correo no deseado. Hasta que
          no lo confirmes, al intentar entrar te dirá que falta confirmar el correo.
        </p>
      </motion.div>
    );
  }

  if (resetSent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="panel rounded-2xl p-6 text-center"
      >
        <h2 className="font-heading text-lg font-semibold">Revisa tu correo</h2>
        <p className="mt-2 text-sm text-muted">
          Si hay una cuenta con {email}, te hemos mandado un enlace para elegir una contraseña nueva.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mb-8 text-center"
      >
        <span className="accent-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-white">
          <BrandMark size={26} />
        </span>
        <h1 className="font-heading text-2xl font-bold">{siteConfig.name}</h1>
      </motion.div>

      {/* Por qué merece la pena crear cuenta — antes solo mencionaba un
          beneficio ("se ordena por tus gustos"), poco convincente por sí
          solo. Ahora una lista breve de razones reales. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
        className="mb-4 rounded-2xl border border-ice/20 bg-panel-soft p-4"
      >
        <ul className="space-y-1.5">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-xs text-muted">
              <span className="mt-0.5 text-ice">✦</span>
              {b}
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
        className="panel rounded-2xl p-6 sm:p-8"
      >
        {avisoDeEnlace && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4 rounded-xl border border-rumor/30 bg-rumor/5 px-3 py-2 text-xs leading-snug text-foreground/90"
          >
            {avisoDeEnlace}
          </motion.p>
        )}

        <div className="relative mb-6 flex rounded-full border border-panel-border p-1 text-sm">
          {/* Fondo que se desliza de una pestaña a otra, en vez de solo cambiar de color de golpe */}
          <motion.div
            className="accent-gradient absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full"
            animate={{ x: mode === "login" ? 0 : "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              setSuggestSignup(false);
              playToggle();
            }}
            className={`relative z-10 flex-1 rounded-full py-2 font-medium transition-colors ${
              mode === "login" ? "text-white" : "text-muted"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setSuggestSignup(false);
              playToggle();
            }}
            className={`relative z-10 flex-1 rounded-full py-2 font-medium transition-colors ${
              mode === "signup" ? "text-white" : "text-muted"
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            onSubmit={handleSubmit}
            initial={{ opacity: 0, x: mode === "signup" ? 12 : -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === "signup" ? -12 : 12 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-4"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-panel-border bg-panel-soft px-3 py-2 text-sm outline-none focus:border-ice/50"
                placeholder="tu@email.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Contraseña</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-panel-border bg-panel-soft px-3 py-2 text-sm outline-none focus:border-ice/50"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <p className="text-xs leading-snug text-rumor">{error}</p>
                  {(suggestSignup || suggestReset) && (
                    <div className="mt-2 flex flex-col gap-1">
                      {suggestReset && (
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          className="text-left text-xs font-medium text-ice underline hover:text-foreground"
                        >
                          Mandarme un correo para cambiar la contraseña →
                        </button>
                      )}
                      {suggestSignup && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode("signup");
                            setError(null);
                            setSuggestSignup(false);
                            setSuggestReset(false);
                          }}
                          className="text-left text-xs font-medium text-ice underline hover:text-foreground"
                        >
                          Crear una cuenta con este correo →
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {mode === "login" && (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="block text-xs text-muted underline hover:text-foreground"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}

            <button
              type="submit"
              disabled={loading}
              className="accent-gradient w-full rounded-full py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-60"
            >
              {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </motion.form>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
