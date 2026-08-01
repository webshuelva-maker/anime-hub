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
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--panel-soft)" }}>
          <div
            className="h-4 w-4 rounded-full"
            style={{
              border: "2px solid rgba(255,255,255,0.15)",
              borderTopColor: "rgba(255,255,255,0.75)",
              animation: "spin 1.6s linear infinite",
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
