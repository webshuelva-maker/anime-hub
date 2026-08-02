"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPreferences } from "@/lib/storage";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const prefs = getPreferences();
    router.replace(prefs.onboardingCompleted ? "/noticias" : "/onboarding");
  }, [router]);

  // A propósito no se enseña nada: esta pantalla dura una fracción de
  // segundo mientras se decide a dónde ir. Antes tenía un cuadrado azul
  // latiendo y lo único que conseguía era un parpadeo feo al abrir la
  // app. El fondo a secas hace que la transición pase desapercibida.
  return <div className="min-h-screen bg-background" aria-hidden />;
}
