import { NextResponse } from "next/server";
import { NewsCategory, NewsItem, Reliability } from "@/types/news";
import { findCoverImage, guessSeriesName } from "@/lib/anilist";

export const runtime = "nodejs";

const FEED_URL = "https://www.animenewsnetwork.com/all/rss.xml";

function stripHtml(raw: string): string {
  return raw
    .replace("<![CDATA[", "")
    .replace("]]>", "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function inferCategory(title: string): NewsCategory {
  const t = title.toLowerCase();
  if (/(película|movie|film)/.test(t)) return "pelicula";
  if (/(temporada|season \d|season two|season three|sequel)/.test(t)) return "temporada-nueva";
  if (/(dub|doblaje|english cast)/.test(t)) return "doblaje";
  if (/(manga|light novel|adapt)/.test(t)) return "adaptacion";
  if (/(event|festival|expo|panel|anniversary)/.test(t)) return "evento";
  return "estreno";
}

function guessReliability(title: string): Reliability {
  const t = title.toLowerCase();
  if (/(rumor|leak|reportedly|allegedly)/.test(t)) return "rumor";
  return "confirmed";
}

function hashId(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function shortenTitle(title: string): string {
  return title.length > 64 ? `${title.slice(0, 61)}…` : title;
}

export async function GET() {
  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0; +https://animehubbs.netlify.app)" },
      // Vuelve a pedir el feed como mucho cada 15 minutos, no en cada visita
      next: { revalidate: 900 },
    });

    if (!res.ok) {
      return NextResponse.json({ items: [], error: `El feed respondió ${res.status}` }, { status: 502 });
    }

    const xml = await res.text();
    const blocks = xml.split("<item>").slice(1).map((b) => b.split("</item>")[0]);

    const items: NewsItem[] = blocks.slice(0, 30).map((block) => {
      const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Sin título";
      const title = stripHtml(rawTitle);
      const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
      const pubDateRaw = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim();
      const rawDescription = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";
      const description = stripHtml(rawDescription);
      const publishedAt = pubDateRaw && !Number.isNaN(Date.parse(pubDateRaw))
        ? new Date(pubDateRaw).toISOString()
        : new Date().toISOString();

      return {
        id: `ann-${hashId(link || title)}`,
        title,
        summary: description ? description.slice(0, 200) : title,
        body: description || title,
        imageQuery: title,
        reliability: guessReliability(title),
        category: inferCategory(title),
        genres: [],
        studios: [],
        publishedAt,
        source: {
          platform: "Anime News Network",
          url: link || "https://www.animenewsnetwork.com/",
          label: "Ver en Anime News Network",
        },
        relatedTitle: shortenTitle(title),
        prominence: "mainstream",
      };
    });

    // Carátulas oficiales reales vía AniList, en paralelo, limitadas a los
    // primeros elementos (para no disparar demasiadas peticiones); si no hay
    // coincidencia o AniList no responde, el frontend usa su propio respaldo
    // fotográfico — nunca se bloquea el feed por esto.
    await Promise.allSettled(
      items.slice(0, 16).map(async (item) => {
        const cover = await findCoverImage(guessSeriesName(item.relatedTitle));
        if (cover) item.coverImageUrl = cover;
      })
    );

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [], error: "No se pudo contactar con el feed en directo." }, { status: 502 });
  }
}
