"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getPreferences } from "@/lib/storage";
import { BrandMark } from "@/components/BrandMark";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const prefs = getPreferences();
    router.replace(prefs.onboardingCompleted ? "/noticias" : "/onboarding");
  }, [router]);

  // Esta pantalla dura una fracción de segundo mientras se decide a dónde
  // ir. Antes tenía un cuadrado azul latiendo y quedaba fuera de sitio;
  // luego se dejó vacía y se notaba igual, como un hueco. Con el propio
  // emblema de la app el salto se lee como parte del arranque en vez de
  // como un parpadeo raro.
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <motion.span
        className="ice-text"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: [0.5, 1, 0.5], scale: 1 }}
        transition={{
          opacity: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
          scale: { duration: 0.4, ease: "easeOut" },
        }}
      >
        <BrandMark size={30} />
      </motion.span>
    </div>
  );
}
