"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "./BrandMark";
import { siteConfig } from "@/config/site";

type Mode = "login" | "signup";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const missingConfig = !process.env.NEXT_PUBLIC_SUPABASE_URL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setConfirmSent(true);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
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
      <div className="panel rounded-2xl p-6 text-center">
        <h2 className="font-heading text-lg font-semibold">Revisa tu correo</h2>
        <p className="mt-2 text-sm text-muted">
          Te hemos mandado un enlace de confirmación a {email}. Ábrelo para activar tu cuenta.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <span className="accent-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-white">
          <BrandMark size={26} />
        </span>
        <h1 className="font-heading text-2xl font-bold">{siteConfig.name}</h1>
      </div>

      <div className="panel rounded-2xl p-6 sm:p-8">
        <div className="mb-6 flex rounded-full border border-panel-border p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-full py-2 font-medium transition-colors ${
              mode === "login" ? "accent-gradient text-white" : "text-muted"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-full py-2 font-medium transition-colors ${
              mode === "signup" ? "accent-gradient text-white" : "text-muted"
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error && <p className="text-xs text-rumor">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="accent-gradient w-full rounded-full py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-60"
          >
            {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}
