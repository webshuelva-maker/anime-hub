import { NextRequest, NextResponse } from "next/server";
import { translateNewsFields } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal

/**
 * Traduce el título + artículo completo de una noticia ya descargado
 * (ver /api/enrich-detail). Va en su PROPIA llamada, separada del
 * scraping, para que el tiempo de una función serverless nunca tenga
 * que cubrir scrape + traducción a la vez (ver comentario en
 * /api/enrich-detail).
 *
 * Importante: si la traducción falla del todo, "body" se devuelve como
 * null — NUNCA se rellena aquí con el texto original en inglés. Quien
 * llama a esta ruta (el modal de detalle) ya sabe qué mostrar mientras
 * tanto (el resumen ya traducido de la tarjeta) y decide él si merece
 * la pena mostrar el inglés como último recurso, dejándolo claro en la
 * interfaz — nunca como una sustitución silenciosa.
 */
export async function POST(req: NextRequest) {
  let payload: { title?: string; summary?: string; articleText?: string; preferFallback?: boolean };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ title: null, body: null, translateDebug: "cuerpo de la petición inválido" }, { status: 400 });
  }

  const title = payload.title ?? "";
  const summary = payload.summary ?? "";
  const bodyForTranslation = payload.articleText || summary || title;

  const { result: translated, debug: translateDebug } = await translateNewsFields(
    title,
    summary,
    bodyForTranslation,
    900,
    payload.preferFallback === true
  );

  return NextResponse.json({
    title: translated?.title ?? null,
    body: translated?.body ?? null,
    translateDebug,
  });
}
