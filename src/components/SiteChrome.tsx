"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { AssistantOrb } from "./AssistantOrb";
import { MobileNav } from "./MobileNav";

const HIDDEN_ON = ["/", "/onboarding"];

export function SiteChrome() {
  const pathname = usePathname();

  // Seguro: la marca "arrancando" (que esconde barra y orbe hasta que
  // aparece la pantalla de carga) solo tiene sentido en las noticias, que
  // es la única sección que tiene esa pantalla. En cualquier otra ruta se
  // retira ya, no vaya a quedarse el marco invisible.
  useEffect(() => {
    if (pathname !== "/noticias") {
      document.documentElement.classList.remove("arrancando");
    }
  }, [pathname]);

  if (HIDDEN_ON.includes(pathname ?? "")) return null;
  return (
    <>
      <Navbar />
      <MobileNav />
      <AssistantOrb />
    </>
  );
}
