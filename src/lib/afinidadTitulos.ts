import { getPreferences, savePreferences } from "./storage";
import { boostCategories } from "./learning";

/**
 * Rellena la afinidad de géneros y estudios a partir de los títulos que
 * el usuario YA tiene guardados.
 *
 * Hacía falta por esto: durante mucho tiempo, marcar un favorito o
 * preguntarle a Ren por una serie apuntaba sus géneros pero mandaba la
 * lista de estudios vacía. El apartado "Estudios" de Tus gustos solo
 * aparece si hay algún estudio con puntos, así que estaba en blanco y no
 * se pintaba nunca — parecía que hubiera desaparecido de la pantalla.
 *
 * Arreglar el guardado solo servía de cara al futuro: quien ya tuviera
 * sus favoritos puestos seguía sin ver nada hasta volver a marcarlo todo
 * otra vez. Esto lo resuelve mirando una vez las series que ya están
 * guardadas y apuntando sus estudios de verdad.
 *
 * Se hace UNA vez por título: lo ya revisado se anota, así que no se
 * repite en cada visita ni infla los contadores en cada recarga.
 */

/*
 * La clave lleva versión a propósito.
 *
 * La primera vuelta de este relleno consultaba AniList sin filtrar por
 * tipo, y para títulos como "Re:ZERO -Starting Life in Another World-"
 * caía en la ficha de la NOVELA LIGERA, que se llama igual y no tiene
 * estudio de animación. Esos títulos quedaron marcados como revisados
 * con las manos vacías y no se habrían vuelto a mirar nunca. Subiendo la
 * versión se repasan una vez más, ya con la consulta correcta.
 */
const CLAVE = "anime-hub:afinidad-rellenada:v2";

function yaRevisados(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(CLAVE);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function anotarRevisado(titulos: string[]): void {
  if (typeof window === "undefined") return;
  const set = yaRevisados();
  titulos.forEach((t) => set.add(t.toLowerCase()));
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify([...set]));
  } catch {
    // Si no cabe en el almacenamiento, como mucho se vuelve a intentar
    // en la siguiente visita. No es grave.
  }
}

/**
 * Devuelve true si ha añadido algo, para que la pantalla que la llama
 * sepa que tiene que volver a leer las preferencias.
 */
export async function rellenarAfinidadPendiente(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const prefs = getPreferences();
  const revisados = yaRevisados();

  /*
   * Los favoritos primero (son lo que el usuario ha elegido a mano) y
   * después las series que sigue de cerca. Doce como mucho, que es lo
   * que admite la ruta de una sentada.
   */
  const candidatos = [...prefs.favoriteTitles, ...Object.keys(prefs.titleInterestCounts ?? {})];

  const pendientes: string[] = [];
  for (const t of candidatos) {
    const clave = t.toLowerCase();
    if (!t.trim() || revisados.has(clave)) continue;
    if (pendientes.some((p) => p.toLowerCase() === clave)) continue;
    pendientes.push(t);
    if (pendientes.length === 12) break;
  }

  if (pendientes.length === 0) return false;

  try {
    const res = await fetch(`/api/caratulas?titulos=${encodeURIComponent(pendientes.join("|"))}`);
    const json = (await res.json()) as {
      datos?: Record<string, { genres?: string[]; studios?: string[] }>;
    };
    const datos = json.datos ?? {};

    let algo = false;
    for (const titulo of pendientes) {
      const ficha = datos[titulo];
      if (!ficha) continue;
      const generos = ficha.genres ?? [];
      const estudios = ficha.studios ?? [];
      if (generos.length === 0 && estudios.length === 0) continue;
      /*
       * Peso 3, el mismo que marcar un favorito: es exactamente lo que
       * habría pasado si esto se hubiera guardado bien en su momento.
       * boostCategories deja también el ejemplo ("te viene de X"), que
       * es lo que hace entendible la barra del estudio.
       */
      boostCategories(generos, estudios, 3, titulo);
      algo = true;
    }

    // Se anotan TODOS los pedidos, hayan dado datos o no: si AniList no
    // conoce un título, volver a preguntarle en cada visita no lo va a
    // arreglar y solo gasta peticiones.
    anotarRevisado(pendientes);

    if (algo) {
      // Un guardado extra en vacío para que la nube y el resto de
      // pantallas se enteren del cambio aunque boostCategories haya sido
      // lo último en escribir.
      savePreferences(getPreferences());
    }
    return algo;
  } catch {
    // Es una mejora, no algo crítico: si falla, se reintenta en la
    // siguiente visita porque no se ha anotado nada.
    return false;
  }
}
