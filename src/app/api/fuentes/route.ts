import { NextResponse } from "next/server";
import { FEEDS, descargarRss } from "@/app/api/news/route";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Comprobación de fuentes.
 *
 * Con más de veinte orígenes es imposible saber cuáles funcionan mirando
 * el feed: una fuente muerta no se ve, simplemente deja de aportar. Esta
 * ruta las prueba todas a la vez, usando EXACTAMENTE el mismo código que
 * la app (mismas cabeceras, mismas direcciones alternativas), así que lo
 * que aquí sale en verde es lo que de verdad va a funcionar.
 */
export async function GET() {
  const comprobaciones = await Promise.all(
    FEEDS.map(async (feed) => {
      const inicio = Date.now();
      const { xml, urlUsada, estado } = await descargarRss(feed.urls);

      const noticias = xml
        ? (xml.match(/<item[\s>]/gi)?.length ?? 0) + (xml.match(/<entry[\s>]/gi)?.length ?? 0)
        : 0;

      return {
        fuente: feed.platform,
        estado: noticias > 0 ? "ok" : estado,
        noticias,
        idioma: feed.language,
        tipo: feed.tier ?? "oficial",
        soloAnime: feed.soloAnime === true,
        ms: Date.now() - inicio,
        // Cuál de las direcciones alternativas ha respondido.
        url: urlUsada ?? feed.urls[0],
      };
    })
  );

  const funcionando = comprobaciones.filter((c) => c.noticias > 0);

  return NextResponse.json(
    {
      resumen: `${funcionando.length} de ${comprobaciones.length} fuentes funcionando`,
      enEspanol: funcionando.filter((c) => c.idioma === "es").length,
      falladas: comprobaciones
        .filter((c) => c.noticias === 0)
        .map((c) => `${c.fuente} — ${c.estado}`),
      detalle: comprobaciones.sort((a, b) => b.noticias - a.noticias),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
