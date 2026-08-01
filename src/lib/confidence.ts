import type { ResearchSource } from "./sourceTiers";
import type { AnimeFacts } from "./animeFacts";
import type { JikanFacts } from "./jikan";

/**
 * Nivel de confianza de una respuesta investigada.
 *
 * La clave es que el número NO lo decide la IA. Un modelo de lenguaje
 * suena igual de seguro diciendo una verdad que inventándose una fecha,
 * así que dejarle puntuar su propia fiabilidad no vale para nada. Aquí se
 * calcula con reglas fijas sobre hechos comprobables: qué fuentes hay y
 * de qué tipo, si AniList y MyAnimeList dicen lo mismo, y cómo de
 * reciente es la noticia más nueva (fecha real del buscador, no una que
 * el modelo crea recordar).
 *
 * Cada regla que suma o resta deja escrita su razón, para que se pueda
 * desplegar el porqué en vez de tener que fiarse de un número.
 */

export type ConfidenceLevel = "alta" | "media" | "baja";

export interface Confidence {
  score: number; // 0-100
  level: ConfidenceLevel;
  reasons: string[];
}

export const CONFIDENCE_COLOR: Record<ConfidenceLevel, string> = {
  alta: "#4d9b7a",
  media: "#b7965f",
  baja: "#a4676a",
};

function daysSince(iso: string): number | null {
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Traduce el estado de cada base a una etiqueta común, para compararlas. */
function normalizeAniList(status: string | null): "emitiendo" | "terminado" | "anunciado" | null {
  if (status === "RELEASING") return "emitiendo";
  if (status === "FINISHED") return "terminado";
  if (status === "NOT_YET_RELEASED") return "anunciado";
  return null;
}

function normalizeJikan(f: JikanFacts): "emitiendo" | "terminado" | "anunciado" | null {
  if (f.airing) return "emitiendo";
  if (/finished/i.test(f.status ?? "")) return "terminado";
  if (/not yet/i.test(f.status ?? "")) return "anunciado";
  return null;
}

export function computeConfidence(params: {
  sources: ResearchSource[];
  anilist: AnimeFacts | null;
  jikan: JikanFacts | null;
  newest: string | null;
}): Confidence {
  const { sources, anilist, jikan, newest } = params;
  const reasons: string[] = [];

  // Punto de partida bajo a propósito: sin pruebas, no hay confianza.
  let score = 20;

  // --- 1. Calidad de las fuentes --------------------------------------
  const official = sources.filter((s) => s.tier === "oficial").length;
  const press = sources.filter((s) => s.tier === "prensa").length;
  const unverified = sources.filter((s) => s.tier === "sin-verificar").length;

  if (official > 0) {
    score += Math.min(official * 14, 34);
    reasons.push(`${official} fuente${official > 1 ? "s" : ""} oficial${official > 1 ? "es" : ""}`);
  }
  if (press > 0) {
    score += Math.min(press * 7, 21);
    reasons.push(`${press} medio${press > 1 ? "s" : ""} de prensa especializada`);
  }
  if (official === 0 && press === 0 && unverified > 0) {
    score -= 12;
    reasons.push("solo hay agregadores, foros o redes sociales");
  }
  if (sources.length === 0) {
    score -= 15;
    reasons.push("ninguna noticia encontrada en los buscadores");
  }

  // --- 2. Bases de datos: qué dicen y si coinciden ---------------------
  const aniState = anilist ? normalizeAniList(anilist.status) : null;
  const malState = jikan ? normalizeJikan(jikan) : null;

  if (anilist?.nextEpisode) {
    score += 18;
    reasons.push(`AniList tiene fecha exacta del próximo episodio (${anilist.nextEpisode.date.slice(0, 10)})`);
  } else if (aniState === "emitiendo") {
    score += 14;
    reasons.push("AniList dice que se está emitiendo ahora mismo");
  } else if (aniState === "anunciado" && anilist?.startDate) {
    score += 14;
    reasons.push(`AniList registra fecha de inicio: ${anilist.startDate}`);
  } else if (aniState === "anunciado") {
    score += 9;
    reasons.push("AniList ya la tiene registrada como anunciada");
  } else if (aniState === "terminado") {
    score += 10;
    reasons.push("AniList la da por terminada: es un hecho ya ocurrido");
  } else if (!anilist) {
    score -= 5;
    reasons.push("sin ficha en AniList con la que contrastar");
  }

  if (aniState && malState) {
    if (aniState === malState) {
      score += 12;
      reasons.push("AniList y MyAnimeList coinciden en el estado de la serie");
    } else {
      score -= 8;
      reasons.push(
        "AniList y MyAnimeList no coinciden: puede haber un anuncio muy reciente que una de las dos aún no recoge"
      );
    }
  } else if (!jikan) {
    score -= 3;
    reasons.push("sin ficha en MyAnimeList para el segundo contraste");
  }

  // --- 3. Cómo de fresca es la información ----------------------------
  if (newest) {
    const days = daysSince(newest);
    if (days !== null) {
      if (days <= 60) {
        score += 10;
        reasons.push(`hay noticias de hace ${days <= 1 ? "menos de un día" : `${days} días`}`);
      } else if (days > 365) {
        score -= 12;
        reasons.push(`lo más nuevo es de ${newest.slice(0, 10)}: el tema lleva más de un año parado`);
      } else {
        reasons.push(`lo más nuevo es de ${newest.slice(0, 10)}`);
      }
    }
  } else {
    score -= 4;
    reasons.push("no se ha podido datar ninguna noticia");
  }

  const finalScore = Math.max(3, Math.min(100, Math.round(score)));
  const level: ConfidenceLevel = finalScore >= 70 ? "alta" : finalScore >= 40 ? "media" : "baja";

  return { score: finalScore, level, reasons };
}

/**
 * Frase que se le mete a Ren para que su TONO encaje con la confianza
 * calculada. Sin esto, el modelo puede escribir "sale en octubre,
 * confirmado" con una confianza del 30% y quedar en ridículo.
 */
export function confidenceInstruction(c: Confidence): string {
  if (c.level === "alta") {
    return `La confianza calculada de esta información es ALTA (${c.score}/100): responde con seguridad, sin llenarlo de condicionales.`;
  }
  if (c.level === "media") {
    return `La confianza calculada de esta información es MEDIA (${c.score}/100): responde con lo que hay, pero deja claro qué parte no está cerrada del todo.`;
  }
  return `La confianza calculada de esta información es BAJA (${c.score}/100): no afirmes nada como seguro y di abiertamente qué es lo poco que se sabe.`;
}
