export function NewsThumb({ relatedTitle }: { relatedTitle: string }) {
  const seed = encodeURIComponent(relatedTitle);
  return (
    <div className="relative aspect-square w-16 flex-shrink-0 overflow-hidden rounded-lg sm:w-20" style={{ background: "var(--panel)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fuente externa (Picsum/Unsplash) */}
      <img
        src={`https://picsum.photos/seed/${seed}/120/120`}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
