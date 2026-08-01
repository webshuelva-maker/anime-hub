import { NextResponse } from "next/server";

export const runtime = "nodejs";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export async function GET() {
  try {
    const key = process.env.NVIDIA_API_KEY ?? "";
    const model = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";

    const base = {
      hasKey: key.length > 0,
      keyLength: key.length,
      startsCorrectly: key.startsWith("nvapi-"),
      keyPreview: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : null,
      model,
      modelSource: process.env.NVIDIA_MODEL ? "NVIDIA_MODEL configurada" : "por defecto (NVIDIA_MODEL no está puesta)",
    };

    if (!key) {
      return NextResponse.json({ ...base, liveTest: "sin clave, no se ha probado" });
    }

    // Prueba real: una llamada mínima de verdad contra NVIDIA, no solo mirar
    // si la clave tiene la forma correcta.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "hola" }],
          max_tokens: 5,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        return NextResponse.json({
          ...base,
          liveTest: `FALLA — NVIDIA respondió ${res.status}: ${errBody.slice(0, 300)}`,
        });
      }

      clearTimeout(timeout);

      // Segunda prueba, más realista: el mismo tipo de petición que hace
      // /api/translate-batch de verdad (system prompt + pedir JSON), no
      // solo un "hola" suelto — la petición mínima puede ir bien y la
      // real seguir fallando (por ejemplo si el modelo no devuelve el
      // JSON en el formato pedido, o si peticiones más grandes/caras se
      // rechazan aunque las pequeñas pasen).
      const batchController = new AbortController();
      const batchTimeout = setTimeout(() => batchController.abort(), 9000);
      try {
        const sampleItems = [{ id: "prueba-1", title: "Demon Slayer Season 5 Announced", summary: "The studio confirmed a new season is in production." }];
        const batchRes = await fetch(NVIDIA_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          signal: batchController.signal,
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 2200,
            messages: [
              {
                role: "system",
                content:
                  'Traduces titulares y resúmenes de noticias de anime del inglés al español de España. Los títulos de anime NUNCA se traducen. Te llega un array JSON con noticias (id, title, summary). Devuelve ÚNICAMENTE un array JSON con la misma estructura, con "title" y "summary" traducidos. Sin texto antes ni después.',
              },
              { role: "user", content: JSON.stringify(sampleItems) },
            ],
          }),
        });

        if (!batchRes.ok) {
          const errBody = await batchRes.text().catch(() => "");
          return NextResponse.json({
            ...base,
            liveTest: "ok — la clave funciona para peticiones pequeñas",
            batchTest: `FALLA — NVIDIA respondió ${batchRes.status} en la prueba realista: ${errBody.slice(0, 400)}`,
          });
        }

        const batchData = await batchRes.json();
        const rawContent: string = batchData?.choices?.[0]?.message?.content ?? "";
        const cleaned = rawContent.replace(/```json/gi, "").replace(/```/g, "").trim();
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);

        if (!jsonMatch) {
          return NextResponse.json({
            ...base,
            liveTest: "ok — la clave funciona para peticiones pequeñas",
            batchTest: `FALLA — el modelo respondió pero SIN el formato JSON pedido. Esto es lo que devolvió: "${rawContent.slice(0, 500)}"`,
          });
        }

        return NextResponse.json({
          ...base,
          liveTest: "ok — la clave funciona para peticiones pequeñas",
          batchTest: `ok — la traducción real también funciona. Ejemplo devuelto: ${jsonMatch[0].slice(0, 300)}`,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({
          ...base,
          liveTest: "ok — la clave funciona para peticiones pequeñas",
          batchTest: `FALLA — excepción en la prueba realista: ${message}`,
        });
      } finally {
        clearTimeout(batchTimeout);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ...base, liveTest: `FALLA — excepción en la llamada: ${message}` });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Fallo general en el diagnóstico: ${message}` }, { status: 500 });
  }
}
