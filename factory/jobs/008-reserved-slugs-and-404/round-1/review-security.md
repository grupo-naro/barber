VERDICT: PASS

## Hallazgos
- [nit] `src/proxy.ts:91`: cada request a `/<slug-válido>`, incluso los inexistentes, el prefetch RSC y el POST de reserva, hace una query sin cache en Proxy. Así un atacante puede amplificar la carga sobre la DB pidiendo slugs aleatorios válidos. Igual es una query indexada que solo devuelve `id`, y el spec ya lo acepta como trade-off y deja afuera el rate limit y la cache. → Seguimiento: rate limit por IP en el matcher público o cache LRU corta de negativos. Esto no bloquea.
- [nit] `src/proxy.ts:80`: `console.error(..., error)` loguea el error completo de Prisma, que puede incluir el host o el usuario de la DB. Queda solo en los logs del server y no llega al cliente. → Opcional: loguear `error.message` o un código.
- [nit] `src/lib/slugs.ts:52`: el mensaje de error de `validateSlug` interpola el slug (`"${slug}" es una dirección reservada`). Hoy no se renderiza en ningún lado. Cuando haya un formulario de alta, hay que mostrarlo como texto de React (escapado), nunca como HTML.

## Revisado
- **Auth sin regresiones.** `needsSession` (`/login` o `isPrivatePath`) se evalúa antes del chequeo de slug, así que `/dashboard`, `/settings`, `/services`, `/today` y `/cash` (sueltos o con subrutas) siguen pasando por `verifySession` y `decideRoute`, sin DB.
- **El matcher no excluye rutas protegidas.** Se mantienen todas las entradas anteriores y se agrega `"/:slug([^/.]+)"`. `safeNextPath` y `decideRoute` no cambian, y sus tests siguen verdes. AC-4 confirma `/dashboard` → 307 a `/login?next=%2Fdashboard`.
- **El panel sigue verificando sesión en el server.** `src/app/(dashboard)/layout.tsx` y las páginas siguen haciendo su propio chequeo, independiente de Proxy.
- **La query va después de validar.** Solo se consulta la DB después de `validateSlug`: regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, de 3 a 40 caracteres y no reservado. La query de Prisma está parametrizada, usa `select: { id: true }` y solo devuelve un booleano.
- **No hay enumeración extra.** La existencia de un slug ya la revela la página pública.
- **El fail-open no toca auth.** Solo aplica a la rama pública de slug; la rama de auth no consulta la DB.
- **El rewrite no es controlable por el usuario.** El destino es la constante `/_not-found-slug/x` sobre `request.nextUrl.origin`, sin interpolar datos del request.
- **La lista de reservados está completa.** Incluye `login`, `dashboard`, `api`, `_next`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `admin`, `auth` y demás. Un test verifica que cada segmento de `PRIVATE_PREFIXES` sea reservado.
- **La página revalida el slug.** `page.tsx` y `generateMetadata` llaman a `validateSlug` antes de tocar la DB.
- **Las páginas 404 son seguras.** Son estáticas, sin `dangerouslySetInnerHTML` ni datos del tenant.
