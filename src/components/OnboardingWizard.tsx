"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPreferences, savePreferences } from "@/lib/storage";
import { AvatarPicker, Avatar, PhotoUploadButton } from "./AvatarPicker";
import { siteConfig } from "@/config/site";

export function OnboardingWizard() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [avatarId, setAvatarId] = useState("a1");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const handleStart = () => {
    const current = getPreferences();
    savePreferences({
      ...current,
      displayName: displayName.trim(),
      avatarId,
      avatarPhotoDataUrl: photoDataUrl,
      onboardingCompleted: true,
    });
    router.push("/noticias");
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <span className="font-heading accent-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold text-white">
          愛
        </span>
        <h1 className="font-heading text-2xl font-bold">{siteConfig.name}</h1>
        <p className="mt-1 text-sm text-muted">{siteConfig.tagline}</p>
      </div>

      <div className="panel rounded-2xl p-6 text-center sm:p-8">
        <h2 className="font-heading text-lg font-semibold">¿Cómo te llamamos?</h2>
        <p className="mt-1 text-sm text-muted">
          Nada más que preguntar. El resto lo iremos aprendiendo según lo que leas y te guste.
        </p>

        <div className="relative mx-auto mt-6 w-fit">
          <div
            className="rounded-full p-[3px]"
            style={{ background: "linear-gradient(135deg, var(--ice), var(--accent-from))" }}
          >
            <div className="rounded-full bg-background p-1">
              <Avatar avatarId={avatarId} photoDataUrl={photoDataUrl} size="xl" rounded="full" />
            </div>
            <PhotoUploadButton variant="badge" onSelect={setPhotoDataUrl} />
          </div>
        </div>

        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Tu nombre o apodo"
          maxLength={24}
          className="font-heading panel-elevated mt-6 w-full rounded-lg px-3.5 py-2.5 text-center text-base text-foreground outline-none placeholder:text-muted placeholder:font-sans"
        />

        {!photoDataUrl && (
          <div className="mt-5">
            <p className="mb-2 text-xs text-muted">O elige un emblema</p>
            <AvatarPicker selectedId={avatarId} onSelect={setAvatarId} />
          </div>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={displayName.trim().length === 0}
          className="accent-gradient mt-7 w-full rounded-full px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Entrar
        </button>
      </div>
    </div>
  );
}
