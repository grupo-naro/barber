"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botón "Copiar" de un dato de pago (alias o CBU/CVU) en la pantalla de pago del dueño. Recibe solo el valor a
 * copiar y su etiqueta: nada más de `PlatformSettings` ni de la barbería viaja al cliente.
 */
export function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }

  return (
    <div className="flex flex-col items-start">
      <Button type="button" variant="outline" className="h-11" aria-label={`Copiar ${label}`} onClick={copy}>
        {copied === "ok" ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied === "ok" ? "Copiado" : "Copiar"}
      </Button>
      <p aria-live="polite" role="status" className={copied === "error" ? "mt-1 text-xs text-destructive" : "text-xs"}>
        {copied === "error" ? `No pudimos copiarlo: seleccioná el ${label} y copialo a mano.` : ""}
      </p>
    </div>
  );
}
