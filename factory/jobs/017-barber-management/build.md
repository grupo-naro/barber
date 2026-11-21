# Build: 017-barber-management
**Rama:** factory/017-barber-management · **Commit:** 82758af · **Worktree:** .worktrees/017-barber-management

## Qué cambió
- `prisma/schema.prisma`: nuevo modelo `Invitation` (userId/barbershopId con `onDelete: Cascade`, `tokenHash @unique`, `expiresAt`, `usedAt?`, `createdAt`, `@@index([userId])`) y sus relaciones en `User` y `Barbershop`.
- `prisma/migrations/20261121155934_invitations/migration.sql`: migración que crea la tabla, el índice único y los FKs.
- `src/lib/invitations.ts`: token de 32 bytes en base64url, `hashInvitationToken` (sha256 hex, **async** vía Web Crypto), `invitationExpiresAt` (+48 h), `isInvitationUsable`, `isPlausibleInvitationToken`, `invitationPath`, el texto del mensaje y `whatsappInviteUrl` (wa.me sin teléfono).
- `src/lib/invitations.test.ts`: forma y entropía del token, que no se repita (1000), hash determinístico, igual a `node:crypto` y distinto del token, borde de las 48 h, usada → no usable, texto de wa.me codificado.
- `src/lib/barbers.ts`: los schemas Zod `createBarberSchema`, `updateBarberSchema` (reusa las reglas de liquidación), `choosePasswordSchema` y `changePasswordSchema`, más `barberAccessStatus`.
- `src/lib/barbers.test.ts`: normalización del email, emails inválidos, largo del nombre, reglas de payout, contraseña corta o larga, confirmación distinta y contraseña actual vacía.
- `src/lib/barbershop-settings.ts`: extraje `payoutFields` y `resolvePayoutValue` para que los usen `payoutSchema` y `updateBarberSchema`. El comportamiento no cambia y los tests existentes pasan sin tocarlos.
- `src/lib/slugs.ts` / `src/lib/slugs.test.ts`: `invitacion` entra en `RESERVED_SLUGS`, con su caso de test.
- `src/proxy.test.ts`: con `/invitacion/abc`, `decideRoute` da `next` sin sesión y `decidePublicSlug` da `skip` sin ir a la DB. `/invitacion` suelto da `not-found`.
- `src/lib/dashboard-nav.ts` / `.test.ts`: nuevo ítem "Barberos", solo para OWNER, entre Caja y Configuración, con sus tests.
- `src/components/dashboard-nav.tsx`: ícono `Users` para `/dashboard/barbers`.
- `src/app/(dashboard)/layout.tsx`: link "Mi cuenta" (`h-11 min-w-11`, ícono `CircleUser`) al lado de "Cerrar sesión", para cualquier rol.
- `src/app/(dashboard)/dashboard/barbers/page.tsx`: con `requireRole("OWNER")`, una card "Agregar barbero" y la lista del equipo con su badge (Dueño/a, Activo o Invitación pendiente) y link al detalle.
- `src/app/(dashboard)/dashboard/barbers/create-barber-form.tsx`: formulario de nombre y email. El link de invitación vive solo en el estado de `useActionState`.
- `src/app/(dashboard)/dashboard/barbers/invite-link.tsx`: arma la URL con `window.location.origin` y muestra "Copiar" (clipboard) y "Enviar por WhatsApp" (`target="_blank"`, `rel="noopener noreferrer"`).
- `src/app/(dashboard)/dashboard/barbers/format.ts`: `describePayout`, que antes estaba en `payout-form.tsx`.
- `src/app/(dashboard)/dashboard/barbers/[id]/page.tsx`: detalle del barbero. Busca por `id` y `barbershopId` y da `notFound()` si no lo encuentra. La card "Invitación" solo aparece si el barbero está pendiente.
- `src/app/(dashboard)/dashboard/barbers/[id]/barber-form.tsx`: edición del nombre y de la liquidación.
- `src/app/(dashboard)/dashboard/barbers/[id]/regenerate-form.tsx`: botón "Generar nuevo link".
- `src/app/(dashboard)/dashboard/account/page.tsx` y `password-form.tsx`: "Mi cuenta" con `requireSession` y el formulario para cambiar la contraseña.
- `src/app/(dashboard)/dashboard/settings/page.tsx`: saqué la card "Liquidaciones". `payout-form.tsx` está **borrado**.
- `src/app/(auth)/invitacion/[token]/page.tsx`: página pública. `params` y `connection()` van dentro de `<Suspense>`, con `robots: { index: false, follow: false }` y `referrer: "no-referrer"`. Si la invitación no sirve, muestra el mensaje genérico.
- `src/app/(auth)/invitacion/[token]/accept-form.tsx`: formulario de contraseña y confirmación.
- `src/server/actions/barbers.ts`: `createBarber`, `regenerateInvitation` y `updateBarber` (que reemplaza a `updateBarberPayout`).
- `src/server/actions/invitations.ts`: `acceptInvitation`.
- `src/server/actions/account.ts`: `changePassword`.
- `src/server/actions/barbershop.ts`: saqué `updateBarberPayout` y los imports que ya no se usaban.
- `src/server/queries/barbers.ts`: `listBarbers`, `getBarber` (por id y barbershopId) y `getUsableInvitation`. Devuelven solo el estado derivado, nunca hashes.
- `src/server/queries/barbershop.ts`: saqué `users` y `SettingsUser` de `getBarbershopSettings`, que ya no los usaba nadie.

