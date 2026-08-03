import { urlIA, claveIA } from "@/lib/ia";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel Hobby permite hasta 60s; 30s deja margen de sobra para una llamada a Groq mas lenta de lo normal


const MODEL = "llama-3.3-70b-versatile";

export async function GET() {
  try {
    const key = claveIA() ?? "";

    const base = {
      hasKey: key.length > 0,
      keyLength: key.length,
      startsCorrectly: key.startsWith("gsk_"),
      keyPreview: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : null,
      model: MODEL,
    };

    if (!key) {
      return NextResponse.json({ ...base, liveTest: "sin clave, no se ha probado" });
    }

    // Prueba real: una llamada mínima de verdad contra Groq, no solo mirar
    // si la clave tiene la forma correcta.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(urlIA(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: "hola" }],
          max_tokens: 5,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        return NextResponse.json({
          ...base,
          liveTest: `FALLA — Groq respondió ${res.status}: ${errBody.slice(0, 300)}`,
        });
      }

      clearTimeout(timeout);

      // Segunda prueba, más realista: el mismo tipo de petición que hace
      // /api/translate-batch de verdad (system prompt + pedir JSON).
      const batchController = new AbortController();
      const batchTimeout = setTimeout(() => batchController.abort(), 25000);
      try {
        const sampleItems = [{ id: "prueba-1", title: "Demon Slayer Season 5 Announced", summary: "The studio confirmed a new season is in production." }];
        const batchRes = await fetch(urlIA(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          signal: batchController.signal,
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.2,
            max_tokens: 2200,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  'Traduces titulares y resúmenes de noticias de anime del inglés al español de España. Los títulos de anime NUNCA se traducen. Te llega un array JSON con noticias (id, title, summary). Devuelve {"items": [...]} con la misma estructura, con "title" y "summary" traducidos.',
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
            batchTest: `FALLA — Groq respondió ${batchRes.status} en la prueba realista: ${errBody.slice(0, 400)}`,
          });
        }

        const batchData = await batchRes.json();
        const rawContent: string = batchData?.choices?.[0]?.message?.content ?? "";
        const cleaned = rawContent.replace(/```json/gi, "").replace(/```/g, "").trim();

        let items: unknown = null;
        try {
          const parsedObj = JSON.parse(cleaned);
          items = Array.isArray(parsedObj) ? parsedObj : parsedObj?.items;
        } catch {
          const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
          if (jsonMatch) items = JSON.parse(jsonMatch[0]);
        }

        if (!Array.isArray(items)) {
          return NextResponse.json({
            ...base,
            liveTest: "ok — la clave funciona para peticiones pequeñas",
            batchTest: `FALLA — el modelo respondió pero SIN el formato JSON pedido. Esto es lo que devolvió: "${rawContent.slice(0, 500)}"`,
          });
        }

        return NextResponse.json({
          ...base,
          liveTest: "ok — la clave funciona para peticiones pequeñas",
          batchTest: `ok — la traducción real también funciona. Ejemplo devuelto: ${JSON.stringify(items).slice(0, 300)}`,
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
