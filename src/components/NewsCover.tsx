import { NewsCategory } from "@/types/news";
import { colorFromTitle } from "@/lib/colorFromTitle";
import { NewsScene } from "./NewsScene";

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  estreno: "Estreno",
  "temporada-nueva": "Nueva temporada",
  pelicula: "Película",
  doblaje: "Doblaje",
  evento: "Evento",
  adaptacion: "Adaptación",
};

export function NewsCover({
  category,
  relatedTitle,
  tall = false,
}: {
  category: NewsCategory;
  relatedTitle: string;
  tall?: boolean;
}) {
  const accent = colorFromTitle(relatedTitle);
  const uid = `${category}-${relatedTitle}`.replace(/[^a-zA-Z0-9]/g, "");

  return (
    <div
      className={`relative w-full overflow-hidden ${
        tall
          ? "aspect-[4/3] sm:aspect-auto sm:h-full rounded-t-xl sm:rounded-l-xl sm:rounded-tr-none"
          : "aspect-[16/9] rounded-t-xl"
      }`}
      style={{ background: "var(--panel)" }}
    >
      <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <clipPath id={`clip-${uid}`}>
            <rect width="400" height="300" />
          </clipPath>
          <linearGradient id={`scrim-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.65" />
          </linearGradient>
        </defs>
        <g clipPath={`url(#clip-${uid})`}>
          <rect width="400" height="300" fill="var(--panel)" />
          <NewsScene category={category} accent={accent} />
          <rect x="0" y="190" width="400" height="110" fill={`url(#scrim-${uid})`} />
        </g>
        <rect x="1" y="1" width="398" height="298" fill="none" stroke={accent} strokeOpacity="0.3" strokeWidth="1" />
      </svg>

      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <span
          className="w-fit border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-white/85"
          style={{ borderColor: "rgba(255,255,255,0.25)", background: "rgba(0,0,0,0.3)" }}
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
