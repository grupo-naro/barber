# Colores editables de la landing pública

**Pedido:** "Quiero poder editar los colores de la página principal. El diseño (urbano, del logo) está muy bueno y no quiero cambiarlo, sino los colores: que alguien con un logo diferente pueda, por ejemplo, en vez del azul que predomine el verde. Se puede editar, pero el diseño se mantiene 100% como está."

## Contexto
- **Tema actual** (`src/app/[slug]/landing.css`, job 016): en `.landing-theme` están `--tinta #000`, `--asfalto #161616`, `--tiza #fff`, **`--royal #1f2e9a`**, **`--rojo #d7191f`**, **`--rojo-claro #ff6b70`** y `--pole` (gradiente que usa `var(--royal)`/`var(--rojo)`). `.landing-theme.dark` mapea los tokens de shadcn (`--primary: var(--rojo)`, `--destructive: var(--rojo-claro)`). `.landing-royal` usa `--royal` de fondo y tiene un **hex fijo derivado del azul**: `--muted-foreground: #dfe3ff`. `::selection` usa `--rojo`. `html/body:has(.landing-theme)` es `#000` (fijo, no cambia).
- **Usos de los acentos** (todos vía `var()`, no hay otros hex de acento en `src/app/[slug]/**`): `hero.tsx` (text-shadow royal, sombra royal, íconos y hover `--rojo-claro`), `hours-section.tsx` (sección `landing-royal`, fila "hoy" `bg-[var(--rojo)] text-white`), `booking-section.tsx`/`booking-form.tsx`/`gallery.tsx` (sombras de sticker), `footer.tsx` (link `--rojo-claro`), `not-found.tsx` (text-shadow royal, sombra rojo), `.landing-tag` (text-shadow rojo).
- **Raíz del tema:** `src/app/[slug]/layout.tsx` renderiza el `<div class="dark landing-theme ...">`, que envuelve también `not-found.tsx`. Hoy no lee datos. Ojo: `--pole` se calcula en el elemento donde se declara, así que las variables nuevas tienen que estar **en ese mismo elemento raíz** (pisarlas en un hijo no cambia la franja).
- **Lecturas públicas:** `src/app/[slug]/data.ts` (`getCachedBarbershop`/`getCachedLanding` con `"use cache"`, `cacheLife("minutes")` y `cacheTag(barbershopBrandingTag(slug))`). `src/server/queries/landing.ts` tiene `getPublicLanding(slug)` (solo campos públicos, `status: "ACTIVE"`) y `getLandingSettings(barbershopId)` para el panel. `page.tsx` tiene `generateStaticParams` (placeholder), `instant = false` y `generateMetadata`. **No hay `themeColor`/`viewport`**, así que no hay nada que aplicar ahí.
- **Panel:** `src/app/(dashboard)/dashboard/settings/page.tsx`, con la Card "Página pública" que contiene `landing-form.tsx`. Las acciones están en `src/server/actions/landing.ts`: `ownerSession()` (solo OWNER) y `invalidate(session)`, que hace `updateTag(barbershopBrandingTag(slug))` y `revalidatePath("/dashboard/settings")`. El patrón de resultado es `ActionResult`/`firstFieldErrors` de `src/lib/barbershop-settings.ts`.
- **Schema:** `Barbershop` no tiene campos de color.
- **Tabla de contraste vigente:** `factory/jobs/016-urban-landing-restyle/build.md` § "Contraste".
- **Docs de Next 16 para el builder:** `node_modules/next/dist/docs/01-app/` → `08-caching.md` (`"use cache"`, `cacheTag`, `updateTag`, y qué pasa al leer `params`/datos en un layout con `cacheComponents: true`), la API reference de `layout` (`params` async) y la de `generateStaticParams`.

