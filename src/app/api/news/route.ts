import { NextResponse } from "next/server";
import { NewsCategory, NewsItem, Reliability } from "@/types/news";

export const runtime = "nodejs";

// No dependemos de una sola fuente: si una falla o está caída, la otra
// puede seguir dando noticias.
const FEEDS = [
  { url: "https://www.animenewsnetwork.com/all/rss.xml", platform: "Anime News Network", label: "Ver en Anime News Network" },
  { url: "https://www.crunchyroll.com/newsrss?lang=en", platform: "Crunchyroll News", label: "Ver en Crunchyroll News" },
];

function decodeEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&"); // siempre el último, para no volver a decodificar entidades ya resueltas
}

function stripHtml(raw: string): string {
  const withoutCdata = raw.replace("<![CDATA[", "").replace("]]>", "");
  // Primero se "traducen" los símbolos (&lt;cite&gt; -> <cite>) y solo
  // DESPUÉS se quitan las etiquetas reales — al revés se quedan a medias.
  const decoded = decodeEntities(withoutCdata);
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmbeddedImage(block: string, rawDescription: string): string | null {
  const enclosure = block.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image[^"]*"/i)
    ?? block.match(/<enclosure[^>]+url="([^"]+)"/i);
  if (enclosure?.[1]) return enclosure[1];

  const mediaThumbnail = block.match(/<media:thumbnail[^>]+url="([^"]+)"/i)
    ?? block.match(/<media:content[^>]+url="([^"]+)"[^>]*medium="image"/i);
  if (mediaThumbnail?.[1]) return mediaThumbnail[1];

  const inlineImg = rawDescription.match(/<img[^>]+src="([^"]+)"/i);
  return inlineImg?.[1] ?? null;
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

/** Si el resumen empieza repitiendo el titular tal cual, quita esa repetición. */
function dedupeAgainstTitle(text: string, title: string): string {
  if (text.toLowerCase().startsWith(title.toLowerCase())) {
    return text.slice(title.length).replace(/^[\s.:—-]+/, "").trim();
  }
  return text;
}

async function fetchFeed(feed: { url: string; platform: string; label: string }): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0; +https://animehubbs.netlify.app)" },
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];

  const xml = await res.text();
  const blocks = xml.split("<item>").slice(1).map((b) => b.split("</item>")[0]);

  return blocks.slice(0, 20).map((block) => {
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Sin título";
    const title = stripHtml(rawTitle);
    const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
    const pubDateRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]
      ?? block.match(/<dc:date>([\s\S]*?)<\/dc:date>/)?.[1])?.trim();
    const rawDescription = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";
    const description = dedupeAgainstTitle(stripHtml(rawDescription), title);
    const embeddedImage = extractEmbeddedImage(block, rawDescription);
    const publishedAt = pubDateRaw && !Number.isNaN(Date.parse(pubDateRaw))
      ? new Date(pubDateRaw).toISOString()
      : new Date().toISOString();

    const item: NewsItem = {
      id: `${feed.platform.slice(0, 3).toLowerCase()}-${hashId(link || title)}`,
      title,
      summary: description ? description.slice(0, 200) : title,
      body: description || title,
      imageQuery: title,
      reliability: guessReliability(title),
      category: inferCategory(title),
      genres: [],
      studios: [],
      publishedAt,
      source: { platform: feed.platform, url: link || feed.url, label: feed.label },
      relatedTitle: shortenTitle(title),
      prominence: "mainstream",
    };
    if (embeddedImage) item.coverImageUrl = embeddedImage;
    return item;
  });
}

export async function GET() {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const items = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (items.length === 0) {
    return NextResponse.json({ items: [], error: "Ninguna fuente respondió." }, { status: 502 });
  }

  return NextResponse.json({ items });
}
