import { Badge } from "@/components/ui/badge";
import type { BarberAccessStatus } from "@/lib/barbers";

const LABELS: Record<BarberAccessStatus, string> = {
  ACTIVE: "Activo",
  PENDING: "Invitación pendiente",
  EXPIRED: "Link vencido",
};

/** Estado de acceso de un barbero. Tonos neutros: no compiten con los botones de acción. */
export function BarberStatusBadge({ status }: { status: BarberAccessStatus }) {
  return <Badge variant={status === "ACTIVE" ? "outline" : "secondary"}>{LABELS[status]}</Badge>;
}
