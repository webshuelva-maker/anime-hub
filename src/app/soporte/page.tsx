import { SupportChat } from "@/components/SupportChat";
import { siteConfig } from "@/config/site";

export const metadata = {
  title: `Soporte — ${siteConfig.name}`,
};

export default function SoportePage() {
  return (
    <main className="flex-1 bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-2xl font-bold">Hablar con un administrador</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Para denuncias, problemas con tu cuenta, dudas sobre tus datos o cualquier cosa que
          necesite a una persona detrás.
        </p>
        <SupportChat />
      </div>
    </main>
  );
}
