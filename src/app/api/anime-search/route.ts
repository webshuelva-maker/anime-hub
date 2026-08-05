import { NextRequest, NextResponse } from "next/server";
import { searchAnimeDatabase } from "@/lib/anilist";
import { searchJikanList } from "@/lib/jikan";
import { searchKitsu } from "@/lib/kitsu";
import {
  MINIMO_COINCIDENCIA,
  acortarConsulta,
  nucleoDeTitulo,
  puntuarCoincidencia,
} from "@/lib/coincidenciaTitulos";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

type Resultado = Awaited<ReturnType<typeof searchAnimeDatabase>>["results"][number];

/** Pregunta a las tres bases y devuelve lo que encaja con el término. */
async function buscarEn(
  term: string
): Promise<{ resultados: Resultado[]; malId: number | null; debug: string }> {
  /*
   * Se pregunta a las TRES bases a la vez y se juntan los resultados.
   *
   * En cascada no bastaba: AniList limita las peticiones por minuto y la
   * carga del feed consume unas cuantas, así que a veces respondía "sin
   * resultados" en lugar de con un error, y entonces ni siquiera se
   * llegaba a consultar la segunda. Preguntando a las tres siempre, que
   * una falle o esté limitada deja de importar.
   */
  /*
   * Se busca por el nombre de la obra, no por la frase entera.
   *
   * Al pulsar una noticia, el buscador se rellena con el titular
   * completo. A una base de datos de anime no se le puede preguntar por
   * un titular: busca títulos y devuelve cero, y por eso desaparecía el
   * bloque de Contenido justo al abrir una noticia.
   *
   * Se prueba primero con lo escrito tal cual (que es lo bueno cuando se
   * teclea "Re:Zero" a mano) y, si no vuelve nada, se reintenta con la
   * versión recortada. Ese segundo intento solo ocurre cuando el primero
   * ha fallado, así que no dobla las peticiones en el caso normal.
   */
  const corta = acortarConsulta(term);

  const preguntar = async (consulta: string) =>
    Promise.all([
      searchAnimeDatabase(consulta),
      searchJikanList(consulta).catch(() => []),
      searchKitsu(consulta).catch(() => []),
    ]);

  /*
   * Qué se pregunta primero, y por qué importa para el tiempo de espera.
   *
   * Si lo escrito ya PARECE un título (corto y sin palabras de noticia),
   * se pregunta por ello directamente. Pero si es un titular entero
   * —cuando se llega aquí pulsando una noticia—, se va DE PRIMERAS con la
   * versión recortada: preguntar por la frase completa ya se sabe que va
   * a devolver cero, y hacerlo igualmente significaba esperar dos rondas
   * a tres bases de datos antes de enseñar nada. Justo el caso donde se
   * notaba la tardanza.
   *
   * Se sigue guardando el otro intento como respaldo, por si el recorte
   * se pasa de tijera.
   */
  const pareceTitular =
    corta.length >= 3 &&
    corta.toLowerCase() !== term.trim().toLowerCase() &&
    (term.length > 40 || term.trim().split(/\s+/).length > 6);

  const primera = pareceTitular ? corta : term;
  const segunda = pareceTitular ? term : corta;

  let [anilist, mal, kitsu] = await preguntar(primera);

  if (
    anilist.results.length + mal.length + kitsu.length === 0 &&
    segunda.length >= 3 &&
    segunda.toLowerCase() !== primera.toLowerCase()
  ) {
    [anilist, mal, kitsu] = await preguntar(segunda);
  }

  /*
   * Quitar repetidos DE VERDAD: la clave es NÚCLEO + FORMATO + AÑO.
   *
   * Las tres bases casi nunca llaman igual a la misma serie ("Re:ZERO
   * -Starting Life in Another World-", "Re:Zero kara Hajimeru Isekai
   * Seikatsu", "Re:Zero - Starting Life in Another World"), así que
   * comparar el título entero dejaba pasar las tres. Con el núcleo se
   * quedan en una, pero la serie, la película y el especial siguen
   * separadas: son obras distintas.
   */
  const claveDe = (r: Resultado) =>
    [nucleoDeTitulo(r.title), r.format ?? "?", r.startYear ?? "?"].join("|");

  const vistos = new Set<string>();
  const juntos: Resultado[] = [];
  for (const lista of [anilist.results, mal, kitsu]) {
    for (const r of lista) {
      const clave = claveDe(r);
      if (!nucleoDeTitulo(r.title) || vistos.has(clave)) continue;
      vistos.add(clave);
      juntos.push(r);
    }
  }

  /*
   * A igualdad de parecido, la serie de televisión va primero: buscando
   * el nombre de una franquicia, la obra que la persona tiene en la
   * cabeza es casi siempre la serie, no un especial de siete minutos. Y
   * la primera es la que usa el resto de la pantalla (el botón de seguir
   * y el archivo de noticias), así que acertar aquí arregla tres cosas.
   */
  const pesoFormato = (formato: string | null): number => {
    const f = (formato ?? "").toUpperCase();
    if (f.includes("TV")) return 3;
    if (f.includes("MOVIE") || f.includes("PELÍCULA")) return 2;
    if (f.includes("OVA") || f.includes("ONA")) return 1;
    return 0;
  };

  const resultados = juntos
    .map((r) => ({ r, puntos: puntuarCoincidencia(term, r.title) }))
    .filter(({ puntos }) => puntos >= MINIMO_COINCIDENCIA)
    .sort(
      (a, b) =>
        b.puntos - a.puntos ||
        pesoFormato(b.r.format) - pesoFormato(a.r.format) ||
        (a.r.startYear ?? 9999) - (b.r.startYear ?? 9999)
    )
    .map(({ r }) => r);

  /*
   * El identificador de MyAnimeList del mejor resultado.
   *
   * ESTO FALTABA, y era el fallo de fondo del archivo de noticias. La
   * pantalla lee `data.malId` de esta respuesta y se lo pasa a la ruta
   * del archivo para que no tenga que buscar la serie otra vez. Solo que
   * esta ruta no devolvía ese campo NUNCA: `data.malId` era siempre
   * undefined, así que el archivo acababa haciendo su propia búsqueda
   * SIEMPRE.
   *
   * Se coge de dos sitios, en este orden:
   *
   *  1. Del propio resultado, si lo trae. AniList publica el id de
   *     MyAnimeList de cada obra (las dos bases están cruzadas), y esa
   *     es la vía buena: llega sin gastar NI UNA petición a MyAnimeList.
   *     Importa porque Jikan arrastra un fallo conocido y abierto de
   *     errores 504 intermitentes al hablar con MyAnimeList, y su
   *     endpoint de búsqueda es de los que más lo sufren. Sacando el id
   *     de AniList, esa llamada frágil desaparece del camino.
   *  2. Si no, emparejando por núcleo de título con lo que haya
   *     devuelto MyAnimeList, porque las tres bases nombran la misma
   *     serie de formas distintas y el título entero no casaría.
   */
  const mejor = resultados[0];
  const nucleoMejor = mejor ? nucleoDeTitulo(mejor.title) : "";
  const enMal = nucleoMejor ? mal.find((m) => nucleoDeTitulo(m.title) === nucleoMejor) : undefined;
  const malId = mejor?.malId ?? enMal?.id ?? null;
  const deDonde = mejor?.malId ? "anilist" : enMal ? "mal" : "no";

  return {
    resultados,
    malId,
    debug: `anilist: ${anilist.debug} | myanimelist: ${mal.length} | kitsu: ${kitsu.length} | ${juntos.length} juntos, ${resultados.length} relevantes | malId: ${malId ?? "no"} (${deDonde})`,
  };
}

