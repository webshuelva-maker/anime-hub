"use client";

import { useState } from "react";

export function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const clean = draft.trim();
    if (!clean) return;
    if (values.some((v) => v.toLowerCase() === clean.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, clean]);
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="panel-elevated flex-1 rounded-lg px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="button"
          onClick={addTag}
          className="accent-gradient rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Añadir
        </button>
      </div>

      {values.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full border border-panel-border bg-panel px-3 py-1.5 text-sm text-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Quitar ${tag}`}
                className="text-muted transition-colors hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
