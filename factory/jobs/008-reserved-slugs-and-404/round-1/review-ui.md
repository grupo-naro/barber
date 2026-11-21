VERDICT: PASS

## Hallazgos
- [nit] `src/app/[slug]/not-found.tsx:5` y `src/app/not-found.tsx:12`: el `<main>` es casi idéntico en ambos archivos (duplicación menor, aceptable por ahora) → opcional extraer un componente compartido.
- [nit] `src/app/[slug]/not-found.tsx`: el 404 de barbería no ofrece más que "Ir al inicio"; está bien para v1.

## Revisado
Ambas páginas 404 usan tokens (`text-muted-foreground`, body con `bg-background text-foreground`, dark mode heredado), `buttonVariants` de shadcn (exportado), `flex-1` correcto con body `flex flex-col`, `max-w-xl px-4` sin desborde desde 360px, jerarquía clara y sin colores crudos.
