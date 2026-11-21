"use server";

// Mutaciones de servicios (sólo OWNER). Patrón: Zod `safeParse` → `requireRole("OWNER")` →
// query filtrada por el `barbershopId` de la sesión. Nunca hay borrado físico: "eliminar" = `active=false`.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  PRICE_MODES,
  ROUNDINGS,
  adjustmentError,
  calculateNewPriceCents,
  centsToPrice,
  exceedsMaxPrice,
  isValidPrice,
  normalizePrice,
  priceToCents,
} from "@/lib/pricing";

const SERVICES_PATH = "/dashboard/services";

export type ServiceField = "name" | "description" | "price" | "durationMinutes" | "showOnline" | "sortOrder";

export type ServiceFormState =
  | {
      ok: boolean;
      message?: string;
      fieldErrors?: Partial<Record<ServiceField, string>>;
      /** Lo que mandó el usuario, para no perderlo si hay errores. */
      values?: Record<ServiceField, string>;
      /** Cambia en cada envío: sirve de `key` para re-montar el formulario. */
      nonce: number;
    }
  | null;

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export type BulkPriceState =
  | { ok: true; updated: number; message: string; nonce: number }
  | { ok: false; error: string; nonce: number }
  | null;

const idSchema = z.string().trim().min(1).max(64);

const serviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ingresá un nombre.")
    .max(80, "El nombre puede tener hasta 80 caracteres."),
  description: z
    .string()
    .trim()
    .max(500, "La descripción puede tener hasta 500 caracteres.")
    .transform((value) => (value === "" ? null : value)),
  price: z
    .string()
    .trim()
    .refine(isValidPrice, "Ingresá un precio válido (ej. 12000 o 12000,50), sin separador de miles.")
    .transform(normalizePrice),
  durationMinutes: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, "Ingresá la duración en minutos (número entero).")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(5, "La duración mínima es de 5 minutos.")
        .max(480, "La duración máxima es de 480 minutos (8 h)."),
    ),
  showOnline: z.boolean(),
  sortOrder: z
    .string()
    .trim()
    .transform((value) => (value === "" ? "0" : value))
    .pipe(z.string().regex(/^\d{1,4}$/, "El orden tiene que ser un número entero entre 0 y 9999."))
    .transform(Number),
});

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readServiceForm(formData: FormData) {
  const values: Record<ServiceField, string> = {
    name: text(formData, "name"),
    description: text(formData, "description"),
    price: text(formData, "price"),
    durationMinutes: text(formData, "durationMinutes"),
    showOnline: formData.get("showOnline") === "on" ? "on" : "",
    sortOrder: text(formData, "sortOrder"),
  };
  const parsed = serviceSchema.safeParse({ ...values, showOnline: values.showOnline === "on" });
  return { values, parsed };
}

function fieldErrorsOf(error: z.ZodError): Partial<Record<ServiceField, string>> {
  const flat = z.flattenError(error).fieldErrors as Partial<Record<ServiceField, string[]>>;
  const result: Partial<Record<ServiceField, string>> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages?.[0]) result[key as ServiceField] = messages[0];
  }
  return result;
}

function revalidateServices(slug: string) {
  revalidatePath(SERVICES_PATH);
  // La web pública lee los servicios por request; igual se invalida por si hubiera algo cacheado.
  revalidatePath(`/${slug}`);
}

export async function createService(_prev: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  const nonce = Date.now();
  const { values, parsed } = readServiceForm(formData);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: fieldErrorsOf(parsed.error), values, nonce };
  }
  const session = await requireRole("OWNER");

  await db.service.create({ data: { ...parsed.data, barbershopId: session.barbershopId } });
  revalidateServices(session.barbershop.slug);
  return { ok: true, message: `Creaste "${parsed.data.name}".`, nonce };
}

export async function updateService(_prev: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  const nonce = Date.now();
  const id = idSchema.safeParse(formData.get("id"));
  const { values, parsed } = readServiceForm(formData);
  if (!id.success) return { ok: false, message: "No encontramos el servicio.", values, nonce };
  if (!parsed.success) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: fieldErrorsOf(parsed.error), values, nonce };
  }
  const session = await requireRole("OWNER");

  const { count } = await db.service.updateMany({
    where: { id: id.data, barbershopId: session.barbershopId },
    data: parsed.data,
  });
  if (count === 0) return { ok: false, message: "No encontramos el servicio.", values, nonce };

  revalidateServices(session.barbershop.slug);
  redirect(SERVICES_PATH);
}

