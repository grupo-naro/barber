APPROVE

**Motivo:** 4 reviews PASS (solo nits), los 8 AC tienen evidencia, el diff (8 archivos) queda dentro de Target Files y los checks pasan (lint, typecheck, 536 tests, build).

## Notas
- Scope: los 8 archivos del diff (`main...bd995c7`) son exactamente los de Target Files. No toca hot files, `src/server/**`, schema, migraciones, dependencias, auth (`src/lib/auth.ts`, `src/proxy.ts`) ni `.env`.
- Variables de entorno: solo `scripts/panel-check.mjs` lee `PANEL_CHECK_OWNER_TOKEN`, `PANEL_CHECK_BARBER_TOKEN` y `PANEL_CHECK_TIMEOUT_MS`, como pide AC-6c/d. Es un script de prueba local, no la app, y no cambia la config ni los secretos de la app.
- Borrado de datos: el script sigue reseteando su fixture, pero ahora con más guardas: host local exacto, base `barber_job_*` y chequeo antes de conectarse. Solo mata el Chrome que lanzó él (por PID).
- Bug (a) reproducido en `main` (27 fallas) y en verde con el arreglo (86/0). La corrida completa de `panel-check` da 1027/0 y salida 0. Salir de Hoy sin el arreglo no se reprodujo, como permite AC-1f. Sí se reprodujo ir y volver enseguida con un envío en curso, y quedó cubierto.
- `use-sheet-action.ts`: suelta `busy` solo en la rama `!alive.current`. La rama de éxito sigue bloqueada hasta `reset` (riesgo de doble cobro sin cambios).
- Nits que no bloquean y pueden ir a otro job:
  - Seguridad: un `%00` armado a propósito en `DATABASE_URL` podría saltar la guarda del nombre de la base. Se podría confirmar `current_database()` después de conectar.
  - `chromeEnv` usa una lista fija y en Windows distingue mayúsculas al borrar.
  - UI: queda una columna vacía con su `gap` cuando no hay etiqueta.
- Preexistentes en `main`, fuera de scope y ya derivados a jobs propios: "Registrando…" trabado al reabrir la hoja dentro de unos 100 ms del cierre, y la búsqueda por teléfono sin normalizar el 54 9.
- No verificado (lo declara build.md): teléfonos reales, una segunda pestaña real del navegador (AC-5b) y la limpieza de procesos en Linux y macOS.
