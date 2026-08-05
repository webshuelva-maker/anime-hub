import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Comprueba si este servidor puede hablar con MyAnimeList, y en qué paso
 * se rompe. Se abre a mano en el navegador: /api/diagnostico-mal
 * (con la app ENCENDIDA: si sale ERR_CONNECTION_REFUSED, lo que está
 * apagado es la app, no MyAnimeList).
 *
 * Existe porque el mismo fallo lleva varios intentos sin resolverse a
 * base de suponer. Prueba cada cosa por separado y dice cuál falla y con
 * qué código, para que el arreglo salga a la primera.
 *
 * Se prueban TRES juegos de cabeceras distintos contra la misma
 * dirección. Es la única forma de zanjar la sospecha de que Cloudflare
 * (que es quien protege Jikan) esté rechazando la app por su
 * "User-Agent": si la de navegador pasa y la de la app no, es eso y no
 * hay más que discutir. A este proyecto ya le pasó con varios canales
 * RSS que devolvían 403 hasta que se les mandaron cabeceras de
 * navegador, así que no es una sospecha traída de los pelos.
 */

const NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function probar(paso: string, url: string, headers: Record<string, string>) {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timeout);

    let muestra: string | null = null;
    try {
      muestra = (await res.text()).slice(0, 200);
    } catch {
      muestra = null;
    }

    return {
      paso,
      url,
      estado: res.status,
      ok: res.ok,
      ms: Date.now() - t0,
      // Cloudflare se identifica en las cabeceras. Si aparece junto a un
      // 403, ya no hay que adivinar quién está bloqueando.
      servidor: res.headers.get("server"),
      reintentarEn: res.headers.get("retry-after"),
      muestra,
    };
  } catch (e) {
    return {
      paso,
      url,
      estado: null,
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? `${e.name}: ${e.message}` : "desconocido",
      // La causa de red suele venir aquí y es lo que distingue "no hay
      // DNS" de "la conexión se cortó".
      causa:
        e instanceof Error && "cause" in e && e.cause
          ? String((e.cause as { code?: string }).code ?? e.cause).slice(0, 120)
          : null,
    };
  }
}

const respirar = () => new Promise((r) => setTimeout(r, 800));

export async function GET() {
  const pasos = [];

  // 1-3: ¿funciona cada paso que usa la app, con SUS cabeceras actuales?
  const propias = { Accept: "application/json", "User-Agent": "AnimeHub/1.0" };
  pasos.push(await probar("1. salida a internet", "https://api.jikan.moe/v4/anime/1", propias));
  await respirar();
  pasos.push(
    await probar(
      "2. buscar",
      "https://api.jikan.moe/v4/anime?q=violet%20evergarden&limit=1",
      propias
    )
  );
  await respirar();
  // Violet Evergarden es la 33352 en MyAnimeList: caso conocido con
  // noticias de sobra, así que si este paso vuelve vacío el problema no
  // es de esa serie en concreto.
  pasos.push(await probar("3. noticias", "https://api.jikan.moe/v4/anime/33352/news", propias));
  await respirar();

  // 4-5: la MISMA dirección con otras cabeceras. Si estas pasan y la 1
  // no, el problema son las cabeceras y no la red.
  pasos.push(
    await probar("4. mismo, con User-Agent de navegador", "https://api.jikan.moe/v4/anime/1", {
      Accept: "application/json",
      "User-Agent": NAVEGADOR,
    })
  );
  await respirar();
  pasos.push(
    await probar("5. mismo, sin cabeceras propias", "https://api.jikan.moe/v4/anime/1", {})
  );
  await respirar();

  /*
   * 6: control. Separa "este equipo no tiene internet" de "este equipo no
   * llega a MyAnimeList en concreto".
   *
   * Sirve cualquier sitio MUY estable y que no limite por número de
   * visitas: se probó con la API de GitHub y devolvía 403 por exceso de
   * peticiones desde direcciones compartidas, lo que hacía que el
   * diagnóstico dijera "no hay internet" cuando sí lo había. Un
   * diagnóstico que se equivoca es peor que no tenerlo.
   */
  pasos.push(
    await probar("6. control: otro sitio de internet", "https://registry.npmjs.org/-/ping", {
      Accept: "application/json",
    })
  );

  const deJikan = pasos.filter((p) => p.url.includes("jikan"));
  const jikanOk = deJikan.some((p) => p.ok);
  // Que conteste ALGO ya prueba que hay salida a internet, aunque
  // conteste un error: significa que se ha llegado hasta un servidor.
  const hayInternet = pasos.find((p) => p.paso.startsWith("6."))?.estado !== null;
  const jikanMudo = deJikan.every((p) => p.estado === null);
  const conOtrasCabeceras = pasos.filter((p) => p.paso.startsWith("4.") || p.paso.startsWith("5."));

  /*
   * El veredicto va escrito, no en forma de tabla que haya que
   * interpretar: el objetivo es que quien abra esto sepa qué hacer sin
   * tener que cruzar códigos a mano.
   */
  let veredicto: string;
  if (jikanOk) {
    veredicto =
      "Este servidor SÍ llega a MyAnimeList. El fallo está en el código de la app o en el ritmo de peticiones, no en la red.";
  } else if (!hayInternet) {
    veredicto =
      "Este servidor no llega ni a MyAnimeList ni al sitio de control: no hay salida a internet (red, DNS, antivirus o cortafuegos).";
  } else if (jikanMudo) {
    veredicto =
      "Hay internet, pero api.jikan.moe no contesta nada desde este equipo: DNS, cortafuegos o antivirus filtrando ese dominio, o Jikan caído. Comprobar abriendo https://api.jikan.moe/v4/anime/1 en el navegador.";
  } else if (deJikan.some((p) => p.estado === 429)) {
    veredicto =
      "MyAnimeList responde 429: se le están pidiendo demasiadas cosas seguidas. Subir el hueco entre peticiones (HUECO_MS en src/lib/jikan.ts).";
  } else if (deJikan.some((p) => p.estado === 403)) {
    veredicto = conOtrasCabeceras.some((p) => p.ok)
      ? "403 con las cabeceras de la app, pero con otras SÍ pasa: es un bloqueo por User-Agent. Cambiar el que manda src/lib/jikan.ts."
      : "403 con todas las cabeceras: algo está bloqueando el dominio entero (antivirus con inspección de TLS, proxy de la red o Cloudflare), no es cosa del User-Agent.";
  } else {
    veredicto = "Respuestas inesperadas: mirar el código de cada paso.";
  }

  return NextResponse.json(
    { veredicto, entorno: process.env.NODE_ENV, pasos },
    { headers: { "Cache-Control": "no-store" } }
  );
}