No toqué `src/proxy.ts`, `src/lib/auth.ts` ni `src/server/actions/auth.ts`, y no hizo falta. Las 33 rutas de `git diff --name-only main...HEAD` están dentro del scope.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | Modelo y migración aplicados en `barber_job_017`. Pasan los tests de `invitations.test.ts` y `barbers.test.ts`. En la DB, el `tokenHash` cumple `^[0-9a-f]{64}$` y es igual a `encode(sha256(token))` de Postgres; `tokenHash = token` da `f`. La vigencia (`expiresAt - createdAt`) es de ≈48 h. |
| AC-2 | ✅ | El OWNER ve en `/dashboard/barbers` "Dueño/a", "Activo" e "Invitación pendiente". Si entra un BARBER, el stream trae `NEXT_REDIRECT;replace;/dashboard` y no llega ningún dato de la lista: no aparece "Agregar barbero" ni el email de otro barbero. Los tests de nav pasan, y el BARBER ve solo `/dashboard/today` y `/dashboard/account`. |
| AC-3 | ✅ | `createBarber` (curl con `Next-Action`) devuelve `invitePath` `/invitacion/<43 chars>`. Si se recarga `/dashboard/barbers`, no aparece ningún `invitacion/` y el barbero figura como "Invitación pendiente". Un email repetido de la misma barbería o de `otra-barberia` da "Ese email no está disponible." y no crea nada. Con "Generar nuevo link" sale un token distinto, el viejo pasa a ser inválido y el nuevo funciona. Si el barbero ya está activo, devuelve "Este barbero ya activó su cuenta…" y el botón no se muestra. |
| AC-4 | ✅ | El detalle de un id de otra barbería da `NEXT_HTTP_ERROR_FALLBACK;404` y no muestra datos. Pasarle a `updateBarber` y `regenerateInvitation` un userId de otra barbería da "No encontramos ese usuario en tu barbería.". La edición propia (nombre "Nuevo Editado", PERCENTAGE `45,5`) se guarda y se muestra como "45,5 % de lo facturado". Con 101 da error en `payoutValue`. Configuración ya no tiene "Liquidaciones" y conserva Perfil, Página pública y Horarios. `/dashboard/cash` responde 200. |
| AC-5 | ✅ | Con un token válido, la página muestra "Sumate a Barbería Demo" y "Nuevo Barbero", sin el email, con `noindex` y `no-referrer`. Un token inválido, vencido (`expiresAt` puesto en el pasado) o ya usado muestra el mismo mensaje. Si la confirmación no coincide, da error en el campo. Al aceptar se setea la cookie de sesión y redirige a `/dashboard/today`. Un segundo envío no crea cookie y da el mensaje genérico. Con 3 aceptaciones concurrentes del mismo token, solo una crea sesión (`1 0 0`). Pedir `/invitacion` suelto da 404. |
| AC-6 | ✅ | El login de un barbero pendiente, con cualquier contraseña, da "Email o contraseña incorrectos" y no hay `Set-Cookie`. Después de aceptar, entra con la contraseña que eligió y recibe `Set-Cookie`. |
| AC-7 | ✅ | `/dashboard/account` muestra "Cambiar mi contraseña" (lo probé como BARBER). Sin sesión, redirige a `/login?next=%2Fdashboard%2Faccount`. Con la contraseña actual mal da "La contraseña actual no es correcta.". El cambio exitoso funciona aunque le inyecté un `userId` del OWNER en el form: el login nuevo del barbero funciona y el OWNER sigue entrando con `barber123`. El link en el header aparece para ambos roles y no está en la nav inferior. |
| AC-8 | ✅ | Los cuatro checks están en verde (ver abajo). La UI usa solo componentes de shadcn que ya existían y tokens de tema, y los textos están en rioplatense. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (234) · build ✅

