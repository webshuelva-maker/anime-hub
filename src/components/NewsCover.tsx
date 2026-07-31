"use client";

import { NewsCategory } from "@/types/news";

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  estreno: "Estreno",
  "temporada-nueva": "Nueva temporada",
  pelicula: "Película",
  doblaje: "Doblaje",
  evento: "Evento",
  adaptacion: "Adaptación",
};

// Fotografía real con licencia libre de uso comercial (Picsum, que sirve
// fotos de Unsplash) — se usa solo como ÚLTIMO recurso, cuando ya se ha
// terminado de buscar y de verdad no se encontró ninguna carátula real.
function photoUrl(relatedTitle: string, width: number, height: number) {
  const seed = encodeURIComponent(relatedTitle);
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

export function NewsCover({
  category,
  relatedTitle,
  coverImageUrl,
  pending = false,
  tall = false,
}: {
  category: NewsCategory;
  relatedTitle: string;
  coverImageUrl?: string;
  pending?: boolean;
  tall?: boolean;
}) {
  // Mientras se está buscando la carátula real, un fondo neutro (nada de
  // fotos que no tienen relación). Solo si YA se terminó de buscar y no
  // se encontró nada, se usa una foto de respaldo — mejor eso que un
  // hueco vacío para siempre.
  const showSkeleton = pending && !coverImageUrl;
  const showFallbackPhoto = !pending && !coverImageUrl;

  return (
    <div
      className={`relative w-full overflow-hidden ${
        tall
          ? "aspect-[4/3] sm:aspect-auto sm:h-full rounded-t-xl sm:rounded-l-xl sm:rounded-tr-none"
          : "aspect-[16/9] rounded-t-xl"
      }`}
      style={{ background: "var(--panel)" }}
    >
      {showSkeleton && (
        <div className="absolute inset-0 overflow-hidden" style={{ background: "var(--panel-soft)" }}>
          <div
            className="absolute inset-y-0 w-1/4"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.09), transparent)",
              animation: "shimmerSweep 1.6s linear infinite",
            }}
          />
        </div>
      )}

      {showFallbackPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- fuente externa (Picsum), respaldo final
        <img
          src={photoUrl(relatedTitle, 640, 420)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ animation: "coverFadeIn 500ms ease-out" }}
        />
      )}

      {coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- fuente externa (AniList/artículo), no cabe en next/image sin configurar dominios remotos
        <img
          key={coverImageUrl}
          src={coverImageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-top"
          style={{ animation: "coverFadeIn 600ms ease-out" }}
        />
      )}

      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(6,7,10,0.15) 0%, rgba(6,7,10,0.15) 55%, rgba(6,7,10,0.85) 100%)" }}
      />

      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <span
          className="w-fit text-[11px] font-semibold uppercase tracking-[0.15em] text-white"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
        >
          {CATEGORY_LABELS[category]}
        </span>
        <span className="font-heading text-lg font-semibold leading-tight text-white">
          {relatedTitle}
        </span>
      </div>
    </div>
  );
}
