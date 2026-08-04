import { Suspense } from "react";
import { AdminSupportPanel } from "@/components/AdminSupportPanel";
import { siteConfig } from "@/config/site";

export const metadata = {
  title: `Moderación — ${siteConfig.name}`,
  // No tiene sentido que esta página salga en buscadores.
  robots: { index: false, follow: false },
};

export default function AdminSoportePage() {
  return (
    <main className="flex-1 bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-2xl font-bold">Moderación</h1>
        <p className="mt-2 text-sm text-muted">
          Consultas abiertas por los usuarios, y moderación de cualquier miembro.
        </p>
        {/*
          El panel lee ?ticket=... de la dirección (para abrir esa
          conversación al tocar una notificación) y eso obliga a
          envolverlo en Suspense: sin esto, Next no puede generar la
          página por adelantado y el build falla.
        */}
        <Suspense fallback={<p className="mt-6 text-sm text-muted">Cargando…</p>}>
          <AdminSupportPanel />
        </Suspense>
      </div>
    </main>
  );
}