## Notas
- `hashInvitationToken` devuelve `Promise<string>`. Al principio usaba `node:crypto`, pero como `whatsappInviteUrl` se importa desde un Client Component, Turbopack metía `crypto-browserify` en ese chunk (≈450 KB). Ahora `invitations.ts` usa Web Crypto (`crypto.getRandomValues`, `crypto.subtle.digest`) y el chunk quedó en ≈18 KB. El test compara el resultado contra `node:crypto`.
- La página de invitación llama a `await connection()` porque, con `cacheComponents`, el `new Date()` de la consulta fallaba en el prerender.
- Al aceptar, la action marca como usadas en la misma transacción las demás invitaciones pendientes del usuario. Regenerar el link pone `usedAt` en las anteriores sin usar.
- Para las pruebas e2e usé `pnpm start -p 3001` y curl con `Next-Action`, con un script en el scratchpad que no commiteé. En la versión de React de este repo, los campos de FormData van con el prefijo `_1_`. Ya apagué el server y corrí `pnpm exec prisma db seed` en `barber_job_017`. Las pruebas dejaron en esa base usuarios de ejemplo (`nuevo.barbero@`, `pend@`, `vence@example.com`).
- Con 5 ítems, la barra inferior en mobile queda más apretada: cada ítem tiene ≈75 px en 375 px de ancho.

## Respuesta a la ronda 1
**Commit:** 816edef · lint ✅ · typecheck ✅ · test ✅ (234) · build ✅

- ui [blocking] la nav mobile con 5 ítems no entraba → el label pasó de "Configuración" a **"Ajustes"**. También cambié el `h1` y el title de `/dashboard/settings` para que coincidan. Además, para que aguante si un label se alarga: `li` con `min-w-0`, link con `px-1` y `<span class="max-w-full truncate">`. Conservé `min-h-14` (≥44 px) y el estado activo. Agregué un test en `dashboard-nav.test.ts` que limita los labels del OWNER a ≤9 caracteres. La nav del BARBER no cambia: solo tiene "Hoy" y "Mi cuenta" sigue en el header.
- code [blocking] `payoutSchema`, `PayoutInput` y `PayoutData` habían quedado muertos → los borré de `barbershop-settings.ts`. Moví sus casos (0/100/40,5/99.99, 101/100.01/-1/-0.5/1000, FIXED_RENT con 2 decimales y los inválidos, NONE → "0", userId vacío) a `updateBarberSchema` en `barbers.test.ts`. Actualicé el comentario de `barbers.ts`.
- code [nit] la cabecera larga de `actions/barbershop.ts` → la partí en 3 líneas.
- security [nit] `regenerateInvitation` sin Zod → ahora hace `regenerateInvitationSchema.safeParse` (`userIdField` exportado desde `src/lib/barbers.ts`, con test).
- security [nit] el token en `acceptInvitation` sin Zod → ahora usa `z.string().refine(isPlausibleInvitationToken)`.
- security [nit] la rotación de sesión al cambiar la contraseña queda fuera de alcance, según el spec. No la hice.
- ui [nit] el error de "Copiar" se veía en gris → ahora usa `text-destructive`.
- ui [nit] el badge "Invitación pendiente" en color primario → ahora es `secondary`. El nuevo componente `barbers/status-badge.tsx` reúne los badges de lista y detalle.
- ui [nit] el `min-w-0` del header ya estaba, no hubo que cambiar nada.
- ux [nit] el aviso de que el link no se vuelve a mostrar → ahora va en un recuadro con `font-medium text-foreground`.
- ux [nit] el estado "Link vencido" → `barberAccessStatus` devuelve ACTIVE, PENDING o EXPIRED según la invitación sin usar más reciente, con tests que incluyen el borde. La query trae solo esa invitación (`take: 1`, solo `expiresAt`). En el detalle, si el link venció, el botón "Generar nuevo link" aparece igual, con un texto específico. Lo verifiqué con curl: un barbero con el link vencido muestra "Link vencido"; después de regenerar, muestra "Invitación pendiente".
- ux [nit] `aria-disabled` en el botón de WhatsApp mientras todavía no hay origin.
- ux [nit] `minLength` en la confirmación: no lo agregué, porque la validación es del servidor y el error se muestra junto al campo.
- Fuera de scope, para avisar: `src/app/(dashboard)/dashboard/cash/page.tsx:127` sigue diciendo "(Configuración → Liquidaciones)". Ahora debería decir "Barberos". No lo toqué porque no está en Target Files. Es un cambio de una línea para un job posterior, o para ampliar el scope.
- Scope ampliado (`cash/page.tsx`): en la card "Liquidación por barbero", el texto de los días abiertos ahora dice "Según el acuerdo vigente de cada barbero (se edita en [Barberos](/dashboard/barbers))." No toqué nada más de ese archivo. **Commit:** 77a0efc · lint ✅ · typecheck ✅ · test ✅ (234) · build ✅
