function photoUrl(relatedTitle: string) {
  const seed = encodeURIComponent(relatedTitle);
  return `https://picsum.photos/seed/${seed}/120/120`;
}

export function NewsThumb({
  relatedTitle,
  coverImageUrl,
  pending = false,
}: {
  relatedTitle: string;
  coverImageUrl?: string;
  pending?: boolean;
}) {
  const showSkeleton = pending && !coverImageUrl;
  const showFallbackPhoto = !pending && !coverImageUrl;

  return (
    <div className="relative aspect-square w-16 flex-shrink-0 overflow-hidden rounded-lg sm:w-20" style={{ background: "var(--panel)" }}>
      {showSkeleton && (
        <div className="absolute inset-0 overflow-hidden" style={{ background: "var(--panel-soft)" }}>
          <div
            className="absolute inset-y-0 w-1/2"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)",
              animation: "shimmerSweep 1.4s ease-in-out infinite",
            }}
          />
        </div>
      )}
      {showFallbackPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- fuente externa (Picsum), respaldo final
        <img
          src={photoUrl(relatedTitle)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ animation: "coverFadeIn 500ms ease-out" }}
        />
      )}
      {coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- fuente externa (AniList/artículo)
        <img
          key={coverImageUrl}
          src={coverImageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-top"
          style={{ animation: "coverFadeIn 600ms ease-out" }}
        />
      )}
    </div>
  );
}
