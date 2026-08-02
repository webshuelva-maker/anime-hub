"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getPreferences, savePreferences } from "@/lib/storage";
import { AvatarPicker, Avatar, PhotoUploadButton } from "./AvatarPicker";
import { BrandMark } from "./BrandMark";
import { siteConfig } from "@/config/site";
import { legalConfig } from "@/config/legal";
import Link from "next/link";
import { CheckBox } from "./CheckBox";

export function OnboardingWizard() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [avatarId, setAvatarId] = useState("a1");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  // Aceptación obligatoria: sin esto no se entra. Queda guardada con la
  // fecha y la versión aceptada, que es lo que sirve como prueba de qué
  // aceptó cada persona y cuándo.
  const [accepted, setAccepted] = useState(false);

  const handleStart = () => {
    const current = getPreferences();
    savePreferences({
      ...current,
      displayName: displayName.trim(),
      avatarId,
      avatarPhotoDataUrl: photoDataUrl,
      onboardingCompleted: true,
      acceptedLegalAt: new Date().toISOString(),
      acceptedLegalVersion: `t${legalConfig.versionTerminos}/p${legalConfig.versionPrivacidad}/n${legalConfig.versionNormas}`,
    });
    router.push("/noticias");
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <span className="accent-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-white">
          <BrandMark size={26} />
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
          className="font-heading panel-elevated mt-6 w-full rounded-lg px-4 py-2.5 text-base text-foreground outline-none transition-shadow placeholder:text-muted placeholder:font-sans focus:shadow-[0_0_0_2px_var(--accent-solid)]"
        />

        {!photoDataUrl && (
          <div className="mt-5">
            <p className="mb-2 text-xs text-muted">O elige un emblema</p>
            <AvatarPicker selectedId={avatarId} onSelect={setAvatarId} />
          </div>
        )}

        <div className="mt-6">
          <CheckBox checked={accepted} onChange={setAccepted}>
            Tengo al menos {legalConfig.edadMinimaApp} años y acepto los{" "}
            <Link href="/legal/terminos" target="_blank" className="ice-text hover:underline">
              términos de uso
            </Link>
            , las{" "}
            <Link href="/legal/normas" target="_blank" className="ice-text hover:underline">
              normas de convivencia
            </Link>{" "}
            y la{" "}
            <Link href="/legal/privacidad" target="_blank" className="ice-text hover:underline">
              política de privacidad
            </Link>
            .
          </CheckBox>
        </div>

        <motion.button
          type="button"
          onClick={handleStart}
          disabled={displayName.trim().length === 0 || !accepted}
          whileHover={displayName.trim() && accepted ? { scale: 1.03 } : {}}
          whileTap={displayName.trim() && accepted ? { scale: 0.96 } : {}}
          className="accent-gradient mt-7 w-full rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Entrar
        </motion.button>
      </div>
    </div>
  );
}
