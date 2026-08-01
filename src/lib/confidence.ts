import { ResearchSource } from "./sourceTiers";
import type { AnimeFacts } from "./animeFacts";

/**
 * Nivel de confianza de una respuesta investigada.
 *
 * La clave de este archivo es que el número NO lo decide la IA. Un
 * modelo de lenguaje suena igual de seguro diciendo una verdad que
 * inventándose una fecha, así que dejarle puntuar su propia fiabilidad
 * no vale para nada. Aquí se calcula con reglas fijas sobre hechos
 * comprobables: cuántas fuentes oficiales hay, si AniList corrobora lo
 * que dice la web, y cómo de vieja es la información más reciente.
 *
 * Cada regla que suma o resta deja escrita su razón, para que el usuario
 * pueda desplegar el porqué en vez de tener que fiarse de un número.
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

function monthsSince(yyyymm: string): number | null {
  const match = yyyymm.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const then = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  const now = new Date();
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
}

export function computeConfidence(params: {
  sources: ResearchSource[];
  status: string | null;
  latestDate: string | null;
  facts: AnimeFacts | null;
}): Confidence {
  const { sources, status, latestDate, facts } = params;
  const reasons: string[] = [];

  // Punto de partida deliberadamente bajo: sin pruebas, no hay confianza.
  let score = 25;
  let cap = 100;

  // --- 1. Calidad de las fuentes --------------------------------------
  const official = sources.filter((s) => s.tier === "oficial").length;
  const press = sources.filter((s) => s.tier === "prensa").length;
  const unverified = sources.filter((s) => s.tier === "sin-verificar").length;

  if (official > 0) {
    const add = Math.min(official * 14, 34);
    score += add;
    reasons.push(`${official} fuente${official > 1 ? "s" : ""} oficial${official > 1 ? "es" : ""} entre las consultadas`);
  } else {
    score -= 8;
    reasons.push("ninguna fuente oficial entre las consultadas");
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
    reasons.push("no se ha podido consultar ninguna fuente web");
  }

  // --- 2. Qué dice la investigación -----------------------------------
  switch (status) {
    case "confirmado-con-fecha":
      score += 22;
      reasons.push("hay anuncio con fecha concreta");
      break;
    case "confirmado-sin-fecha":
      score += 12;
      reasons.push("está confirmado, pero sin fecha anunciada");
      break;
    case "en-produccion":
      score += 8;
      reasons.push("consta que está en producción");
      break;
    case "terminado":
    case "ya-emitido":
      score += 18;
      reasons.push("es un hecho ya ocurrido, fácil de verificar");
      break;
    case "solo-rumores":
      score -= 18;
      cap = Math.min(cap, 55);
      reasons.push("todo lo que hay son rumores, sin confirmación oficial");
      break;
    case "sin-informacion":
      cap = Math.min(cap, 20);
      reasons.push("no se ha encontrado información sobre esto");
      break;
    default:
      break;
  }

  // --- 3. Contraste con AniList ---------------------------------------
  if (facts) {
    const hasSequel = facts.relations.some((r) => r.relationType === "SEQUEL");

    if (facts.nextEpisode) {
      score += 18;
      reasons.push(`AniList tiene fecha exacta del próximo episodio (${facts.nextEpisode.date.slice(0, 10)})`);
    } else if (facts.status === "RELEASING") {
      score += 12;
      reasons.push("AniList confirma que se está emitiendo ahora mismo");
    } else if (facts.status === "NOT_YET_RELEASED" && facts.startDate) {
      score += 14;
      reasons.push(`AniList registra fecha de inicio: ${facts.startDate}`);
    } else if (facts.status === "NOT_YET_RELEASED") {
      score += 9;
      reasons.push("AniList ya tiene la serie registrada como anunciada");
    }

    if (!hasSequel && status && status.startsWith("confirmado")) {
      score -= 12;
      reasons.push("aviso: AniList todavía no registra ninguna secuela, aunque la web la dé por confirmada");
    }
  } else {
    score -= 5;
    reasons.push("sin ficha en AniList con la que contrastar");
  }

  // --- 4. Cómo de fresca es la información ----------------------------
  if (latestDate) {
    const months = monthsSince(latestDate);
    if (months !== null) {
      if (months <= 2) {
        score += 8;
        reasons.push("la información más reciente es de hace menos de dos meses");
      } else if (months > 12) {
        score -= 12;
        reasons.push(`lo más nuevo que hay es de ${latestDate}: el tema lleva tiempo parado`);
      }
    }
  } else {
    score -= 4;
    reasons.push("no se ha podido datar la información encontrada");
  }

  const finalScore = Math.max(3, Math.min(cap, Math.round(score)));
  const level: ConfidenceLevel = finalScore >= 70 ? "alta" : finalScore >= 40 ? "media" : "baja";

  return { score: finalScore, level, reasons };
}

/**
 * Frase que se le mete a Ren en el prompt para que su TONO encaje con la
 * confianza calculada. Sin esto, el modelo puede escribir "sale en
 * octubre, confirmado" con una confianza del 30% y quedar en ridículo.
 */
export function confidenceInstruction(c: Confidence): string {
  if (c.level === "alta") {
    return `La confianza calculada de esta información es ALTA (${c.score}/100): puedes responder con seguridad, sin llenarlo de condicionales.`;
  }
  if (c.level === "media") {
    return `La confianza calculada de esta información es MEDIA (${c.score}/100): responde con lo que hay, pero deja claro qué parte no está cerrada del todo.`;
  }
  return `La confianza calculada de esta información es BAJA (${c.score}/100): NO afirmes nada como seguro. Di abiertamente que no hay información sólida todavía y explica qué es lo poco que se sabe.`;
}
