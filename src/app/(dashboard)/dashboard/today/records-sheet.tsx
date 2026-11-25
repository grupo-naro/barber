"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { Sheet } from "@/components/panel/sheet";
import { formatPrice } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type PaymentMethodValue } from "@/lib/records";
import { localTime } from "@/lib/time";

/** Lo que se muestra de cada corte del día, y nada más: viaja a un componente de cliente. */
export type BoardRecord = {
  id: string;
  dailyNumber: number;
  createdAt: Date;
  barber: string;
  fromAppointment: boolean;
  customer: { id: string; name: string } | null;
  services: string[];
  paymentMethod: PaymentMethodValue;
  total: string;
};

/** Lista de cortes del día: se abre tocando el resumen. */
export function RecordsSheet({
  open,
  onClose,
  returnFocus,
  records,
  total,
  timeZone,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  records: readonly BoardRecord[];
  total: string;
  timeZone: string;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      returnFocus={returnFocus}
      title="Cortes de hoy"
      footer={
        records.length > 0 ? (
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Total</span>
            <span className="text-lg font-semibold tabular-nums">{formatPrice(total)}</span>
          </p>
        ) : undefined
      }
    >
      {records.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">Todavía no se registró ningún corte hoy.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {records.map((record) => (
            <li key={record.id} className="flex items-start gap-3 py-3">
              <span className="min-w-9 shrink-0 font-semibold tabular-nums">#{record.dailyNumber}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm wrap-anywhere text-muted-foreground tabular-nums">
                  {localTime(record.createdAt, timeZone)} · {record.barber}
                  {record.fromAppointment ? " · con turno" : ""}
                </p>
                {record.customer ? (
                  <Link
                    href={`/dashboard/today/customers/${record.customer.id}`}
                    className="flex min-h-11 items-center font-semibold wrap-anywhere underline-offset-4 hover:underline"
                  >
                    {record.customer.name}
                  </Link>
                ) : (
                  <p className="text-muted-foreground">Sin cliente</p>
                )}
                <p className="text-sm wrap-anywhere">{record.services.join(" + ")}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                <span className="font-semibold tabular-nums">{formatPrice(record.total)}</span>
                <span className="text-sm text-muted-foreground">{PAYMENT_METHOD_LABELS[record.paymentMethod]}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
