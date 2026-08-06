import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Qué devuelve de verdad la página de noticias de MyAnimeList.
 *
 * Se abre a mano con la app encendida:
 *   /api/diagnostico-mal-web?malId=33352
 *
 * Existe porque el lector directo (src/lib/malDirecto.ts) va contra el
 * HTML de una web ajena, y quien lo escribió no puede abrir esa web
 * desde su entorno. Afinar un lector así sin ver lo que llega es
 * adivinar; con esta ruta se ve en un vistazo si nos han puesto un muro,
 * si la página viene vacía o si simplemente han cambiado el diseño, y
 * qué forma tienen sus enlaces.
 *
 * Devuelve MUESTRAS, no la página entera: lo justo para reconocer el
 * patrón sin volcar 300 KB de HTML en la pantalla.
 */
export async function GET(req: NextRequest) {
  const malId = Number(req.nextUrl.searchParams.get("malId") ?? "33352") || 33352;
  const base = process.env.MAL_WEB_BASE || "https://myanimelist.net";
  const url = `${base}/anime/${malId}/_/news`;

  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    const html = await res.text();
    const $ = cheerio.load(html);

    // Todos los enlaces que huelen a noticia, tal y como vienen escritos
    // en la página. Esto es lo que de verdad hace falta para afinar el
    // lector: saber si son absolutos, relativos, o de otra forma.
    const enlacesNoticia: { href: string; texto: string }[] = [];
    $("a").each((_, a) => {
      const href = $(a).attr("href") ?? "";
      if (!href.includes("/news/") && !href.includes("/forum/")) return;
      if (enlacesNoticia.length >= 12) return;
      enlacesNoticia.push({
        href: href.slice(0, 120),
        texto: ($(a).text() ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
      });
    });

    // Clases sospechosas de envolver cada noticia, para el plan B del
    // lector.
    const bloques = {
      "news-unit": $(".news-unit").length,
      article: $("article").length,
      "js-scrollfix-bottom-rel": $(".js-scrollfix-bottom-rel").length,
    };

    const h = html.toLowerCase();

    return NextResponse.json(
      {
        url,
        estado: res.status,
        ms: Date.now() - t0,
        tipoContenido: res.headers.get("content-type"),
        servidor: res.headers.get("server"),
        tamanoKB: Math.round(html.length / 1024),
        // Un título de <title> distinto del esperado delata una
        // redirección a login o a una página de error.
        titulo: ($("title").first().text() || "").trim().slice(0, 120),
        pareceVerificacion:
          h.includes("just a moment") ||
          h.includes("challenge-platform") ||
          h.includes("cf-browser-verification"),
        totalEnlaces: $("a").length,
        bloques,
        enlacesNoticia,
        // Un trozo del principio, por si nada de lo anterior encaja.
        principio: html.slice(0, 300),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      {
        url,
        error: e instanceof Error ? `${e.name}: ${e.message}` : "desconocido",
        ms: Date.now() - t0,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
