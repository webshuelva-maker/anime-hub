"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/BrandMark";
import { siteConfig } from "@/config/site";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Mínimo 6 caracteres.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/perfil"), 1800);
  };

  return (
    <main className="flex-1 bg-background">
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <span className="accent-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-white">
            <BrandMark size={26} />
          </span>
          <h1 className="font-heading text-2xl font-bold">{siteConfig.name}</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="panel rounded-2xl p-6 sm:p-8"
        >
          {done ? (
            <p className="text-center text-sm text-muted">Contraseña actualizada — entrando…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="font-heading text-lg font-semibold">Elige una contraseña nueva</h2>
                <label className="mb-1 mt-3 block text-xs font-medium text-muted">Contraseña nueva</label>
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
                {loading ? "Un momento…" : "Guardar contraseña"}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </main>
  );
}
