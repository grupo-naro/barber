import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const modules = [
  { title: "Reservas online", description: "Página pública por barbería con turnos libres en tiempo real." },
  { title: "Cuaderno digital", description: "Turnos del día y cortes walk-in en un par de toques." },
  { title: "Caja y liquidaciones", description: "Cierre diario por medio de pago y comisión por barbero." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-3">
        <Badge variant="secondary" className="w-fit">MVP en construcción</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Barber</h1>
        <p className="text-muted-foreground">Gestión y reservas para barberías.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {modules.map((m) => (
          <Card key={m.title}>
            <CardHeader>
              <CardTitle>{m.title}</CardTitle>
              <CardDescription>{m.description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </main>
  );
}