const setActiveSchema = z.object({ id: idSchema, active: z.boolean() });

/** Desactiva o reactiva un servicio. Sólo cambia `active`; nunca borra. */
export async function setServiceActive(id: string, active: boolean): Promise<ActionResult> {
  const parsed = setActiveSchema.safeParse({ id, active });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const session = await requireRole("OWNER");

  const { count } = await db.service.updateMany({
    where: { id: parsed.data.id, barbershopId: session.barbershopId },
    data: { active: parsed.data.active },
  });
  if (count === 0) return { ok: false, error: "No encontramos el servicio." };

  revalidateServices(session.barbershop.slug);
  return { ok: true, message: parsed.data.active ? "Servicio reactivado." : "Servicio desactivado." };
}

const bulkSchema = z
  .object({
    mode: z.enum(PRICE_MODES, "Elegí si el ajuste es en % o en monto fijo."),
    value: z.string().trim(),
    rounding: z.enum(ROUNDINGS, "Elegí un redondeo válido."),
    scope: z.enum(["all", "selected"], "Elegí a qué servicios aplicar el ajuste."),
    serviceIds: z.array(idSchema).max(500),
  })
  .superRefine((data, ctx) => {
    const error = adjustmentError(data.mode, data.value);
    if (error) ctx.addIssue({ code: "custom", path: ["value"], message: error });
    if (data.scope === "selected" && data.serviceIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["serviceIds"], message: "Elegí al menos un servicio." });
    }
  });

class BulkUpdateError extends Error {}

/**
 * Actualización masiva de precios. Recalcula en el servidor desde los precios de la DB (no usa
 * precios del cliente) y escribe todo en una sola transacción, filtrando por la barbería de la sesión.
 */
export async function applyBulkPriceUpdate(_prev: BulkPriceState, formData: FormData): Promise<BulkPriceState> {
  const nonce = Date.now();
  const parsed = bulkSchema.safeParse({
    mode: formData.get("mode"),
    value: text(formData, "value"),
    rounding: formData.get("rounding"),
    scope: formData.get("scope"),
    serviceIds: formData.getAll("serviceIds").filter((v) => typeof v === "string"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos.", nonce };
  }
  const session = await requireRole("OWNER");
  const { mode, value, rounding, scope } = parsed.data;
  const ids = [...new Set(parsed.data.serviceIds)];

  try {
    const updated = await db.$transaction(async (tx) => {
      const services = await tx.service.findMany({
        where: {
          barbershopId: session.barbershopId,
          active: true,
          ...(scope === "selected" ? { id: { in: ids } } : {}),
        },
        select: { id: true, price: true },
      });
      // Ids ajenos, inexistentes o inactivos: se rechaza todo el lote.
      if (scope === "selected" && services.length !== ids.length) {
        throw new BulkUpdateError("Algunos servicios elegidos no existen o están inactivos. Recargá la página.");
      }

      let changed = 0;
      for (const service of services) {
        const next = calculateNewPriceCents(service.price, mode, value, rounding);
        if (exceedsMaxPrice(next)) {
          throw new BulkUpdateError("Algún precio nuevo supera el máximo permitido. No se aplicó ningún cambio.");
        }
        if (next === priceToCents(service.price)) continue;
        const { count } = await tx.service.updateMany({
          where: { id: service.id, barbershopId: session.barbershopId },
          data: { price: centsToPrice(next) },
        });
        if (count !== 1) throw new BulkUpdateError("No se pudo actualizar un servicio. No se aplicó ningún cambio.");
        changed += 1;
      }
      return changed;
    });

    revalidateServices(session.barbershop.slug);
    const message =
      updated === 0
        ? "Ningún precio cambió con ese ajuste."
        : updated === 1
          ? "Se actualizó el precio de 1 servicio."
          : `Se actualizaron los precios de ${updated} servicios.`;
    return { ok: true, updated, message, nonce };
  } catch (error) {
    if (error instanceof BulkUpdateError) return { ok: false, error: error.message, nonce };
    throw error;
  }
}
