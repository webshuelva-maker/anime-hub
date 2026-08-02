import { NovedadesList } from "@/components/NovedadesList";

export const metadata = { title: "Novedades" };

export default function NovedadesPage() {
  return (
    <main className="flex-1 bg-background">
      <NovedadesList />
    </main>
  );
}