export async function GET(req: NextRequest) {
  const term = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!term) return NextResponse.json({ results: [], fuente: "ninguna", debug: "sin término" });

  const primera = await buscarEn(term);

  /*
   * Segundo intento con el nombre corto.
   *
   * Se puede acabar buscando el TITULAR entero en vez del nombre de la
   * serie ("Re:ZERO -Starting Life in Another World- proseguirá con el
   * arco The Recapture en su temporada 4"), y con esa frase ninguna base
   * de datos encuentra nada: buscan títulos de obra, no frases. Antes eso
   * dejaba la búsqueda sin ficha aunque la serie fuera famosísima.
   *
   * Solo se reintenta cuando el primer intento vuelve vacío, así que una
   * búsqueda normal no gasta ni una petición de más.
   */
  const corta = acortarConsulta(term);
  if (primera.resultados.length === 0 && corta && corta.toLowerCase() !== term.toLowerCase()) {
    const segunda = await buscarEn(corta);
    if (segunda.resultados.length > 0) {
      return NextResponse.json({
        results: segunda.resultados.slice(0, 10),
        malId: segunda.malId,
        fuente: "segundo intento",
        terminoUsado: corta,
        debug: `1º "${term}" → 0 | 2º "${corta}" → ${segunda.debug}`,
      });
    }
  }

  return NextResponse.json({
    results: primera.resultados.slice(0, 10),
    // Lo lee la pantalla para pasárselo al archivo de noticias y
    // ahorrarle una búsqueda contra MyAnimeList.
    malId: primera.malId,
    fuente: primera.resultados.length > 0 ? "directa" : "ninguna",
    // El diagnóstico va SIEMPRE en la respuesta: llevamos varias vueltas
    // adivinando por qué una búsqueda vuelve vacía.
    debug: primera.debug,
  });
}
