import { NewsCategory } from "@/types/news";
import { colorFromTitle } from "@/lib/colorFromTitle";
import { NewsScene } from "./NewsScene";

export function NewsThumb({ category, relatedTitle }: { category: NewsCategory; relatedTitle: string }) {
  const accent = colorFromTitle(relatedTitle);
  return (
    <div
      className="relative aspect-square w-16 flex-shrink-0 overflow-hidden rounded-lg sm:w-20"
      style={{ background: "var(--panel)" }}
    >
      <svg viewBox="60 20 280 280" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <rect x="60" y="20" width="280" height="280" fill="var(--panel)" />
        <NewsScene category={category} accent={accent} />
      </svg>
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 0 1px ${accent}44` }} />
    </div>
  );
}
