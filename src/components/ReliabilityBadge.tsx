import { Reliability } from "@/types/news";

const CONFIG: Record<Reliability, { label: string; color: string }> = {
  official: { label: "Oficial", color: "#4d9b7a" },
  confirmed: { label: "Confirmado", color: "#6d93c4" },
  rumor: { label: "Rumor", color: "#b7965f" },
};

export function ReliabilityBadge({ reliability }: { reliability: Reliability }) {
  const cfg = CONFIG[reliability];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: cfg.color }}>
      <span className="h-[5px] w-[5px] rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}
