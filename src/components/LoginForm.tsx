"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "./BrandMark";
import { siteConfig } from "@/config/site";

type Mode = "login" | "signup";

const BENEFITS = [
  "El feed se ordena solo según lo que lees y marcas",
  "Tu perfil te espera igual entres desde el móvil o el ordenador",
  "El primer paso para desbloquear Ren premium más adelante",
];

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestSignup, setSuggestSignup] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const missingConfig = !process.env.NEXT_PUBLIC_SUPABASE_URL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuggestSignup(false);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (signUpError) throw signUpError;
        setConfirmSent(true);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          // Supabase da a propósito el mismo error genérico tanto si la
          // contraseña está mal como si el email no existe (para no
          // revelar qué cuentas existen) — así que no podemos saber
          // CUÁL de las dos es. Lo que sí podemos hacer es ofrecer, sin
          // afirmarlo como un hecho, la opción de crear cuenta en vez de
          // solo repetir el error.
          if (signInError.message.toLowerCase().includes("invalid login credentials")) {
            setSuggestSignup(true);
          }
          throw signInError;
        }
        router.push("/perfil");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo ha ido mal. Prueba otra vez.");
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
        <h2 className="font-heading text-lg font-semibold">Revisa tu correo</h2>
        <p className="mt-2 text-sm text-muted">
          Te hemos mandado un enlace de confirmación a {email}. Ábrelo para activar tu cuenta.
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
                  <p className="text-xs text-rumor">{error}</p>
                  {suggestSignup && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setError(null);
                        setSuggestSignup(false);
                      }}
                      className="mt-1.5 text-xs font-medium text-ice underline hover:text-foreground"
                    >
                      ¿Todavía no tienes cuenta con este email? Crear una →
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

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
