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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="accent-gradient h-10 w-10 animate-pulse rounded-xl" />
    </div>
  );
}
