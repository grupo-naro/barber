ESCALATE

**Motivo:** Cambio de schema + migración (unique de OpeningHours); 4 reviews PASS, ACs con evidencia y diff en scope, pero la regla exige revisión humana.

## Notas
- **Por qué se escala:** toca `prisma/schema.prisma` y agrega `prisma/migrations/20261121200000_split_opening_hours/migration.sql`. El SQL solo hace `DROP INDEX "OpeningHours_barbershopId_weekday_key"` y `CREATE UNIQUE INDEX "OpeningHours_barbershopId_weekday_opensAt_key"`. No hay UPDATE/DELETE ni cambios de columnas. El unique nuevo es más laxo, así que las filas actuales lo cumplen. El build lo probó contra datos del seed viejo y el orquestador verificó que no hay drift.
- **Desvío de proceso (AC-1):** el SQL salió de `prisma migrate diff`, no de `migrate dev --name`, porque este último pide confirmación interactiva. Después se aplicó con `migrate dev` y quedó "in sync". Conviene confirmar que el nombre y el timestamp de la carpeta te sirven.
- **Borrado de filas en runtime:** `updateOpeningHours` ahora hace `deleteMany({ where: { barbershopId } })` + `createMany` dentro de un `$transaction`. Antes eran upserts. El borrado es atómico y el `barbershopId` sale de la sesión, así que respeta el tenant. Igual reemplaza todas las filas de horario de la barbería cada vez que se guarda.
- **Cambio menor de comportamiento:** en la landing, una fila con apertura >= cierre ahora se muestra "Cerrado".
- Quedan sin cambios: auth/proxy, dependencias, env/secretos y `defaultOpeningHours`/admin. Los 17 archivos del diff están dentro del scope.
- Checks: lint, typecheck, test (290), build, booking-smoke (con 12 checks nuevos de día cortado) y cash-smoke en verde.
- **Nits de UX/UI abiertos (no bloquean):**
  - No hay "Copiar a todos los días" en `hours-form.tsx`, así que cargar un horario cortado en 6 días lleva unos 12 toques.
  - Landing `hours-section.tsx`: a 360px, "10:00 – 14:00 · 17:00 – 21:00" puede cortar la línea en medio de una franja. La solución sería poner cada franja en un `<span className="whitespace-nowrap">`.
  - Las etiquetas "Turno mañana: abre" / "Turno tarde: abre" son largas para una columna de ~118px a 360px. Se puede agregar `truncate` o usar "Mañana"/"Tarde".
  - El switch Abierto/Cerrado está hecho a mano porque no hay `Switch` de shadcn. Usa tokens del tema, así que conviene migrarlo cuando exista. `checkboxClass` en `form-ui.tsx` puede quedar sin uso.
  - En la grilla de reserva de un día cortado no hay separador ni texto "Pausa" que marque el hueco 14–17.
  - El error de solapamiento aparece una vez por día y no junto a la franja puntual. Al quitar el turno tarde, el foco no se mueve.
  - Código: hay `!` y `as TimeRange[]` en el superRefine de `barbershop-settings.ts`. Hoy son seguros, pero conviene reemplazarlos por un type guard. Además, el unique admite varias filas `closed` con `opensAt` NULL, aunque la action siempre escribe una sola.
