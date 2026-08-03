import { NextResponse } from "next/server";
import { FEEDS } from "@/app/api/news/route";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Comprobación de fuentes.
 *
 * Con más de veinte orígenes, saber cuáles funcionan mirando el feed es
 * imposible: una fuente muerta no se ve, simplemente no aporta nada. Esta
 * ruta pregunta a todas a la vez y devuelve una tabla corta y legible.
 *
 * No lee el contenido ni lo procesa: solo comprueba que responden y
 * cuántas noticias traen. Está pensada para abrirla en el navegador y
 * mirarla de un vistazo.
 */
export async function GET() {
  const comprobaciones = await Promise.all(
    FEEDS.map(async (feed) => {
      const inicio = Date.now();
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AnimeHubBot/1.0)" },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          return {
            fuente: feed.platform,
            estado: `HTTP ${res.status}`,
            noticias: 0,
            idioma: feed.language,
            tipo: feed.tier ?? "oficial",
            ms: Date.now() - inicio,
            url: feed.url,
          };
        }

        const xml = await res.text();
        // Se cuentan tanto <item> (RSS) como <entry> (Atom): varios
        // medios sirven Atom y con solo contar <item> saldrían a cero
        // aunque funcionaran perfectamente.
        const items =
          (xml.match(/<item[\s>]/gi)?.length ?? 0) + (xml.match(/<entry[\s>]/gi)?.length ?? 0);

        return {
          fuente: feed.platform,
          estado: items > 0 ? "ok" : "responde pero sin noticias (¿no es RSS?)",
          noticias: items,
          idioma: feed.language,
          tipo: feed.tier ?? "oficial",
          ms: Date.now() - inicio,
          url: feed.url,
        };
      } catch (e) {
        return {
          fuente: feed.platform,
          estado: `error: ${e instanceof Error ? e.message : String(e)}`,
          noticias: 0,
          idioma: feed.language,
          tipo: feed.tier ?? "oficial",
          ms: Date.now() - inicio,
          url: feed.url,
        };
      }
    })
  );

  const funcionando = comprobaciones.filter((c) => c.noticias > 0);

  return NextResponse.json(
    {
      resumen: `${funcionando.length} de ${comprobaciones.length} fuentes funcionando`,
      enEspanol: funcionando.filter((c) => c.idioma === "es").length,
      falladas: comprobaciones.filter((c) => c.noticias === 0).map((c) => `${c.fuente} — ${c.estado}`),
      detalle: comprobaciones.sort((a, b) => b.noticias - a.noticias),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
