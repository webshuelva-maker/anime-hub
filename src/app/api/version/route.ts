import { NextResponse } from "next/server";
import { ULTIMA_VERSION } from "@/data/changelog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Marca del momento EXACTO en que se compiló este archivo.
 *
 * Se calcula al cargar el módulo, o sea una vez por arranque del
 * servidor, y queda congelada dentro de la compilación. Por eso sirve
 * para lo que sirve: si esta fecha es de hace tres días, lo que se está
 * ejecutando se compiló hace tres días, por mucho que los archivos del
 * proyecto sean de hoy.
 */
const COMPILADO = new Date().toISOString();

/**
 * Qué versión de la app se está ejecutando de verdad.
 *
 * Se abre a mano: /api/version
 *
 * Existe porque hay un fallo que se disfraza de fallo de programación y
 * no lo es: seguir ejecutando una compilación antigua. Next.js guarda lo
 * compilado en la carpeta `.next`, y `npm run start` sirve ESO, no el
 * código fuente. Si se sustituyen los archivos del proyecto pero no se
 * vuelve a compilar, la app sigue funcionando tan tranquila con la
 * versión de antes — sin ningún error, sin ningún aviso, y con los
 * cambios sin aparecer por ningún lado.
 *
 * Diagnosticar eso a ciegas es desesperante, porque los síntomas son
 * idénticos a los de un arreglo que no funciona: "sigue igual que
 * antes". Con esta ruta se distingue en cinco segundos.
 */
export function GET() {
  return NextResponse.json(
    {
      version: ULTIMA_VERSION,
      compiladoEl: COMPILADO,
      entorno: process.env.NODE_ENV,
      nota:
        "Si 'version' no es la que acabas de instalar, se está ejecutando una compilación antigua: borra la carpeta .next y vuelve a compilar.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
