// Alta de un administrador de la plataforma (no hay alta desde la UI).
//   pnpm admin:create --email a@b.com --name "Nombre"
// Genera una contraseña aleatoria, guarda solo su hash (scrypt) e imprime la contraseña UNA sola vez.
// Si el email ya existe, falla (código 1) sin tocar la cuenta existente.
import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { emailField, generateAdminPassword } from "@/lib/platform-admin";

const argsSchema = z.object({
  email: emailField,
  name: z.string({ error: "Falta --name" }).trim().min(1, "Falta --name").max(80, "--name: hasta 80 caracteres"),
});

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: { email: { type: "string" }, name: { type: "string" } },
    strict: true,
  });
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) {
    console.error(`Uso: pnpm admin:create --email a@b.com --name "Nombre"\n${parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}`);
    return 2;
  }
  const { email, name } = parsed.data;

  const existing = await db.platformAdmin.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.error(`Ya existe un administrador con el email ${email}. No se modificó nada.`);
    return 1;
  }

  const password = generateAdminPassword();
  try {
    await db.platformAdmin.create({ data: { email, name, passwordHash: await hashPassword(password) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      console.error(`Ya existe un administrador con el email ${email}. No se modificó nada.`);
      return 1;
    }
    throw error;
  }

  console.log(`Administrador creado: ${name} <${email}>`);
  console.log(`Contraseña (se muestra UNA sola vez, guardala ahora): ${password}`);
  console.log("Ingresá en /admin/login.");
  return 0;
}

main()
  .then(async (code) => {
    await db.$disconnect();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await db.$disconnect();
    process.exit(1);
  });
