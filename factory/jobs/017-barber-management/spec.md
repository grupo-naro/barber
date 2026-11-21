# Gestión de barberos con link de invitación

**Pedido:** "No tengo la opción de agregar barberos."

## Contexto
- `User` (`prisma/schema.prisma`): `role` OWNER/BARBER, `passwordHash String?`, `active`, `payoutScheme`/`payoutValue`
  (Decimal 12,2), `email @unique` **global** (entre todas las barberías). No existe ningún modelo de invitación.
- Auth: `src/lib/auth.ts` (`getSession`, `requireSession`, `requireRole`, `createSession`), `src/lib/session.ts` (JWT),
  `src/lib/password.ts` (`hashPassword`/`verifyPassword` scrypt). `login` en `src/server/actions/auth.ts` ya rechaza
  usuarios con `passwordHash` null (`!user.passwordHash` → error genérico); hay que mantenerlo y cubrirlo con el criterio.
- Proxy (`src/proxy.ts`): el matcher solo corre en `/:slug` (un segmento), `/login` y `/dashboard/:path*` (etc.).
  `/dashboard/barbers/**` y `/dashboard/account` ya quedan privados sin cambiar el proxy. `/invitacion/<token>` tiene
  dos segmentos: `publicSlugFromPath` → `null` y el matcher no lo toma, así que es público y no da 404. `/invitacion`
  suelto es un segmento: hay que agregar `invitacion` a `RESERVED_SLUGS` (`src/lib/slugs.ts`) para que ninguna
  barbería pueda usarlo como slug. **No hace falta tocar `src/proxy.ts` ni `src/lib/auth.ts`.** Si el builder cree que
  sí, que pare y lo diga.
- Liquidaciones hoy: `src/app/(dashboard)/dashboard/settings/payout-form.tsx` (`PayoutList`) en la card
  "Liquidaciones" de `settings/page.tsx`, la action `updateBarberPayout` en `src/server/actions/barbershop.ts`
  (`updateMany` con `barbershopId` de la sesión), `payoutSchema`/`PAYOUT_SCHEME_LABELS` en
  `src/lib/barbershop-settings.ts` (también los usa `cash/page.tsx`), y `users` en `getBarbershopSettings`
  (`src/server/queries/barbershop.ts`).
- Nav: `src/lib/dashboard-nav.ts` (`NAV_ITEMS`, `ownerOnly`) + íconos en `src/components/dashboard-nav.tsx`. El header
  con "Cerrar sesión" está en `src/app/(dashboard)/layout.tsx`.
- Componentes de shadcn disponibles: badge, button, card, input, label. **No agregues componentes nuevos de shadcn.**
- Docs de Next 16 que tiene que leer el builder (`node_modules/next/dist/docs/01-app/`): `02-guides/authentication.md`,
  `02-guides/data-security.md`, `02-guides/forms.md`, `02-guides/server-actions.md`,
  `02-guides/authentication-with-cache-components.md`, `01-getting-started/08-caching.md` (`cacheComponents: true`:
  sesión, `params` y DB van dentro de `<Suspense>`; `params` es asíncrono) y `01-getting-started/16-proxy.md`.

## Criterios de aceptación
- **AC-1 Schema y lógica pura.** Nuevo modelo `Invitation` (`id`, `userId` → User, `barbershopId` → Barbershop,
  `tokenHash String @unique`, `expiresAt`, `usedAt DateTime?`, `createdAt`, `onDelete: Cascade`, índice por `userId`)
  con su migración en `prisma/migrations/`. En `src/lib/invitations.ts` (sin Prisma ni Next): generar el token
  (`randomBytes` ≥ 32 bytes, base64url), `hashInvitationToken` (sha256 hex), `invitationExpiresAt(now)` (= now + 48 h),
  `isInvitationUsable({ expiresAt, usedAt }, now)` y un builder del link de WhatsApp
  (`https://wa.me/?text=<encodeURIComponent(texto con nombre de la barbería + link)>`). En `src/lib/barbers.ts`: los
  schemas Zod (crear barbero: nombre 1–80 y email normalizado con trim y minúsculas; editar barbero: nombre + payout,
  reutilizando las reglas de `payoutSchema`; elegir contraseña: 8–200 caracteres más confirmación igual; cambiar
  contraseña: actual + nueva + confirmación). Tests de Vitest en `src/lib/invitations.test.ts` y
  `src/lib/barbers.test.ts`: el hash es determinístico y no es igual al token; dos tokens nunca se repiten; el límite
  de 48 h (vencido justo en el borde); usado → no usable; el texto de wa.me sale codificado; confirmación distinta,
  contraseña corta y email inválido se rechazan. En la DB **nunca** se guarda el token crudo, solo `tokenHash`.
