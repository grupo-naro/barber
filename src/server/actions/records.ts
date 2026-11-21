"use server";

// Mutaciones del "Cuaderno Digital" (OWNER y BARBER). Patrón: Zod `safeParse` → `requireSession()` →
// lógica en `src/server/records.ts` con el `barbershopId` y el actor de la sesión (nunca del cliente).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, type Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { CUSTOMER_NOTES_MAX, PAYMENT_METHODS, normalizeNotes, normalizePhone } from "@/lib/records";
import {
  completeAppointmentRecord,
  createWalkInRecord,
  setTodayAppointmentStatus,
  type ShopContext,
} from "@/server/records";

const TODAY_PATH = "/dashboard/today";

export type RecordFormState =
  | { ok: true; message: string; nonce: number; resetKey: number }
  | { ok: false; error: string; nonce: number; resetKey: number }
  | null;

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export type NotesFormState = { ok: true; message: string; nonce: number } | { ok: false; error: string; nonce: number } | null;

export type CustomerLookup =
  | { found: true; id: string; name: string; notes: string | null }
  | { found: false };

const idSchema = z.string().trim().min(1).max(64);

const paymentSchema = z.enum(PAYMENT_METHODS, "Elegí un medio de pago.");

const serviceIdsSchema = z
  .array(idSchema, "Elegí al menos un servicio.")
  .min(1, "Elegí al menos un servicio.")
  .max(20, "Elegí hasta 20 servicios.");

const phoneSchema = z
  .string()
  .max(40, "Ingresá un teléfono válido (8 a 15 dígitos).")
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Ingresá un teléfono válido (8 a 15 dígitos)." });
      return z.NEVER;
    }
    return phone;
  });

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function strings(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((v): v is string => typeof v === "string");
}

function contextOf(session: Session): ShopContext {
  return {
    barbershopId: session.barbershopId,
    timeZone: session.barbershop.timezone,
    actor: { userId: session.userId, role: session.role },
  };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisá los datos.";
}

const completeSchema = z.object({
  appointmentId: idSchema,
  paymentMethod: paymentSchema,
  serviceIds: serviceIdsSchema,
  /** Quién atendió (sólo lo elige el OWNER); `""` = sin elegir. El servidor lo valida contra la sesión. */
  barberId: z.union([z.literal(""), idSchema]),
});

/** Completa un turno de hoy y crea su registro. Formulario con `useActionState`. */
export async function completeAppointment(prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const nonce = Date.now();
  const resetKey = prev?.resetKey ?? 0;
  const parsed = completeSchema.safeParse({
    appointmentId: text(formData, "appointmentId"),
    paymentMethod: text(formData, "paymentMethod"),
    serviceIds: strings(formData, "serviceIds"),
    barberId: text(formData, "barberId"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error), nonce, resetKey };
  const session = await requireSession();

  const result = await completeAppointmentRecord(contextOf(session), parsed.data);
  if (!result.ok) return { ok: false, error: result.error, nonce, resetKey };
  revalidatePath(TODAY_PATH);
  return { ok: true, message: `Turno completado: registro #${result.dailyNumber}.`, nonce, resetKey: nonce };
}

const statusSchema = z.object({ id: idSchema, status: z.enum(["NO_SHOW", "CANCELLED"]) });

/** Marca un turno abierto de hoy como "no vino" o cancelado. No crea registro. */
export async function setAppointmentStatus(id: string, status: "NO_SHOW" | "CANCELLED"): Promise<ActionResult> {
  const parsed = statusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const session = await requireSession();

  const result = await setTodayAppointmentStatus(contextOf(session), parsed.data.id, parsed.data.status);
  if (!result.ok) return result;
  revalidatePath(TODAY_PATH);
  return { ok: true, message: parsed.data.status === "NO_SHOW" ? "Marcado como “no vino”." : "Turno cancelado." };
}

const walkInSchema = z
  .object({
    barberId: z.union([z.literal(""), idSchema]),
    paymentMethod: paymentSchema,
    serviceIds: serviceIdsSchema,
    phone: z.string().max(40, "Ingresá un teléfono válido (8 a 15 dígitos).").trim(),
    name: z.string().trim().max(80, "El nombre puede tener hasta 80 caracteres."),
  })
  .transform((data, ctx) => {
    if (data.phone === "") return { ...data, customer: null };
    const phone = phoneSchema.safeParse(data.phone);
    if (!phone.success) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: firstIssue(phone.error) });
      return z.NEVER;
    }
    if (data.name !== "" && data.name.length < 2) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "El nombre tiene que tener al menos 2 caracteres." });
      return z.NEVER;
    }
    return { ...data, customer: { phone: phone.data, name: data.name || null } };
  });

/** Registra un corte walk-in. Con los defaults sólo hace falta elegir servicio(s). */
export async function createWalkIn(prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const nonce = Date.now();
  const resetKey = prev?.resetKey ?? 0;
  const parsed = walkInSchema.safeParse({
    barberId: text(formData, "barberId"),
    paymentMethod: text(formData, "paymentMethod") || "CASH",
    serviceIds: strings(formData, "serviceIds"),
    phone: text(formData, "phone"),
    name: text(formData, "name"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error), nonce, resetKey };
  const session = await requireSession();

  const result = await createWalkInRecord(contextOf(session), {
    barberId: parsed.data.barberId || null,
    serviceIds: parsed.data.serviceIds,
    paymentMethod: parsed.data.paymentMethod,
    customer: parsed.data.customer,
  });
  if (!result.ok) return { ok: false, error: result.error, nonce, resetKey };
  revalidatePath(TODAY_PATH);
  return { ok: true, message: `Corte registrado: #${result.dailyNumber}.`, nonce, resetKey: nonce };
}

/** Busca un cliente de la barbería por teléfono (para mostrar nombre y notas en el walk-in). */
export async function lookupCustomer(phone: string): Promise<CustomerLookup> {
  const parsed = phoneSchema.safeParse(phone);
  if (!parsed.success) return { found: false };
  const session = await requireSession();
  const customer = await db.customer.findUnique({
    where: { barbershopId_phone: { barbershopId: session.barbershopId, phone: parsed.data } },
    select: { id: true, name: true, notes: true },
  });
  return customer ? { found: true, ...customer } : { found: false };
}

const notesSchema = z.object({
  customerId: idSchema,
  notes: z
    .string()
    .max(CUSTOMER_NOTES_MAX + 200, `Las notas pueden tener hasta ${CUSTOMER_NOTES_MAX} caracteres.`)
    .transform(normalizeNotes)
    .refine(
      (value) => value === null || value.length <= CUSTOMER_NOTES_MAX,
      `Las notas pueden tener hasta ${CUSTOMER_NOTES_MAX} caracteres.`,
    ),
});

/** Edita las notas técnicas del cliente (≤ 1000 caracteres; vacío → `null`). */
export async function updateCustomerNotes(_prev: NotesFormState, formData: FormData): Promise<NotesFormState> {
  const nonce = Date.now();
  const parsed = notesSchema.safeParse({ customerId: text(formData, "customerId"), notes: text(formData, "notes") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error), nonce };
  const session = await requireSession();

  const { count } = await db.customer.updateMany({
    where: { id: parsed.data.customerId, barbershopId: session.barbershopId },
    data: { notes: parsed.data.notes },
  });
  if (count !== 1) return { ok: false, error: "No encontramos el cliente.", nonce };
  revalidatePath(TODAY_PATH);
  revalidatePath(`${TODAY_PATH}/customers/${parsed.data.customerId}`);
  return { ok: true, message: parsed.data.notes ? "Notas guardadas." : "Notas borradas.", nonce };
}
