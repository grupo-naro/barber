"use server";

// Cierre de caja (sólo OWNER). Patrón: Zod `safeParse` → `requireRole("OWNER")` → lógica con el
// `barbershopId`/`userId` de la sesión. La transacción vive en `closeCashDay` (la usa también el smoke).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { requirePanelAccess } from "@/lib/billing-access";
import { isValidDate } from "@/lib/slots";
import { CLOSE_ERRORS, closeCashDay } from "@/server/queries/cash";

export type CloseCashState =
  | { ok: true; message: string; nonce: number }
  | { ok: false; error: string; nonce: number }
  | null;

const closeSchema = z.object({
  date: z.string().refine(isValidDate, CLOSE_ERRORS.invalidDate),
  notes: z
    .string()
    .trim()
    .max(500, "Las notas pueden tener hasta 500 caracteres.")
    .transform((value) => (value === "" ? null : value)),
});

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function closeCashRegister(_prev: CloseCashState, formData: FormData): Promise<CloseCashState> {
  const nonce = Date.now();
  const parsed = closeSchema.safeParse({ date: text(formData, "date"), notes: text(formData, "notes") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos.", nonce };

  const session = await requireRole("OWNER");
  requirePanelAccess(session);
  const result = await closeCashDay({
    barbershopId: session.barbershopId,
    userId: session.userId,
    date: parsed.data.date,
    notes: parsed.data.notes,
    timeZone: session.barbershop.timezone,
  });
  if (!result.ok) return { ok: false, error: result.error, nonce };

  revalidatePath("/dashboard/cash");
  const cortes = result.recordCount === 1 ? "1 corte" : `${result.recordCount} cortes`;
  return { ok: true, message: `Caja cerrada: ${cortes}.`, nonce };
}
