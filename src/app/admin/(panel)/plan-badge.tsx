import { Badge } from "@/components/ui/badge";
import { PLAN_LABELS, planBanner, type PlanValue } from "@/lib/platform-admin";
import { cn } from "@/lib/utils";
import { formatDate } from "./format";

/**
 * Plan + vencimiento con los mismos umbrales que el banner del dueño (`planBanner`): vencido → destructive,
 * vence en 7 días o menos → resaltado; el resto en gris. Lo usan la tabla y el detalle.
 */
export function PlanBadge({
  plan,
  planExpiresAt,
  timeZone,
  now,
  className,
}: {
  plan: PlanValue;
  planExpiresAt: Date | null;
  timeZone: string;
  now: Date;
  className?: string;
}) {
  const banner = planBanner(planExpiresAt, now, timeZone);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap", className)}>
      <Badge variant="outline">{PLAN_LABELS[plan]}</Badge>
      {banner.kind === "expired" ? (
        <Badge variant="destructive" className="tabular-nums">
          Vencido {banner.date}
        </Badge>
      ) : banner.kind === "expiring" ? (
        <Badge variant="secondary" className="font-semibold text-foreground tabular-nums ring-1 ring-ring/40">
          Vence pronto · {banner.date}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground tabular-nums">
          {planExpiresAt ? `vence ${formatDate(planExpiresAt, timeZone)}` : "sin vencimiento"}
        </span>
      )}
    </span>
  );
}
