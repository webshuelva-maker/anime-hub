"use client";

import { useRef } from "react";
import { AVATAR_OPTIONS } from "@/data/options";

export function AvatarPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
      {AVATAR_OPTIONS.map((avatar) => {
        const active = avatar.id === selectedId;
        return (
          <div key={avatar.id} className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              title={avatar.meaning}
              onClick={() => onSelect(avatar.id)}
              className={`flex aspect-square w-full items-center justify-center rounded-2xl bg-gradient-to-br text-xl font-bold text-white transition-all ${avatar.gradient} ${
                active
                  ? "ring-2 ring-ice ring-offset-2 ring-offset-background scale-105"
                  : "opacity-70 hover:opacity-100 hover:scale-105"
              }`}
            >
              {avatar.symbol}
            </button>
            <span className="text-center text-[11px] leading-tight text-muted">
              {avatar.meaning}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PhotoUploadButton({
  onSelect,
  variant = "default",
}: {
  onSelect: (dataUrl: string) => void;
  variant?: "default" | "badge";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      alert("La imagen es demasiado grande. Prueba con una de menos de 1,5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onSelect(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      onChange={handleChange}
      className="hidden"
    />
  );

  if (variant === "badge") {
    return (
      <>
        {input}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title="Subir foto"
          aria-label="Subir foto de perfil"
          className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-ice text-black shadow-lg transition-transform hover:scale-110"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
            <circle cx="12" cy="14" r="3.5" />
          </svg>
        </button>
      </>
    );
  }

  return (
    <>
      {input}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="panel-elevated rounded-lg px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/50"
      >
        Subir mi foto
      </button>
    </>
  );
}

export function Avatar({
  avatarId,
  photoDataUrl,
  size = "md",
  rounded = "default",
}: {
  avatarId: string;
  photoDataUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  rounded?: "default" | "full";
}) {
  const avatar = AVATAR_OPTIONS.find((a) => a.id === avatarId) ?? AVATAR_OPTIONS[0];
  const sizeClasses = {
    sm: "h-8 w-8 text-sm",
    md: "h-11 w-11 text-lg",
    lg: "h-20 w-20 text-3xl",
    xl: "h-28 w-28 text-4xl",
  }[size];
  const shapeClass = rounded === "full" ? "rounded-full" : size === "sm" ? "rounded-lg" : "rounded-2xl";

  if (photoDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto subida por el usuario (dataURL local), no cabe next/image
      <img
        src={photoDataUrl}
        alt="Foto de perfil"
        className={`flex-shrink-0 object-cover ${sizeClasses} ${shapeClass}`}
      />
    );
  }

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center bg-gradient-to-br font-bold text-white ${avatar.gradient} ${sizeClasses} ${shapeClass}`}
    >
      {avatar.symbol}
    </div>
  );
}
