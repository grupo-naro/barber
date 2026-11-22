VERDICT: PASS

## Hallazgos
- [nit] `src/app/(dashboard)/billing-gate.tsx:74`: el aviso del `payerEmail` solo se muestra si hay link de MP o `authorized` (desvío menor ya declarado en build.md). Es razonable; no bloquea.
- [nit] El corte de lectura por layout no impide que el RSC payload de la página viaje (límite conocido y aceptado en "Fuera de alcance"). Las escrituras sí están cortadas por `requirePanelAccess`.

## Revisado
lint ✅ · typecheck ✅ · test ✅ (23 archivos, 375 tests) · build ✅ · scope ✅ (20 archivos, todos dentro de Target Files) · AC-1..AC-8 ✅

Notas de verificación:
- `publicBarbershopWhere` coincide textualmente con el plan y reemplaza cada `status: "ACTIVE"` de las queries públicas (booking, landing, slug-exists, y el filtro de relación de `getOnlineServices`).
- `requirePanelAccess` está en cada action exportada de records (5), services (4) y cash (1), y en `ownerSession()` de barbers, barbershop y landing. No está en `account.ts` ni en `auth.ts`.
- El layout y las páginas no llaman a `requirePanelAccess`, así que no hay loop de redirect.
- El gate del BARBER no lee `PlatformSettings` ni recibe `payerEmail` ni `mpInitPoint`. Todo es Server Component.
- `lookupSession` calcula `billingState` después del rechazo por `SUSPENDED` y no invalida la sesión.
- La fecha del banner de GRACE usa `formatDateAR` con la timezone de la barbería, con test de borde de medianoche.
