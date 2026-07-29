import { Platform } from "@/types/news";

const PLATFORM_COLORS: Record<Platform, string> = {
  Crunchyroll: "text-orange-300 bg-orange-500/10 border-orange-500/25",
  Netflix: "text-red-300 bg-red-500/10 border-red-500/25",
  "Prime Video": "text-cyan-300 bg-cyan-500/10 border-cyan-500/25",
  "HBO Max": "text-violet-300 bg-violet-500/10 border-violet-500/25",
  "Disney+": "text-sky-300 bg-sky-500/10 border-sky-500/25",
  AnimeBox: "text-lime-300 bg-lime-500/10 border-lime-500/25",
  "Anime Onegai": "text-pink-300 bg-pink-500/10 border-pink-500/25",
  Wakanim: "text-indigo-300 bg-indigo-500/10 border-indigo-500/25",
  Bilibili: "text-blue-300 bg-blue-500/10 border-blue-500/25",
  "Muse Asia": "text-teal-300 bg-teal-500/10 border-teal-500/25",
  Laftel: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/25",
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${PLATFORM_COLORS[platform]}`}
    >
      {platform}
    </span>
  );
}
