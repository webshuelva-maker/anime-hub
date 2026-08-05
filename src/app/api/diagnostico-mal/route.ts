import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Comprueba si este servidor puede hablar con MyAnimeList, y en qué paso
 * se rompe. Se abre a mano en el navegador: /api/diagnostico-mal
 *
 * Existe porque el mismo fallo lleva dos intentos sin resolverse a base
 * de suponer. Prueba los tres pasos por separado —salida a internet,
 * búsqueda y noticias de una serie conocida— y dice cuál falla y con qué
 * código. Con eso el arreglo sale a la primera en vez de a la tercera.
 */
async function probar(paso: string, url: string) {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "AnimeHub/1.0" },
    });
    clearTimeout(timeout);

    let muestra: string | null = null;
    try {
      muestra = (await res.text()).slice(0, 200);
    } catch {
      muestra = null;
    }

    return { paso, url, estado: res.status, ok: res.ok, ms: Date.now() - t0, muestra };
  } catch (e) {
    return {
      paso,
      url,
      estado: null,
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? `${e.name}: ${e.message}` : "desconocido",
    };
  }
}

export async function GET() {
  const pasos = [];
  pasos.push(await probar("1. salida a internet", "https://api.jikan.moe/v4/anime/1"));
  await new Promise((r) => setTimeout(r, 700));
  pasos.push(
    await probar("2. buscar", "https://api.jikan.moe/v4/anime?q=violet%20evergarden&limit=1")
  );
  await new Promise((r) => setTimeout(r, 700));
  // Violet Evergarden es la 33352 en MyAnimeList: caso conocido con
  // noticias de sobra, así que si este paso vuelve vacío el problema no
  // es de esa serie en concreto.
  pasos.push(await probar("3. noticias", "https://api.jikan.moe/v4/anime/33352/news"));

  return NextResponse.json(
    { entorno: process.env.NODE_ENV, pasos },
    { headers: { "Cache-Control": "no-store" } }
  );
}
