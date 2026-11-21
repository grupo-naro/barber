import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type BarbershopStatusValue } from "@/lib/platform-admin";

export function BarbershopStatusBadge({ status }: { status: BarbershopStatusValue }) {
  return <Badge variant={status === "ACTIVE" ? "secondary" : "destructive"}>{STATUS_LABELS[status]}</Badge>;
}
