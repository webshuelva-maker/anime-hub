import { NewsCategory } from "@/types/news";

// Cada categoría es una pequeña escena ilustrada (silueta original, vectorial),
// no una foto ni arte de ningún anime existente — pero se lee como una imagen
// real, no como un icono suelto. Compartida entre la portada grande y la
// miniatura compacta.
export function NewsScene({ category, accent }: { category: NewsCategory; accent: string }) {
  switch (category) {
    case "estreno":
      return (
        <>
          <circle cx="300" cy="120" r="70" fill={accent} opacity="0.5" />
          <path d="M0 300 L120 190 L280 190 L400 300 Z" fill="var(--background-elevated)" opacity="0.6" />
          <g stroke={accent} strokeWidth="7" fill="none" opacity="0.85">
            <path d="M110 260 V150" />
            <path d="M230 260 V150" />
            <path d="M95 150 H245" />
            <path d="M85 168 H255" />
          </g>
        </>
      );
    case "temporada-nueva":
      return (
        <>
          <circle cx="310" cy="70" r="46" fill={accent} opacity="0.55" />
          <circle cx="326" cy="60" r="46" fill="var(--panel)" />
          <path d="M-10 260 L110 150 L190 220 L260 130 L410 260 Z" fill="var(--background-elevated)" opacity="0.85" />
          <path d="M-10 300 L90 210 L200 280 L300 190 L410 300 Z" fill="var(--background-elevated)" />
        </>
      );
    case "pelicula":
      return (
        <>
          <path d="M0 0 L60 300 H0 Z" fill={accent} opacity="0.18" />
          <path d="M400 0 L340 300 H400 Z" fill={accent} opacity="0.18" />
          <path d="M170 0 L230 0 L300 300 L100 300 Z" fill={accent} opacity="0.12" />
          <circle cx="200" cy="90" r="34" fill="none" stroke={accent} strokeWidth="5" opacity="0.8" />
          <circle cx="200" cy="90" r="14" fill={accent} opacity="0.8" />
        </>
      );
    case "doblaje":
      return (
        <>
          <rect x="188" y="90" width="24" height="70" rx="12" fill={accent} opacity="0.75" />
          <path d="M188 190 q12 20 24 0" stroke={accent} strokeWidth="5" fill="none" opacity="0.75" />
          <line x1="200" y1="200" x2="200" y2="222" stroke={accent} strokeWidth="5" opacity="0.75" />
          {[1, 2, 3].map((n) => (
            <g key={n} opacity={0.55 - n * 0.12}>
              <path d={`M${200 - n * 34} 125 q${n * 34} -${n * 22} ${n * 68} 0`} stroke={accent} strokeWidth="4" fill="none" />
              <path d={`M${200 - n * 34} 130 q${n * 34} ${n * 22} ${n * 68} 0`} stroke={accent} strokeWidth="4" fill="none" />
            </g>
          ))}
        </>
      );
    case "evento":
      return (
        <>
          {[70, 170, 270, 340].map((x, i) => (
            <g key={x} opacity={0.9 - i * 0.12}>
              <line x1={x} y1="20" x2={x} y2="55" stroke={accent} strokeWidth="3" opacity="0.5" />
              <ellipse cx={x} cy="95" rx="26" ry="34" fill={accent} opacity={0.35 + i * 0.05} />
              <line x1={x} y1="61" x2={x} y2="129" stroke="var(--background-elevated)" strokeWidth="2" opacity="0.6" />
            </g>
          ))}
          <path d="M-10 300 L410 300 L410 260 Q200 220 -10 260 Z" fill="var(--background-elevated)" opacity="0.7" />
        </>
      );
    case "adaptacion":
      return (
        <>
          <path d="M60 230 Q200 195 340 230 L340 250 Q200 215 60 250 Z" fill={accent} opacity="0.7" />
          <path d="M60 230 Q130 210 200 218 L200 250 Q130 242 60 250 Z" fill="var(--background-elevated)" opacity="0.8" />
          <path d="M340 230 Q270 210 200 218 L200 250 Q270 242 340 250 Z" fill="var(--background-elevated)" opacity="0.8" />
          <line x1="200" y1="120" x2="200" y2="250" stroke={accent} strokeWidth="2" opacity="0.3" />
        </>
      );
    default:
      return null;
  }
}
