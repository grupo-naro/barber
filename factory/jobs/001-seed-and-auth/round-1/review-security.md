VERDICT: CHANGES

## Hallazgos
- [blocking] `src/server/actions/auth.ts:24` (`safeNext`): open redirect después del login. El filtro solo rechaza `//` y `/\`, pero el parser de URL de los navegadores (WHATWG) elimina tabs/CR/LF, así que `next=/%09/evil.com` (o `/%0A/evil.com`) pasa el chequeo, llega tal cual a `redirect()` (Next lo pone sin normalizar en `Location` / `x-action-redirect`, ver `next/dist/server/app-render/action-handler.js:874` y `:267`) y el navegador lo resuelve como `//evil.com`. Un link `/login?next=…` mandado por WhatsApp lleva al usuario, ya logueado, a un sitio de phishing → validar resolviendo contra un origen fijo y exigiendo mismo origen y ruta conocida, p. ej.:
  ```ts
  function safeNext(next?: string) {
    if (!next) return "/dashboard";
    try {
      const u = new URL(next, "http://internal.invalid");
      if (u.origin === "http://internal.invalid" && isPrivatePath(u.pathname)) return u.pathname + u.search;
    } catch {}
    return "/dashboard";
  }
  ```
  (importar `isPrivatePath` de `@/proxy` o moverlo a `src/lib/`), y agregar un test con `/\t/evil.com`, `/%09/evil.com`, `//evil.com`, `/\\evil.com` y `https://evil.com`.
- [nit] `src/server/actions/auth.ts`: no hay rate limit en el login (fuera de alcance por spec, pero el checklist lo pide). Dejarlo anotado como pendiente para un job posterior (p. ej. límite por IP + email).
- [nit] `src/lib/auth.ts` / `src/lib/session.ts`: la sesión es JWT sin estado; tras logout un token copiado sigue válido hasta 7 días (la revocación solo es vía `active=false` o cambio de barbería). Aceptable para este job (tabla de sesiones fuera de alcance) y ya documentado en `build.md`; considerar un `sessionVersion` en `User` más adelante.
- [nit] `src/lib/session.ts:37,53`: `getSessionSecret()` se evalúa como parámetro por defecto fuera del `try`, así que en el proxy un `SESSION_SECRET` faltante da 500 en las rutas privadas. Es el comportamiento pedido por AC-7 (falla clara), solo dejarlo explícito.

## Revisado
Diff completo `main...HEAD` (auth DAL, sesión JWT, password scrypt, proxy, acciones login/logout, páginas, seed, `.env.example`): `barbershopId` sale solo del JWT re-verificado contra la DB, cookies httpOnly/lax/secure en prod, scrypt + `timingSafeEqual` con hash dummy, error genérico, sin `NEXT_PUBLIC_*` ni `dangerouslySetInnerHTML`, `.env` ignorado, seed acotado por slug; único bloqueante: el open redirect de `next`.
