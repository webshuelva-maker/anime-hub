"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { AssistantOrb } from "./AssistantOrb";

const HIDDEN_ON = ["/", "/onboarding"];

export function SiteChrome() {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname ?? "")) return null;
  return (
    <>
      <Navbar />
      <AssistantOrb />
    </>
  );
}
