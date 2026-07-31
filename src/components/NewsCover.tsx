"use client";

import { useState } from "react";
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
// fotos de Unsplash), no arte ni fotogramas de ningún anime. Cada título
// obtiene siempre la misma foto (semilla fija = su propio nombre).
function photoUrl(relatedTitle: string, width: number, height: number) {
  const seed = encodeURIComponent(relatedTitle);
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

// Componente aparte para que, al cambiar de "src" (usando key en el sitio
// donde se usa), se vuelva a montar desde cero y el fundido se repita en
// vez de aparecer de golpe.
function FadeInImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fuente externa (AniList/artículo), no cabe en next/image sin configurar dominios remotos
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

export function NewsCover({
  category,
  relatedTitle,
  coverImageUrl,
  tall = false,
}: {
  category: NewsCategory;
  relatedTitle: string;
  coverImageUrl?: string;
  tall?: boolean;
}) {
  const placeholder = photoUrl(relatedTitle, 640, 420);

  return (
    <div
      className={`relative w-full overflow-hidden ${
        tall
          ? "aspect-[4/3] sm:aspect-auto sm:h-full rounded-t-xl sm:rounded-l-xl sm:rounded-tr-none"
          : "aspect-[16/9] rounded-t-xl"
      }`}
      style={{ background: "var(--panel)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fuente externa (Picsum), no cabe en next/image sin configurar dominios remotos */}
      <img
        src={placeholder}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {coverImageUrl && <FadeInImage key={coverImageUrl} src={coverImageUrl} />}

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
