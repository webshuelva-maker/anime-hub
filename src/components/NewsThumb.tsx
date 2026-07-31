"use client";

import { useState } from "react";

function FadeInImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fuente externa (AniList/artículo)
    <img
      src={src}
      alt=""
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className="absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ease-out"
      style={{ opacity: loaded ? 1 : 0 }}
    />
  );
}

export function NewsThumb({ relatedTitle, coverImageUrl }: { relatedTitle: string; coverImageUrl?: string }) {
  const seed = encodeURIComponent(relatedTitle);

  return (
    <div className="relative aspect-square w-16 flex-shrink-0 overflow-hidden rounded-lg sm:w-20" style={{ background: "var(--panel)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fuente externa (Picsum) */}
      <img
        src={`https://picsum.photos/seed/${seed}/120/120`}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {coverImageUrl && <FadeInImage key={coverImageUrl} src={coverImageUrl} />}
    </div>
  );
}
