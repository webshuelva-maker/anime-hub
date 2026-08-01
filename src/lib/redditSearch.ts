import { classifySource, ResearchSource } from "./sourceTiers";

/**
 * Reddit como fuente de RUMORES.
 *
 * Las fuentes de noticias serias solo publican cuando algo ya está
 * confirmado — que es justo la queja: así nunca aparece lo que "se dice"
 * antes del anuncio oficial. Las filtraciones, los leaks de revistas
 * japonesas y los rumores de producción circulan primero en comunidades,
 * y r/anime es donde más se recogen y se discuten (además con gente
 * corrigiendo a los que se inventan cosas, que es útil en sí mismo).
 *
 * Reddit expone su buscador en JSON sin clave ni registro: basta con
 * añadir .json a la URL de búsqueda.
 *
 * Todo lo que sale de aquí se marca SIEMPRE como "sin verificar". No es
 * un descuido: es lo que es. Sirve para poder decir "circula este rumor,
 * viene de aquí, y no está confirmado", no para dar nada por hecho.
 */

export interface RedditHit {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  createdAt: string | null;
  selftext: string;
  source: ResearchSource;
}

interface RawChild {
  data?: {
    title?: string;
    permalink?: string;
    subreddit?: string;
    score?: number;
    created_utc?: number;
    selftext?: string;
    over_18?: boolean;
  };
}

async function fetchReddit(url: string, timeoutMs: number): Promise<RedditHit[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        // Reddit bloquea peticiones sin user-agent identificable.
        "User-Agent": "web:anime-hub:1.0 (by /u/anime-hub-app)",
      },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { data?: { children?: RawChild[] } };
    const children = data?.data?.children ?? [];

    return children
      .map((c) => c.data)
      .filter((d): d is NonNullable<RawChild["data"]> => Boolean(d?.title && d?.permalink))
      .filter((d) => d.over_18 !== true)
      .map((d) => {
        const url = `https://www.reddit.com${d.permalink}`;
        return {
          title: (d.title ?? "").trim(),
          url,
          subreddit: d.subreddit ?? "",
          score: d.score ?? 0,
          createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
          selftext: (d.selftext ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
          source: classifySource(url, (d.title ?? "").trim()),
        };
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Busca en r/anime y, en paralelo, en todo Reddit. Ordena por votos: en
 * una comunidad grande, un rumor muy votado suele ser uno que la gente ha
 * mirado (y a veces desmentido), mientras que uno con dos votos es ruido.
 */
export async function searchReddit(
  queries: string[],
  limit = 5
): Promise<{ hits: RedditHit[]; debug: string }> {
  const urls: { label: string; url: string }[] = [];

  for (const q of queries.slice(0, 2)) {
    if (!q.trim()) continue;
    const encoded = encodeURIComponent(q);
    urls.push({
      label: "r/anime",
      url: `https://www.reddit.com/r/anime/search.json?q=${encoded}&restrict_sr=1&sort=new&t=year&limit=10`,
    });
    urls.push({
      label: "reddit",
      url: `https://www.reddit.com/search.json?q=${encoded}&sort=new&t=year&limit=10`,
    });
  }

  const batches = await Promise.all(urls.map((u) => fetchReddit(u.url, 6000)));
  const debug = urls.map((u, i) => `${u.label}:${batches[i].length}`).join(" ");

  const seen = new Set<string>();
  const merged: RedditHit[] = [];
  for (const batch of batches) {
    for (const hit of batch) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      merged.push(hit);
    }
  }

  merged.sort((a, b) => b.score - a.score);
  return { hits: merged.slice(0, limit), debug };
}

export function redditToPromptText(hits: RedditHit[]): string {
  if (hits.length === 0) return "";
  return hits
    .map((h) => {
      const date = h.createdAt ? h.createdAt.slice(0, 10) : "sin fecha";
      const body = h.selftext ? `\n  ${h.selftext}` : "";
      return `- "${h.title}" — r/${h.subreddit}, ${h.score} votos, ${date}${body}`;
    })
    .join("\n");
}
