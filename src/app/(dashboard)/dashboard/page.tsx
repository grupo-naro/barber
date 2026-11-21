import { redirect } from "next/navigation";

// `/dashboard` es solo un redirect: no hay UI que validar para navegación instantánea
// (sin esto, en dev se loguea "Could not validate `instant`" por el NEXT_REDIRECT).
export const instant = false;

// La home del panel no tiene contenido propio: Hoy es la pantalla útil para ambos roles.
export default function DashboardPage() {
  redirect("/dashboard/today");
}
