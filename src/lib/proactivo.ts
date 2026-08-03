import { NewsItem, UserPreferences } from "@/types/news";

/**
 * Avisos proactivos.
 *
 * La idea: si has preguntado por una serie o la tienes en favoritos y
 * hoy hay una noticia suya, no deberías tener que buscarla — la app ya
 * lo sabe y puede decírtelo al entrar.
 *
 * Todo se calcula en el navegador con lo que ya hay: las noticias
 * cargadas y tus preferencias. No hace ninguna llamada a la IA ni al
 * servidor, así que no cuesta nada y aparece al instante.
 *
 * Reglas para no volverse pesado:
 * - Solo noticias posteriores a la última vez que se avisó.
 * - Solo series que sigues de verdad (favoritos o preguntadas a Iris).
 * - Un aviso por sesión y como mucho tres series mencionadas.
 * - Si lo cierras, no vuelve hasta que haya algo realmente nuevo.
 */

export interface AvisoProactivo {
  /** Series con novedades, ya ordenadas por interés. */
  series: string[];
  /** Las noticias que lo motivan, para poder abrirlas. */
  noticias: NewsItem[];
  texto: string;
}

const CLAVE_ULTIMO_AVISO = "anime-hub:ultimo-aviso-proactivo";

function leerUltimoAviso(): number {
  if (typeof window === "undefined") return Date.now();
  const guardado = window.localStorage.getItem(CLAVE_ULTIMO_AVISO);
  const valor = guardado ? Number(guardado) : 0;
  // La primera vez no se avisa de todo el histórico: sería una avalancha
  // sin sentido. Se toma este momento como punto de partida.
  if (!valor) {
    window.localStorage.setItem(CLAVE_ULTIMO_AVISO, String(Date.now()));
    return Date.now();
  }
  return valor;
}

export function marcarAvisoVisto(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLAVE_ULTIMO_AVISO, String(Date.now()));
}

/** Series que le importan al usuario, de más a menos. */
function seriesSeguidas(prefs: UserPreferences): string[] {
  const interes = Object.entries(prefs.titleInterestCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([titulo]) => titulo);

  // Los favoritos van primero: son una petición explícita.
  const todas = [...prefs.favoriteTitles, ...interes];
  const vistas = new Set<string>();
  return todas.filter((t) => {
    const clave = t.toLowerCase().trim();
    if (!clave || vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

export function calcularAviso(
  items: NewsItem[],
  prefs: UserPreferences
): AvisoProactivo | null {
  const seguidas = seriesSeguidas(prefs);
  if (seguidas.length === 0 || items.length === 0) return null;

  const desde = leerUltimoAviso();

  const encontradas = new Map<string, NewsItem[]>();
  for (const item of items) {
    const publicada = Date.parse(item.publishedAt);
    if (!Number.isFinite(publicada) || publicada <= desde) continue;

    for (const serie of seguidas) {
      if (!item.relatedTitle.toLowerCase().includes(serie.toLowerCase())) continue;
      const lista = encontradas.get(serie) ?? [];
      lista.push(item);
      encontradas.set(serie, lista);
      break; // una noticia cuenta por una sola serie
    }
  }

  if (encontradas.size === 0) return null;

  const series = [...encontradas.keys()].slice(0, 3);
  const noticias = series.flatMap((s) => encontradas.get(s) ?? []);

  return { series, noticias, texto: redactar(series, noticias.length) };
}

/**
 * El texto del aviso. Se escribe aquí y no se le pide a la IA: es una
 * frase corta que depende solo de cuántas series y cuántas noticias hay,
 * así que gastar una llamada al modelo en esto sería tirar cuota (y
 * añadir un segundo de espera) para decir siempre lo mismo.
 */
function redactar(series: string[], cuantas: number): string {
  if (series.length === 1) {
    return cuantas === 1
      ? `Hay una noticia nueva de ${series[0]}.`
      : `Hay ${cuantas} noticias nuevas de ${series[0]}.`;
  }
  if (series.length === 2) {
    return `Hay novedades de ${series[0]} y ${series[1]}.`;
  }
  return `Hay novedades de ${series[0]}, ${series[1]} y ${series[2]}.`;
}
