export function NewsThumb({ relatedTitle, coverImageUrl }: { relatedTitle: string; coverImageUrl?: string }) {
  const seed = encodeURIComponent(relatedTitle);
  return (
    <div className="relative aspect-square w-16 flex-shrink-0 overflow-hidden rounded-lg sm:w-20" style={{ background: "var(--panel)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fuente externa (AniList/Picsum) */}
      <img
        src={coverImageUrl || `https://picsum.photos/seed/${seed}/120/120`}
        alt=""
        loading="lazy"
        className={`absolute inset-0 h-full w-full ${coverImageUrl ? "object-cover object-top" : "object-cover"}`}
      />
    </div>
  );
}
