# Contexto del repo (lo leen todos los agentes de la factory)

**Producto:** SaaS multi-tenant de gestión y reservas para barberías (Argentina).
Cada barbería (`Barbershop`) es un tenant con `slug` propio: web pública `/[slug]` + panel interno.

## Stack
- Next.js 16 (App Router) en `src/app/`, React 19, TypeScript `strict`.
- Prisma 7 (`prisma/schema.prisma`, generador `prisma-client` → `src/generated/prisma`, adapter `pg`).
  Cliente único en `src/lib/db.ts` (`import { db } from "@/lib/db"`). La config está en `prisma.config.ts`.
- PostgreSQL 17 en Docker (`docker-compose.yml`, puerto **5434**). `.env` sale de `.env.example`.
- Tailwind CSS v4 + shadcn/ui (estilo `base-nova`, primitivas `@base-ui/react`, íconos `lucide-react`).
  Componentes en `src/components/ui/`; se agregan con `pnpm dlx shadcn@4.23.0 add <nombre>`.
- Validación: **Zod 4**. Tests: **Vitest** (`src/**/*.test.ts`).
- Gestor de paquetes: **pnpm**. Nunca uses npm ni yarn.
- Alias de imports: `@/*` → `src/*`.

## ⚠️ Next.js 16 cambió
Antes de escribir código específico de Next, leé la guía correspondiente en `node_modules/next/dist/docs/01-app/`.
Por ejemplo, **middleware ahora se llama `proxy`** (`src/proxy.ts`, ver `01-getting-started/16-proxy.md`),
`params` es asíncrono, y hay guías en `02-guides/authentication.md` y `02-guides/data-security.md`.
`next.config.ts` tiene **`cacheComponents: true`**: los datos dinámicos (cookies, sesión, DB por request) van dentro
de `<Suspense>`, y lo cacheable con `"use cache"`. Leé `08-caching.md` antes de leer datos en una página.

## Comandos (los checks)
```sh
pnpm lint        # eslint
pnpm typecheck   # next typegen + tsc --noEmit (funciona en un worktree recién creado)
pnpm test        # vitest run
pnpm build       # next build
pnpm exec prisma migrate dev --name <cambio>   # solo si el job tiene prisma/ en su scope
```
Un cambio está en verde cuando pasan los cuatro checks.

## Convenciones del dominio
- **Multi-tenant:** toda query de negocio filtra por `barbershopId`, y ese valor sale de la **sesión del servidor**,
  nunca del cliente. Las páginas públicas `/[slug]` resuelven el tenant por slug y exponen solo campos públicos.
- **Mutaciones:** Server Actions en `src/server/actions/<área>.ts`. Siempre: Zod `safeParse`, después sesión y rol,
  después la query con el `barbershopId` de la sesión. Las lecturas van en `src/server/queries/<área>.ts`.
- **Dinero:** `Decimal` de Prisma, nunca `number` flotante para sumar. Se muestra en ARS con
  `Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })`.
- **Tiempo:** los instantes se guardan en UTC; el día de negocio se calcula en la timezone de la barbería
  (`America/Argentina/Buenos_Aires`) con `src/lib/time.ts`. No uses `new Date().getDate()` para fechas de negocio.
- **UI:** mobile-first (se usa en el mostrador y desde el sillón), componentes de shadcn, tokens de tema
  (`bg-background`, `text-muted-foreground`, …) en lugar de colores crudos. Textos en español rioplatense (vos).
- Server Components por defecto; `"use client"` solo en la hoja interactiva.
- La lógica pura (slots libres, liquidaciones, redondeos) va en `src/lib/` con su test de Vitest.

## Factory: aislamiento
- Cada job corre en el worktree `.worktrees/<job-id>`, sobre la rama `factory/<job-id>`, creada desde `main`.
- Cada worktree tiene su propia base de datos `barber_job_<NNN>` (en su `.env`) y su puerto de dev (slot 1 → 3001, slot 2 → 3002).
- Los archivos de un job (`spec.md`, `build.md`, reviews) viven en **`factory/jobs/<job-id>/` de la raíz del repo**,
  no en la copia que hay dentro del worktree.
- **Hot files:** `package.json`, `pnpm-lock.yaml`, `prisma/schema.prisma`, `prisma/migrations/**`, `src/proxy.ts`,
  `src/lib/auth.ts`, `src/lib/db.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/**`.
  Si un job los toca, tienen que figurar en su scope. Agregar una dependencia toca `package.json` y `pnpm-lock.yaml`.
