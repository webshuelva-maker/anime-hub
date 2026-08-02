"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPreferences, syncOnboardingCookie } from "@/lib/storage";

/**
 * Raíz: solo decide a dónde ir. NO pinta nada.
 *
 * Normalmente aquí no se llega: el servidor ya ha redirigido leyendo la
 * cookie (src/proxy.ts), y si no la hubiera, el script del <head> salta
 * antes del primer pintado. Esto es el tercer nivel de seguridad, por si
 * ambas cosas fallaran.
 *
 * Antes esta pantalla enseñaba el emblema latiendo. Se veía medio
 * segundo, y era justo el parpadeo del que se quejaba el usuario: un
 * destello de "algo" antes de la pantalla de carga de verdad. Ahora
 * devuelve solo el fondo, así que aunque se pinte, no se distingue de la
 * pantalla siguiente.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const prefs = getPreferences();
    syncOnboardingCookie(prefs);
    router.replace(prefs.onboardingCompleted ? "/noticias" : "/onboarding");
  }, [router]);

  return <div className="min-h-screen bg-background" />;
}