## Criterios de aceptación
- **AC-1 Schema y defaults idénticos.** `Barbershop` gana `brandPrimary String?` y `brandSecondary String?` (migración con `prisma migrate dev --name brand-colors`; `null` = color original). Con los dos en `null`, el HTML/CSS de `/<slug>` queda **idéntico al de hoy**: sin `style` de colores en la raíz, o con exactamente `#1f2e9a`/`#d7191f`/`#ff6b70`/`#dfe3ff`. Se verifica con un test de Vitest sobre la función de AC-2 y comparando el DOM de `/barberia-demo` antes y después en dev. El negro, el blanco, el asfalto, las fuentes, el layout y las formas no cambian.
- **AC-2 Función pura de paleta con contraste automático** en `src/lib/brand-colors.ts` (sin dependencias nuevas; la matemática de color se escribe a mano). Recibe `(primary | null, secondary | null)` y devuelve `{ royal, rojo, rojoClaro, royalMuted, adjusted: { primary: boolean, secondary: boolean } }`, todos en `#rrggbb` minúscula. Ajusta **solo la luminosidad** (OKLCH o HSL), conserva el tono y cumple estas reglas (ratios WCAG 2.x, verificados en `src/lib/brand-colors.test.ts`):
  - blanco sobre `rojo` ≥ 4.5:1 (botón primario, tag de precio, fila "hoy", slot/día seleccionado, badge) y, por la misma razón, `rojo` sobre blanco ≥ 4.5:1 (precio en las opciones de reserva);
  - blanco sobre `royal` ≥ 4.5:1 (sección horarios);
  - `royalMuted` sobre `royal` ≥ 4.5:1 (reemplaza al `#dfe3ff` fijo; es un tinte claro del principal);
  - `rojoClaro` sobre negro ≥ 4.5:1 (link "Reservá online", íconos, `--destructive`); se **deriva** de `rojo` aclarándolo sin cambiar el tono;
  - `royal` y `rojo` ≥ 1.4:1 contra negro, para que las franjas y superficies no desaparezcan sobre `--tinta` (los originales dan unos 1.8 y 4.0).
  
  Los tests cubren como mínimo: `null`/`null` y los originales explícitos dan exactamente los valores de hoy con `adjusted` en false; un color claro (por ejemplo `#ffff00` o `#7fff00` como secundario) se oscurece, conserva el tono (±5°) y marca `adjusted.secondary = true`; un color casi negro se aclara hasta el piso de 1.4:1; un color que ya cumple se devuelve sin tocar.
