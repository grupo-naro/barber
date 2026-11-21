"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setServiceActive } from "@/server/actions/services";

export function ActiveToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setServiceActive(id, !active);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={active ? "destructive" : "secondary"}
        size="lg"
        className="h-11 w-full"
        disabled={pending}
        onClick={toggle}
        aria-label={`${active ? "Desactivar" : "Reactivar"} ${name}`}
      >
        {pending ? (active ? "Desactivando…" : "Reactivando…") : active ? "Desactivar" : "Reactivar"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