- **AC-2 Pantalla "Barberos" (solo OWNER).** `/dashboard/barbers` usa `requireRole("OWNER")`. Un BARBER que entra
  ahí es redirigido. Lista los usuarios de la barbería de la sesión: el dueño marcado ("Dueño/a") y cada barbero con
  su estado, "Activo" (`passwordHash` no null) o "Invitación pendiente". Cada barbero linkea a su detalle.
  `navItemsForRole("OWNER")` incluye `{ href: "/dashboard/barbers", label: "Barberos" }` (con ícono en
  `dashboard-nav.tsx`) y `navItemsForRole("BARBER")` no lo incluye. Se actualiza `src/lib/dashboard-nav.test.ts`.
- **AC-3 Crear barbero e invitar.** Un formulario en `/dashboard/barbers` (nombre + email) llama a una Server Action
  (`src/server/actions/barbers.ts`) que hace Zod `safeParse` → sesión OWNER → crea, en una transacción, el `User`
  (`role: BARBER`, `passwordHash: null`, `barbershopId` **de la sesión**) y un `Invitation` con el hash. La respuesta
  devuelve el path `/invitacion/<token>` **una sola vez**. El cliente arma la URL absoluta con
  `window.location.origin` y muestra los botones "Copiar" (clipboard) y "Enviar por WhatsApp" (abre wa.me en una
  pestaña nueva, sin pedir teléfono). Al recargar la página el link ya no aparece. Si el email ya existe en
  **cualquier** barbería (chequeo previo o `P2002`), se muestra el error genérico "Ese email no está disponible." y no
  se crea nada. En el detalle de un barbero **pendiente** hay un botón "Generar nuevo link": invalida las invitaciones
  previas sin usar de ese usuario (las borra o les pone `usedAt`), crea una nueva y la muestra igual que arriba. Si el
  barbero ya está activo, la action lo rechaza y la UI no muestra el botón.
- **AC-4 Detalle del barbero y liquidaciones.** `/dashboard/barbers/[id]` (OWNER) permite editar el nombre y la
  liquidación (PERCENTAGE / FIXED_RENT / NONE + valor, con `Prisma.Decimal`, mismas reglas que hoy). Todas las
  lecturas y mutaciones filtran por `id` **y** `barbershopId` de la sesión: un `id` de otra barbería en la URL da
  `notFound()`, y en la action (`updateMany`/`findFirst` con `barbershopId`) devuelve "No encontramos ese usuario en tu
  barbería." sin tocar nada (IDOR). La card "Liquidaciones" y `payout-form.tsx` se eliminan de Configuración, y
  `updateBarberPayout` sale de `barbershop.ts` (o se mueve a `barbers.ts`). El resto de Configuración (perfil, página
  pública, horarios) queda igual. `cash/page.tsx` sigue compilando y mostrando los labels.