- **AC-3 Validación y seguridad.** Hay un schema Zod (en `brand-colors.ts`) que acepta solo `^#[0-9a-fA-F]{6}$` o vacío/`null`, normaliza a minúscula y rechaza `red`, `#fff`, `#12345g`, `#000000;}` y `url(...)`. Lo cubre un test. La base guarda solo ese valor validado (lo que eligió el dueño, no el ajustado). En la landing, los colores se inyectan **únicamente** como custom properties en el atributo `style` del elemento raíz `.landing-theme` (`--royal`, `--rojo`, `--rojo-claro`, `--royal-muted`), con valores salidos de la función de AC-2. No se arma ningún `<style>` ni CSS con strings del usuario. `landing.css` pasa a usar `var(--royal-muted, #dfe3ff)` en `.landing-royal`.
- **AC-4 Acción del servidor.** `updateBrandColors` en `src/server/actions/landing.ts` sigue el orden de siempre: `safeParse`, después `ownerSession()` (BARBER o sin sesión devuelve `FORBIDDEN` y no escribe), después `db.barbershop.update` con el `barbershopId` **de la sesión** (el form no manda ningún id) y `invalidate(session)`. "Restablecer colores originales" guarda los dos en `null`. Al recargar `/<slug>`, se ven los colores nuevos sin esperar el `cacheLife`.
- **AC-5 Lectura pública cacheada.** Los colores se leen por slug con el mismo `cacheTag(barbershopBrandingTag(slug))` (agregándolos a `getPublicLanding` o con una lectura cacheada chica en `data.ts`) y solo de barberías `ACTIVE`. `layout.tsx` los aplica en la raíz del tema. Un slug inexistente o inválido no consulta la DB (usa `validateSlug`) y muestra el `not-found` con los colores por defecto. El 404 sigue siendo un 404 real (no se rompe lo de los jobs 008/015) y `pnpm build` no avisa de datos dinámicos fuera de `<Suspense>`. Se verifica cambiando los colores de `barberia-demo` a un preset verde: el hero, la franja del poste (también la del 404 de una ruta inexistente bajo un slug válido, si existe), los botones, la sección horarios, la fila "hoy", `::selection` y los links `--rojo-claro` cambian; `otra-barberia` no cambia (aislamiento entre tenants).
- **AC-6 UI en Ajustes → Página pública.** En la Card existente hay un bloque "Colores", un componente cliente nuevo, con:
  - **6 a 8 paletas predefinidas**, que incluyen "Clásico" (`#1f2e9a`/`#d7191f`) y por ejemplo verde/dorado, violeta/naranja, bordó/celeste y grafito/amarillo. Un test verifica que **todas** pasan AC-2 sin ajuste (`adjusted` en false);
  - para "Principal" y "Secundario", un `<input type="color">` y un campo de texto hex con su `<label>`, sincronizados entre sí;
  - una **vista previa en vivo** (un mini mock con un botón sticker, un tag de precio, la franja del barber pole y un título con la sombra del acento) que usa los valores **ajustados** de la función de AC-2;
  - el aviso "Ajustamos un poco el tono para que se lea bien" cuando `adjusted` es true para alguno de los dos;
  - los botones "Guardar colores" y "Restablecer colores originales", con estado pendiente y mensajes de error/éxito según el patrón de `landing-form.tsx`.

  Es mobile-first, usa componentes de shadcn ya instalados y los textos van en rioplatense. El dashboard en sí no cambia de colores.
- **AC-7** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `src/lib/brand-colors.ts`
- `src/lib/brand-colors.test.ts`
- `src/server/actions/landing.ts`
- `src/server/queries/landing.ts`
- `src/app/[slug]/layout.tsx`
- `src/app/[slug]/data.ts`
- `src/app/[slug]/landing.css`
- `src/app/[slug]/not-found.tsx`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/app/(dashboard)/dashboard/settings/landing-form.tsx`
- `src/app/(dashboard)/dashboard/settings/brand-colors-form.tsx`

## Fuera de alcance
- Editar el negro, el blanco o el asfalto, las fuentes, los bordes, las sombras, el layout o agregar un tercer color.
- Sacar colores del logo automáticamente (extracción de paleta).
- Theming del dashboard, de los emails o de `src/app/globals.css`.
- Agregar `themeColor`/`viewport` o imágenes OG nuevas (hoy no existen).
- Dependencias nuevas (color pickers, librerías de color como culori o chroma-js) y componentes nuevos de shadcn.
- Cambiar los componentes de `src/app/[slug]/**` más allá de `layout.tsx`/`not-found.tsx`: ya usan `var()`.
- Modo "texto negro sobre color claro": la regla es ajustar la luminosidad y mantener el texto blanco.

## Riesgos
- **Cambio de schema** (`prisma/schema.prisma` y `prisma/migrations/**`, hot files): el job corre solo y se escala a un humano.
- **Inyección de CSS:** el dato viene del dueño y se ve en una página pública. Se mitiga con la regex estricta, la normalización y el uso de custom properties en `style`, nunca con CSS armado con strings. El reviewer tiene que confirmar que ningún valor sin validar llega al DOM.
- **Multi-tenant/auth:** la acción es solo para OWNER y usa el `barbershopId` de la sesión. La lectura pública es por slug, solo `ACTIVE` y expone solo los dos colores.
- **Caché y 404 con Cache Components:** leer datos en `layout.tsx` puede romper el prerender o el 404 real del slug inexistente. El builder tiene que leer `08-caching.md` y verificar el 404 y el build.
- **Accesibilidad:** el contraste depende del input. Lo cubre AC-2 con tests.
