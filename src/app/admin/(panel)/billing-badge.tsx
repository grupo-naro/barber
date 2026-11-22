import { Badge } from "@/components/ui/badge";
import { BILLING_STATE_LABELS } from "@/lib/admin-billing";
import type { BillingState } from "@/lib/billing";

const VARIANTS: Record<BillingState, "secondary" | "outline" | "destructive" | "default"> = {
  EXEMPT: "outline",
  AWAITING_FIRST_PAYMENT: "secondary",
  PAID: "default",
  GRACE: "secondary",
  BLOCKED: "destructive",
};

/** Estado de cobro derivado (`billingState`). Lo usan el listado y la ficha. */
export function BillingBadge({ state }: { state: BillingState }) {
  return (
    <Badge
      variant={VARIANTS[state]}
      className={state === "GRACE" || state === "AWAITING_FIRST_PAYMENT" ? "font-semibold text-foreground ring-1 ring-ring/40" : undefined}
    >
      {BILLING_STATE_LABELS[state]}
    </Badge>
  );
}