- **AC-5 Aceptar invitación.** La página pública `/invitacion/[token]` (`src/app/(auth)/invitacion/[token]/`, con
  `params` asíncrono dentro de `<Suspense>`) busca la invitación por `hashInvitationToken(token)` (lookup por hash
  único, sin comparar el token crudo). Si es usable y el usuario sigue con `passwordHash` null, muestra el nombre de
  la barbería y el del barbero, y un formulario de contraseña + confirmación. Al enviar, la action vuelve a validar
  todo del lado del servidor y en una transacción: marca `usedAt` con un `updateMany` condicionado a `usedAt: null`
  (si `count !== 1`, falla, para que dos envíos concurrentes no activen dos veces), setea `passwordHash` con
  `hashPassword`, después llama a `createSession` y redirige a `/dashboard/today`. Si el token es inválido, está
  vencido o ya se usó, siempre muestra el mismo mensaje ("Este link de invitación no es válido o venció. Pedile uno
  nuevo a tu barbería."), sin revelar el email ni si el token existió. La página lleva
  `robots: { index: false }`. `invitacion` está en `RESERVED_SLUGS` (se agrega un caso a `src/lib/slugs.test.ts`) y
  `src/proxy.test.ts` tiene un caso que muestra que `/invitacion/abc` no requiere sesión (`decideRoute` → `next`) y
  que `decidePublicSlug` → `skip`.
- **AC-6 Sin contraseña no hay login.** Un barbero con invitación pendiente que intenta loguearse desde `/login` con
  cualquier contraseña recibe "Email o contraseña incorrectos" y no se crea la cookie de sesión (el comportamiento
  actual de `login` se mantiene). Después de aceptar la invitación, puede loguearse con la contraseña que eligió.
- **AC-7 "Cambiar mi contraseña".** `/dashboard/account` (cualquier sesión, `requireSession`) tiene un formulario con
  contraseña actual + nueva + confirmación. La action (`src/server/actions/account.ts`) usa el `userId` **de la
  sesión** (nunca del form), verifica la actual con `verifyPassword` (si no coincide: "La contraseña actual no es
  correcta.") y guarda la nueva con `hashPassword`. Se llega desde el header del layout del panel (link "Mi cuenta"
  al lado de "Cerrar sesión", con touch target ≥ 44 px), tanto para OWNER como para BARBER. No se agrega a la barra
  de nav inferior.
- **AC-8** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan. La UI es mobile-first, usa los
  componentes de shadcn existentes y tokens de tema, y los textos están en español rioplatense.

## Target Files (Scope)
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `src/lib/invitations.ts`
- `src/lib/invitations.test.ts`
- `src/lib/barbers.ts`
- `src/lib/barbers.test.ts`
- `src/lib/barbershop-settings.ts`
- `src/lib/barbershop-settings.test.ts`
- `src/lib/slugs.ts`
- `src/lib/slugs.test.ts`
- `src/proxy.test.ts`
- `src/lib/dashboard-nav.ts`
- `src/lib/dashboard-nav.test.ts`
- `src/components/dashboard-nav.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/dashboard/barbers/**`
- `src/app/(dashboard)/dashboard/account/**`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/app/(dashboard)/dashboard/settings/payout-form.tsx`
- `src/app/(auth)/invitacion/**`
- `src/server/actions/barbers.ts`
- `src/server/actions/account.ts`
- `src/server/actions/invitations.ts`
- `src/server/actions/barbershop.ts`
- `src/server/queries/barbers.ts`
- `src/server/queries/barbershop.ts`

## Fuera de alcance
- Desactivar o borrar barberos, y resetear el acceso de un barbero que ya activó su cuenta (decisión del dueño).
- Cambiar el email de un usuario, o que el OWNER invite a otro OWNER o cambie roles.
- Mandar emails o integrar la API de WhatsApp: solo un link `wa.me` sin teléfono.
- Rate limiting del endpoint de aceptación o del login, e invalidar otras sesiones al cambiar la contraseña
  (el JWT es stateless).
- Ocultar a los barberos pendientes de los selectores de walk-in, turnos o caja (`listActiveBarbers`, etc.).
- Tocar `src/proxy.ts` o `src/lib/auth.ts`, agregar dependencias, componentes de shadcn o variables de entorno
  (por ejemplo `APP_URL`).

## Riesgos
- **Cambio de schema y migración** (`Invitation`): hot files `prisma/schema.prisma` y `prisma/migrations/**`. Hay que
  escalarlo a un humano.
- **Auth:** se agrega una ruta pública que crea una sesión. El token tiene que tener ≥ 256 bits de entropía, guardarse
  solo hasheado, ser de un solo uso (con `updateMany` condicionado a `usedAt: null`) y vencer a las 48 h. El token va
  en la URL (historial, referer), así que la página no carga recursos de terceros. Los mensajes no tienen que permitir
  enumerar usuarios ni emails.
- **Multi-tenant e IDOR:** todo `userId` que venga de la URL o del form se filtra por el `barbershopId` de la sesión.
  `Invitation.barbershopId` tiene que coincidir con el `barbershopId` del usuario. La sesión que se crea al aceptar
  sale del `User` en la DB, no del form.
- **Email único global:** el error tiene que ser genérico para no filtrar qué emails existen en otras barberías.
- **Dinero:** `payoutValue` se sigue guardando como `Prisma.Decimal`, sin float.
- Dependencias nuevas: ninguna.
