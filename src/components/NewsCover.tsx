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

export function NewsCover({
  category,
  relatedTitle,
  tall = false,
}: {
  category: NewsCategory;
  relatedTitle: string;
  tall?: boolean;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${
        tall
          ? "aspect-[4/3] sm:aspect-auto sm:h-full rounded-t-xl sm:rounded-l-xl sm:rounded-tr-none"
          : "aspect-[16/9] rounded-t-xl"
      }`}
      style={{ background: "var(--panel)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fuente externa (Picsum/Unsplash), no cabe en next/image sin configurar dominios remotos */}
      <img
        src={photoUrl(relatedTitle, 640, 420)}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(6,7,10,0.15) 0%, rgba(6,7,10,0.15) 55%, rgba(6,7,10,0.85) 100%)" }}
      />

      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <span
          className="w-fit border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-white/85"
          style={{ borderColor: "rgba(255,255,255,0.25)", background: "rgba(0,0,0,0.35)" }}
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
