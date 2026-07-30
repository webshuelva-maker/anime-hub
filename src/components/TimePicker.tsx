"use client";

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

export function TimePicker({
  value,
  onChange,
}: {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
}) {
  const [h, m] = value.split(":");
  const closestMinute = MINUTES.reduce((best, opt) =>
    Math.abs(Number(opt) - Number(m || "0")) < Math.abs(Number(best) - Number(m || "0")) ? opt : best
  , "00");

  return (
    <div className="flex items-center gap-2">
      <select
        value={h || "08"}
        onChange={(e) => onChange(`${e.target.value}:${closestMinute}`)}
        className="panel-elevated appearance-none rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:shadow-[0_0_0_2px_var(--accent-solid)]"
      >
        {HOURS.map((hh) => (
          <option key={hh} value={hh}>
            {hh}
          </option>
        ))}
      </select>
      <span className="text-muted">:</span>
      <select
        value={closestMinute}
        onChange={(e) => onChange(`${h || "08"}:${e.target.value}`)}
        className="panel-elevated appearance-none rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:shadow-[0_0_0_2px_var(--accent-solid)]"
      >
        {MINUTES.map((mm) => (
          <option key={mm} value={mm}>
            {mm}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted">h</span>
    </div>
  );
}
