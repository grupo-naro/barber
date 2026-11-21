// Validación pura de la gestión de barberos y contraseñas. Sin Prisma ni Next.
import { z } from "zod";
import { payoutFields, resolvePayoutValue } from "@/lib/barbershop-settings";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

const nameField = z
  .string({ error: "Ingresá el nombre" })
  .trim()
  .min(1, "Ingresá el nombre")
  .max(80, "El nombre puede tener hasta 80 caracteres");

const userIdField = z.string().trim().min(1, "Usuario inválido").max(100, "Usuario inválido");

const newPasswordField = z
  .string({ error: `La contraseña tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres` })
  .min(PASSWORD_MIN_LENGTH, `La contraseña tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña puede tener hasta ${PASSWORD_MAX_LENGTH} caracteres`);

const PASSWORD_MISMATCH = "Las contraseñas no coinciden";

/** Alta de barbero: nombre + email (normalizado con trim y minúsculas). */
export const createBarberSchema = z.object({
  name: nameField,
  email: z
    .string({ error: "Ingresá un email válido" })
    .trim()
    .toLowerCase()
    .max(254, "Ingresá un email válido")
    .pipe(z.email({ error: "Ingresá un email válido" })),
});

/** Edición de barbero: nombre + liquidación, con las mismas reglas que `payoutSchema`. */
export const updateBarberSchema = z
  .object({ userId: userIdField, name: nameField, ...payoutFields })
  .transform((input, ctx) => {
    const value = resolvePayoutValue(input, ctx);
    if (value === null) return z.NEVER;
    return { userId: input.userId, name: input.name, payoutScheme: input.payoutScheme, payoutValue: value };
  });

/** Elegir contraseña al aceptar una invitación. */
export const choosePasswordSchema = z
  .object({ password: newPasswordField, confirmPassword: z.string({ error: PASSWORD_MISMATCH }) })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: PASSWORD_MISMATCH });

/** Cambiar la contraseña desde "Mi cuenta". */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Ingresá tu contraseña actual" })
      .min(1, "Ingresá tu contraseña actual")
      .max(PASSWORD_MAX_LENGTH, "Ingresá tu contraseña actual"),
    newPassword: newPasswordField,
    confirmPassword: z.string({ error: PASSWORD_MISMATCH }),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: PASSWORD_MISMATCH });

export type CreateBarberInput = z.input<typeof createBarberSchema>;
export type UpdateBarberData = z.output<typeof updateBarberSchema>;

/** Estado del acceso de un usuario del panel: activo si ya tiene contraseña. */
export function barberAccessStatus(user: { passwordHash: string | null }): "ACTIVE" | "PENDING" {
  return user.passwordHash === null ? "PENDING" : "ACTIVE";
}
