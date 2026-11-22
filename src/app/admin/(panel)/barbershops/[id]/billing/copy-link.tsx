"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Link de suscripción de MP (`mpInitPoint`) con botón de copiar y el aviso del mail del pagador. */
export function CopySubscriptionLink({ url, payerEmail }: { url: string; payerEmail: string | null }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
      <Label htmlFor="mp-init-point">Link de suscripción</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="mp-init-point"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 font-mono text-xs"
        />
        <Button type="button" variant="outline" className="h-10" onClick={copy}>
          {copied === "ok" ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied === "ok" ? "Copiado" : "Copiar"}
        </Button>
      </div>
      {payerEmail ? (
        <p className="rounded-lg border bg-background p-2.5 text-sm text-foreground">
          El dueño tiene que pagar con la cuenta de Mercado Pago de{" "}
          <span className="font-medium break-all">{payerEmail}</span>. Con otra cuenta, Mercado Pago rechaza el pago.
        </p>
      ) : null}
      <p
        aria-live="polite"
        role="status"
        className={copied === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      >
        {copied === "ok"
          ? "Link copiado al portapapeles."
          : copied === "error"
            ? "No pudimos copiarlo: seleccioná el link y copialo a mano."
            : ""}
      </p>
    </div>
  );
}
