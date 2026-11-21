APPROVE

**Motivo:** Las 4 reviews dan PASS, todos los AC tienen evidencia, los checks están en verde y el diff son los 5 archivos del scope, sin tocar auth, schema, dependencias ni env.

## Notas
- Diff (2 commits, 152+/40-): `src/lib/dashboard-nav.ts` y su test, `src/components/dashboard-nav.tsx`, `src/app/(dashboard)/layout.tsx` y `src/app/(dashboard)/dashboard/page.tsx`. Coincide exactamente con los Target Files. No toca `proxy.ts`, `auth.ts`, `session.ts` (solo `import type`), `package.json` ni `prisma/`.
- Es seguro: el rol se filtra en el servidor (`navItemsForRole(session.role)` dentro del `SessionHeader`, bajo el `<Suspense>` que ya existía), y al cliente solo llegan `{href,label}`. La autorización de cada página no cambia.
- `/dashboard` ahora solo hace `redirect("/dashboard/today")` y ya no llama a `requireSession()`. Lo cubren el layout, el proxy y la página de destino. El destino es un literal, así que no hay open redirect. Si un cambio futuro le agrega contenido a esta página, tiene que volver a llamar a `requireSession()`.
- `export const instant = false` en `dashboard/page.tsx` es una opción de segmento poco habitual de Next 16. El build la acepta. Hay que revisarla al actualizar Next.
- AC-6 (viewport de 375px) se verificó por inspección de clases y no con un navegador. Conviene que un humano mire la barra inferior en el celular después del merge.
- Nits opcionales para un job futuro: el estado activo tiene poco contraste (sumar `font-semibold` o un borde superior), los links no tienen `focus-visible:ring` y el mapa de íconos se puede tipar por `href`.
