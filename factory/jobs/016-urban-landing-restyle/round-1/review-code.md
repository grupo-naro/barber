VERDICT: CHANGES

## Hallazgos
- [blocking] `src/app/[slug]/layout.tsx:9,16`: Anton y Kaushan Script cargan solo `subsets: ["latin"]`. El nombre de la barbería lo carga el dueño y puede llevar caracteres fuera de Latin-1 (ő, ć, ş, etc.), que caerían a la fuente de fallback → agregar `"latin-ext"` en los `subsets` de las dos fuentes (siguen con `display: "swap"` y un solo peso).
- [blocking] `src/app/[slug]/landing.css:145-148`: `.landing-sticker-sm` no se usa en ningún `.tsx` (grep sobre `src/`) → CSS muerto. Borrar la regla, o usarla donde corresponda.
- [nit] `src/app/[slug]/booking-section.tsx` y otros: hay colores hardcodeados (`border-black`, `bg-white`, `text-black`, `#000`, `#4a4a4a`) mezclados con tokens (`--tinta`, `--tiza`). Funciona, pero se pierde coherencia con los tokens del CSS.

## Revisado
- **Checks:** lint ✅ · typecheck ✅ · test ✅ · build ✅ · `pnpm exec tsx scripts/booking-smoke.ts` OK.
- **Scope:** los 13 archivos del diff están dentro de `src/app/[slug]/**` ✅. `package.json` intacto ✅.
- **Solo presentación:** el diff de `page.tsx`, `booking-form.tsx`, `booking-section.tsx`, `gallery.tsx`, `hero.tsx`, `hours-section.tsx` y `floating-whatsapp.tsx` cambia clases, wrappers y el `PoleDivider` decorativo. No toca data, queries, actions, `searchParams` ni `landing-format.ts` ✅.
- **Fuentes:** `next/font/google` solo en `[slug]/layout.tsx`, con `display: "swap"` y variables CSS en el wrapper. Bodoni Moda y la paleta tabaco/latón ya no aparecen en `src/app/[slug]/` (grep → 0).
- **Alcance del CSS:** `landing.css` se importa solo desde `[slug]/layout.tsx`. Casi todo cuelga de `.landing-theme`. Los únicos selectores globales son `html:has(.landing-theme)` y `body:has(.landing-theme)`, que se activan solo en la página pública, así que no afectan al dashboard ni a `/login`.
- **Reduced motion:** el scroll suave, el giro del poste y las transiciones quedan bajo `no-preference` o `none`. Los skeletons usan `motion-safe:animate-pulse`. Las rotaciones son estáticas.
- **Cliente/servidor:** `"use client"` queda igual que antes (gallery, floating-whatsapp, booking-form). `ui.tsx` no suma directivas.
- **TypeScript estricto:** sin `any`, `@ts-ignore` ni `!`. El `eslint-disable no-img-element` se conserva, justificado.
- **AC-1..AC-6:** consistentes con el código ✅, salvo los dos ítems de arriba.
