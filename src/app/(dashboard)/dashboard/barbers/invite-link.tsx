"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { whatsappInviteUrl } from "@/lib/invitations";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/**
 * Link de invitación recién generado. El servidor solo devuelve el path (`/invitacion/<token>`): la URL absoluta
 * se arma con el origen del navegador. Vive solo en el estado del cliente; al recargar desaparece.
 */
export function InviteLink({ invitePath, barbershopName, barberName }: { invitePath: string; barbershopName: string; barberName: string }) {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
  const url = `${origin}${invitePath}`;
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
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-url">Link de invitación para {barberName}</Label>
        <Input
          id="invite-url"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 font-mono text-xs"
        />
        <p className="rounded-lg border bg-background p-3 text-sm font-medium text-foreground">
          Copialo o mandalo ahora: cuando recargues la página no lo vas a poder ver de nuevo. Vence en 48 horas y sirve
          una sola vez.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="button" size="lg" variant="outline" className="h-11" onClick={copy} disabled={!origin}>
          {copied === "ok" ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied === "ok" ? "Copiado" : "Copiar"}
        </Button>
        <a
          href={origin ? whatsappInviteUrl(barbershopName, url) : undefined}
          aria-disabled={origin ? undefined : true}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size: "lg" }), "h-11")}
        >
          <MessageCircle aria-hidden />
          Enviar por WhatsApp
        </a>
      </div>
      <p
        aria-live="polite"
        role="status"
        className={copied === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      >
        {copied === "ok" ? "Link copiado al portapapeles." : copied === "error" ? "No pudimos copiarlo: seleccioná el link y copialo a mano." : ""}
      </p>
    </div>
  );
}
