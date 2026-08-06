"use client";

import { useCallback, useRef } from "react";

/**
 * Control de volumen para la música de ambiente.
 *
 * No es un <input type="range"> nativo a propósito: se ve del sistema
 * operativo (cada navegador lo pinta distinto) y aquí se ha evitado
 * justo eso con el resto de campos (fecha, hora). Es una pista con
 * relleno en degradado de acento y un pulgar, arrastrable con ratón o
 * dedo y también con las flechas del teclado.
 */
export function VolumeSlider({
  value, // 0-100
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const desdePosicion = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0 : Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(Math.round(ratio * 100));
  }, [onChange]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    desdePosicion(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.buttons !== 1) return;
    desdePosicion(e.clientX);
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      role="slider"
      aria-label="Volumen de la música"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(100, value + 5));
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(0, value - 5));
        }
      }}
      className={`relative h-5 w-full touch-none ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
    >
      <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-panel-border" />
      <div
        className="accent-gradient absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{ width: `${value}%` }}
      />
      <div
        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 shadow"
        style={{
          left: `calc(${value}% - 8px)`,
          background: "#fff",
          borderColor: "var(--background)",
        }}
      />
    </div>
  );
}
