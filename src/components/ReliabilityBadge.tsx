import { Reliability } from "@/types/news";

const CONFIG: Record<
  Reliability,
  { label: string; className: string; dot: string }
> = {
  official: {
    label: "Oficial",
    className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  confirmed: {
    label: "Confirmado",
    className: "text-blue-300 bg-blue-500/10 border-blue-500/30",
    dot: "bg-blue-400",
  },
  rumor: {
    label: "Rumor",
    className: "text-amber-300 bg-amber-500/10 border-amber-500/30",
    dot: "bg-amber-400",
  },
};

export function ReliabilityBadge({ reliability }: { reliability: Reliability }) {
  const cfg = CONFIG[reliability];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
