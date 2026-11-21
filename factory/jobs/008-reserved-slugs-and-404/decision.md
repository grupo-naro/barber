ESCALATE

**Motivo:** Todo en verde (4 reviews PASS, AC-1..AC-6 con evidencia, diff dentro del scope), pero modifica `src/proxy.ts` (hot file de auth): requiere aprobación humana.

## Notas
- Única razón para escalar: la regla dura "no tocar `src/lib/auth.ts` / `src/proxy.ts`". El spec ya lo anticipaba ("toca `src/proxy.ts`… escalar a humano").
- Qué mirar en `src/proxy.ts`:
  - La rama de sesión no cambia: `needsSession` (`/login` o `isPrivatePath`) se evalúa antes del chequeo de slug. `decideRoute`/`safeNextPath` intactos y con sus tests verdes; AC-4 confirma `/dashboard` → 307 a `/login?next=%2Fdashboard`.
  - El matcher suma `"/:slug([^/.]+)"`, sin el lookahead `(?!_next|api)` del spec (desvío justificado: no excluir slugs válidos como `apis-barber`). `/_next` y `/api` sueltos son reservados → 404 sin DB; multi-segmento y paths con punto quedan afuera. Todas las entradas anteriores del matcher se mantienen.
  - Proxy ahora consulta Postgres (import diferido de `src/server/queries/slug-exists.ts`, `findUnique` por índice único con `select: { id: true }`) en cada `/<slug-válido>`, incluidos prefetch RSC y POST de Server Action. Fail-open con `console.error` si la DB falla (no probado end-to-end).
  - 404 vía `NextResponse.rewrite` a la constante `/_not-found-slug/x`; verificado 404 desde el primer request con `next start`, también con `RSC: 1`.
- Sin schema, migraciones, dependencias nuevas, borrado de datos ni env/secretos. 8 archivos, todos en Target Files.
- Seguimientos sugeridos por las reviews (no bloquean): rate limit o cache corta de negativos para el lookup en Proxy; loguear solo `error.message` en el fail-open; ajustes de copy en mensajes de slug y en las 404 (evitar "slug", sugerir pedir el link de nuevo).
