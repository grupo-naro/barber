ESCALATE

**Motivo:** Una parte de AC-5 no se cumple: un slug inexistente cae en el `not-found` global (por el rewrite de `src/proxy.ts`), no en el restilizado. Todo lo demás está en verde y tiene bajo riesgo.

## Notas
- **Lo que falla:** AC-5 pide "un slug inexistente da 404 y `not-found` se ve con el estilo nuevo". `build.md` muestra que el 404 funciona, pero `src/proxy.ts` hace rewrite al `src/app/not-found.tsx` global (sin cambios, igual que en 015). Por eso `[slug]/not-found.tsx`, que sí quedó restilizado, solo se ve cuando la página llama a `notFound()`. Arreglarlo implica tocar `src/proxy.ts` o `src/app/not-found.tsx`, que están fuera de scope y son hot files. Los reviewers lo dejaron como deuda conocida.
- **Recomendación:** si esa deuda se acepta, `/factory approve` es seguro. El fix del 404 iría en un job aparte con `src/proxy.ts` o `src/app/not-found.tsx` en su scope.
- **Reviews:** las 4 de la ronda 2 dicen PASS (code, security, ui y ux). El bloqueante de code de la ronda 1 (subsets `latin-ext` y CSS muerto) está resuelto.
- **Checks:** lint, typecheck, test (205/205) y build en verde. La reserva de punta a punta, el lightbox, el WhatsApp flotante, "hoy" con `aria-current`, los `rel` de los links externos y el OG están reverificados.
- **Scope:** el diff toca 13 archivos, todos en `src/app/[slug]/**`, y es solo presentación. No toca auth, proxy, schema, migraciones, `package.json` ni el lockfile, y no agrega env vars ni secretos. Las fuentes nuevas (Anton y Kaushan Script) vienen de `next/font/google`, no son dependencias npm. `landing-format.ts`, `data.ts`, las queries y las actions no cambiaron.
- **Nits de UI que quedaron:** en 1024-1100px la banda del poste en el hero con portada puede quedar casi tangente al texto (no se probó ese ancho). Además, `landing.css` mezcla `#000`/`#fff` hardcodeados con los tokens.
