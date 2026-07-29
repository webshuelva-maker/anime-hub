import { Platform } from "@/types/news";

export const GENRE_OPTIONS = [
  "Shonen",
  "Shojo",
  "Seinen",
  "Josei",
  "Isekai",
  "Slice of Life",
  "Romance",
  "Terror",
  "Deportes",
  "Mecha",
  "Fantasía",
  "Ciencia ficción",
  "Comedia",
  "Misterio",
  "Drama",
  "Acción",
  "Psicológico",
  "Sobrenatural",
] as const;

export const STUDIO_OPTIONS = [
  "MAPPA",
  "Ufotable",
  "Wit Studio",
  "Studio Ghibli",
  "Kyoto Animation",
  "Bones",
  "Madhouse",
  "CloverWorks",
  "A-1 Pictures",
  "Trigger",
  "Production I.G",
  "Sunrise",
  "Toei Animation",
  "David Production",
  "Shaft",
  "Doga Kobo",
] as const;

export const PLATFORM_OPTIONS: Platform[] = [
  "Crunchyroll",
  "Netflix",
  "Prime Video",
  "HBO Max",
  "Disney+",
  "AnimeBox",
  "Anime Onegai",
  "Wakanim",
  "Bilibili",
  "Muse Asia",
  "Laftel",
];

export const CONTENT_FORMAT_OPTIONS = [
  { value: "sub", label: "Subtitulado" },
  { value: "dub", label: "Doblado" },
  { value: "ambos", label: "Ambos" },
] as const;

export interface AvatarOption {
  id: string;
  symbol: string;
  meaning: string;
  gradient: string; // clases tailwind from-x to-y
}

// Avatares abstractos con estética anime (sin usar arte de personajes con copyright).
// Tonos apagados y fríos, coherentes con la paleta general — nada de colores vivos.
export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "a1", symbol: "斬", meaning: "Corte / Filo", gradient: "from-slate-600 to-slate-900" },
  { id: "a2", symbol: "月", meaning: "Luna", gradient: "from-indigo-800 to-slate-900" },
  { id: "a3", symbol: "炎", meaning: "Llama", gradient: "from-stone-700 to-red-950" },
  { id: "a4", symbol: "氷", meaning: "Hielo", gradient: "from-sky-800 to-slate-900" },
  { id: "a5", symbol: "雷", meaning: "Rayo", gradient: "from-amber-900 to-slate-900" },
  { id: "a6", symbol: "花", meaning: "Flor", gradient: "from-rose-900 to-slate-900" },
  { id: "a7", symbol: "闇", meaning: "Oscuridad", gradient: "from-slate-800 to-black" },
  { id: "a8", symbol: "夢", meaning: "Sueño", gradient: "from-violet-900 to-slate-900" },
  { id: "a9", symbol: "龍", meaning: "Dragón", gradient: "from-emerald-900 to-slate-900" },
  { id: "a10", symbol: "星", meaning: "Estrella", gradient: "from-blue-900 to-slate-900" },
  { id: "a11", symbol: "風", meaning: "Viento", gradient: "from-teal-900 to-slate-900" },
  { id: "a12", symbol: "刃", meaning: "Espada / Hoja", gradient: "from-zinc-600 to-zinc-900" },
];
