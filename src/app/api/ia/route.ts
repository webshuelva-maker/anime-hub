import { NextResponse } from "next/server";
import { claveIA, modeloPotente, modeloRapido, modelosDisponibles, proveedorIA, urlIA, cabecerasIA, ajustesRazonamiento, tokensConMargen } from "@/lib/ia";

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
          // Margen generoso a propósito, aunque la respuesta esperada sea
          // de dos letras: los modelos Flash de Gemini gastan tokens
          // "pensando" antes de escribir, y esos tokens descuentan del
          // mismo límite. Con max_tokens: 5 se lo gastaba entero pensando
          // y devolvía vacío — la prueba decía "estado: ok, respuesta:
          // (vacía)" y parecía que el modelo estuviera roto cuando lo que
          // estaba mal era la propia prueba.
          max_tokens: tokensConMargen(5),
          ...ajustesRazonamiento(),
        }),
        signal: AbortSignal.timeout(20000),
      });

      const cuerpo = await res.text();
      if (!res.ok) {
        return { modelo, estado: `HTTP ${res.status}`, detalle: cuerpo.slice(0, 200), ms: Date.now() - inicio };
      }
      const json = JSON.parse(cuerpo);
      const contenido = json?.choices?.[0]?.message?.content ?? "";
      const uso = json?.usage;
      return {
        modelo,
        estado: contenido ? "ok" : "vacía",
        respuesta: contenido.slice(0, 40) || "(vacía)",
        // Si vuelve a salir vacía, esto dice por qué: "length" con
        // tokens de razonamiento altos significa que se los ha comido
        // pensando; cualquier otra cosa es un problema distinto.
        motivoFin: json?.choices?.[0]?.finish_reason ?? null,
        tokensRazonamiento: uso?.completion_tokens_details?.reasoning_tokens ?? null,
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
