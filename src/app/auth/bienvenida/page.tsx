import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { siteConfig } from "@/config/site";

/**
 * Lo que se ve después de pulsar el botón del correo.
 *
 * Existe porque antes no existía: se confirmaba la cuenta y se caía en
 * la pantalla de iniciar sesión, idéntica a la de cinco minutos antes.
 * No había forma de saber si había funcionado. Una confirmación que no
 * se confirma en pantalla no está terminada.
 */
export default async function BienvenidaPage({
  searchParams,
}: {
  searchParams: Promise<{ entrar?: string }>;
}) {
  // "entrar=1" significa que la cuenta quedó confirmada pero la sesión no
  // se pudo abrir aquí (correo abierto en otro navegador). No es un
  // error: solo hay que escribir la contraseña una vez.
  const { entrar } = await searchParams;
  const hayQueEntrar = entrar === "1";

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <span className="accent-gradient mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full text-white">
          <BrandMark size={26} />
        </span>

        <h1 className="font-heading text-2xl font-bold">Cuenta confirmada</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {hayQueEntrar
            ? "Tu correo queda verificado y la cuenta activa. Como has abierto el enlace desde otro dispositivo, solo falta que entres una vez con tu contraseña."
            : `Ya está: tu correo queda verificado y tu cuenta activa. A partir de ahora, lo que marques y lo que leas se guarda y te sigue a cualquier dispositivo donde entres.`}
        </p>

        <Link
          href={hayQueEntrar ? "/login" : "/noticias"}
          className="accent-gradient mt-7 inline-block w-full rounded-full py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95"
        >
          {hayQueEntrar ? "Entrar en mi cuenta" : `Empezar con ${siteConfig.name}`}
        </Link>

        <p className="mt-4 text-xs text-muted">
          Usa el correo y la contraseña que acabas de elegir al registrarte.
        </p>
      </div>
    </main>
  );
}
