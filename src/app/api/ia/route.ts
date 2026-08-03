import { NextResponse } from "next/server";
import {
  claveIA,
  modeloPotente,
  modeloRapido,
  modelosDisponibles,
  proveedorIA,
  urlIA,
  cabecerasIA,
} from "@/lib/ia";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Comprobador del proveedor de IA.
 *
 * Igual que /api/fuentes con los medios: dice qué está configurado de
 * verdad y si la clave responde, en vez de tener que deducirlo por cómo
 * se comporta el asistente. Hace una llamada mínima a cada modelo y
 * mide lo que tarda.
 */
export async function GET() {
  const clave = claveIA();
  if (!clave) {
    return NextResponse.json({
      proveedor: proveedorIA(),
      error: "No hay ninguna clave configurada (ni GEMINI_API_KEY ni GROQ_API_KEY).",
    });
  }

  const probar = async (modelo: string) => {
    const inicio = Date.now();
    try {
      const res = await fetch(urlIA(), {
        method: "POST",
        headers: cabecerasIA(clave),
        body: JSON.stringify({
          model: modelo,
          messages: [{ role: "user", content: "Responde solo con: ok" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(20000),
      });

      const cuerpo = await res.text();
      if (!res.ok) {
        return { modelo, estado: `HTTP ${res.status}`, detalle: cuerpo.slice(0, 200), ms: Date.now() - inicio };
      }
      const json = JSON.parse(cuerpo);
      return {
        modelo,
        estado: "ok",
        respuesta: json?.choices?.[0]?.message?.content?.slice(0, 40) ?? "(vacía)",
        ms: Date.now() - inicio,
      };
    } catch (e) {
      return {
        modelo,
        estado: `error: ${e instanceof Error ? e.message : String(e)}`,
        ms: Date.now() - inicio,
      };
    }
  };

  const [potente, rapido, disponibles] = await Promise.all([
    probar(modeloPotente()),
    probar(modeloRapido()),
    modelosDisponibles(clave),
  ]);

  return NextResponse.json(
    {
      proveedor: proveedorIA(),
      url: urlIA(),
      potente,
      rapido,
      /*
       * Los modelos que ESTA clave puede usar. Google retira nombres cada
       * pocos meses, así que en vez de adivinar cuál poner, aquí se ve la
       * lista real y se elige con la variable IA_MODELO_RAPIDO.
       */
      disponibles: disponibles.filter((m) => /flash|lite|pro/i.test(m)),
      todosLosModelos: disponibles.length,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
