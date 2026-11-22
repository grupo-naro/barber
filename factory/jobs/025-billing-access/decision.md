ESCALATE

**Motivo:** 4/4 PASS y AC-1..AC-8 con evidencia, pero el diff modifica `src/lib/auth.ts` (tipo `Session` y `lookupSession`), así que no se aprueba sin un humano.

## Notas
- **Por qué escala:** `src/lib/auth.ts` está en el scope del spec, pero es un archivo de autenticación y sesiones, y eso exige revisión humana. El cambio es acotado (32 líneas). Agrega `billingEnabled`, `mpStatus`, `mpInitPoint` y `payerEmail` al `select` y calcula `billingState` después del rechazo por `SUSPENDED`. No toca cookies, hashes, revocación ni el orden de los rechazos. Hay que mirar ese hunk y confirmar que el cobro no invalida la sesión.
- **Resto del diff:** 20 archivos, todos dentro de Target Files. No toca schema ni migraciones, no agrega dependencias, no toca `package.json`, `.env*` ni `src/proxy.ts`, y no borra datos. `invitations.ts`, `account.ts` y `actions/auth.ts` quedan sin tocar, como pide el spec.
- **Reservas públicas (anti-objetivo):** `publicBarbershopWhere` coincide textual con el plan. Los tests contra la DB cubren BLOCKED (sigue publicada y reserva), AWAITING (oculta), EXEMPT (visible) y SUSPENDED (oculta, y `login` rechazado sin cookie).
- **Desvío menor declarado:** el aviso "Pagá con la cuenta de Mercado Pago de <payerEmail>" solo aparece si hay algo para hacer en MP (`pending` con link, o `authorized`). AC-6 pide mostrarlo siempre que haya `payerEmail`. Hay que decidir si se acepta o se vuelve a lo literal.
- **Límite conocido (fuera de alcance):** con el panel bloqueado, el RSC payload de la página igual viaja al cliente. Son datos del propio tenant. Las escrituras sí están cortadas con `requirePanelAccess`.
- **main avanzó con el 026:** antes de mergear, confirmar que no hay conflictos y que los checks siguen en verde sobre el `main` actual. Los dos jobs no comparten archivos, salvo que el 026 haya tocado `src/lib/billing.ts`.
- Si el hunk de auth está bien: `/factory approve`.
