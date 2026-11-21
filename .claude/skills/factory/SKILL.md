---
name: factory
description: Orquestador de la software factory. Lleva features por spec, scope-check, build en worktree aislado, 4 reviews en paralelo, approver y merge secuencial a main, con hasta 2 jobs simultáneos. Usar para /factory <feature> | next | status | approve <id> | rework <id> <nota>.
argument-hint: <feature> | next | status | approve <job-id> | rework <job-id> <nota>
disable-model-invocation: true
---

# /factory — sos el orquestador

Corrés el loop, spawneás todos los agentes y sos **el único que escribe `factory/board.json`**.
El dashboard lee ese archivo cada 2 segundos, así que reescribilo en **cada** cambio de estado. Los agentes nunca ven
esta conversación: les pasás rutas, y ellos leen el resto de los archivos.

Argumentos: `$ARGUMENTS`

## Constantes
- `MAX_CONCURRENT_JOBS = 2` (slot 1 → puerto 3001, slot 2 → puerto 3002)
- `MAX_REWORK = 2`: el builder se reanuda como máximo 2 veces por reviews (hasta 3 rondas)
- `REVIEWERS = security, ux, ui, code` → agentes `review-<k>` → archivos `round-N/review-<k>.md`
- `ROOT` = raíz del repo (siempre en `main`; nunca hagas checkout de otra rama acá)
- Por job: `ID` = `NNN-slug`, `DIR` = `factory/jobs/ID/`, `BRANCH` = `factory/ID`, `WT` = `.worktrees/ID`,
  `DB` = `barber_job_NNN`

## board.json
```json
{ "config": { "max_concurrent_jobs": 2, "max_rework": 2 },
  "active_slots": [ { "slot": 1, "job": "001-seed-and-auth", "port": 3001 }, { "slot": 2, "job": null, "port": 3002 } ],
  "merge_lock": null, "updated": "<ISO>",
  "jobs": [ { "id": "001-seed-and-auth", "title": "…", "branch": "factory/001-seed-and-auth",
    "worktree": ".worktrees/001-seed-and-auth", "scope": ["prisma/seed.ts", "src/lib/auth.ts"],
    "stage": "review", "slot": 1, "round": 1,
    "reviews": { "security": "PASS", "ux": "pending", "ui": "PASS", "code": "PASS" },
    "past": [], "blocked_by": [], "builder": "builder-001-seed-and-auth", "decision": null, "note": null } ] }
```
- `stage` es uno de `spec`, `queued-blocked`, `building`, `review`, `approving`, `needs-human`, `done`.
- `reviews` guarda la última ronda y `past` las anteriores (de la más vieja a la más nueva).
- `blocked_by` lista los IDs de los jobs con los que choca, `"dep:<ID>"` si espera una dependencia, o `"slot"` si solo
  espera un slot libre. `depends_on` (opcional) es la lista de IDs que tienen que estar en `done` antes de arrancar.
- `note` es una línea legible para humanos.
- Para escribir: leés el archivo, cambiás solo lo tuyo y lo escribís entero con `updated` al momento actual.

## Modelo de ejecución: event loop
Todos los agentes se lanzan **en background**. Nunca bloquees esperando a un job: cuando termina un agente,
avanzás **ese** job según la tabla y después corrés `schedule()`. Así dos jobs avanzan intercalados.
Cuando no queda nada corriendo, avisale al usuario en una línea.

| Evento | Acción |
|---|---|
| Job nuevo | Creás `DIR` y lo agregás al board en `spec`. Spawneás `spec-writer` con la feature, `ID` y `DIR`. |
| Terminó spec-writer | Parseás `## Target Files (Scope)` de `spec.md` → `scope`. Lo pasás a `queued-blocked` y corrés `schedule()`. Si falta la sección, volvés a spawnear al spec-writer. |
| `schedule()` arranca un job | Lo pasás a `building`, le asignás `slot`, corrés **Setup del worktree** y spawneás `builder` con **name `builder-ID`** (prompt: `ID`, `DIR`, `WT`, `BRANCH`, puerto). Guardás el nombre en `builder`. |
| Terminó el builder | Si `build.md` termina con una sección `## Scope request`, vas a **Pedido de scope**. Si no, abrís la ronda N: creás `DIR/round-N/`, pasás `reviews` (si no está vacío) a `past`, ponés las 4 reviews en `pending` y el stage en `review`, y spawneás los 4 reviewers **en un solo mensaje** (prompt: `ID`, `DIR`, carpeta de la ronda, `WT`, `BRANCH`). |
| Terminó un reviewer | Leés la línea 1 de su archivo y actualizás ese chip. **WAIT FOR ALL:** la ronda termina recién cuando existen los 4 `review-*.md`. Si un reviewer terminó sin escribir su archivo, lo spawneás de nuevo. |
| Ronda completa | Todo PASS → `approving` y spawneás `approver`. Hay CHANGES y quedan reworks → `building` y `SendMessage` a `builder-ID`: "Ronda N tiene CHANGES. Leé `DIR/round-N/`, corregí, commiteá y actualizá build.md". Hay CHANGES sin reworks → `approving` de todas formas (el approver va a escalar). |
| Terminó el approver | Leés la línea 1 de `decision.md`. `APPROVE` → **Merge**. `ESCALATE` → `needs-human`, `note` = el motivo, liberás el slot (el **scope sigue bloqueado** hasta que se mergee o se descarte) y corrés `schedule()`. |

Nunca reanudes al builder a mitad de una ronda.

### schedule()
Recorrés los jobs en `queued-blocked` por orden de ID. Cada uno arranca si hay un slot libre (slots ocupados <
`MAX_CONCURRENT_JOBS`), todos sus `depends_on` están en `done` **y** su scope no choca con ningún job en `building`,
`review`, `approving` o `needs-human`. Si no arranca, actualizás `blocked_by` (IDs en conflicto, `"dep:<ID>"` por cada
dependencia pendiente, o `"slot"`).

**Choque de scope:** a cada patrón le sacás el prefijo estático (todo lo que está antes del primer `*` o `?`; los
corchetes son literales, porque en Next `[slug]` es un segmento de ruta y no un comodín).
Dos patrones chocan si uno de esos prefijos es prefijo del otro, comparando por segmentos de ruta.
Ejemplos: `src/app/(dashboard)/**` choca con `src/app/(dashboard)/settings/page.tsx`. `prisma/schema.prisma` choca
consigo mismo. `src/server/actions/services.ts` no choca con `src/server/actions/barbershop.ts`.
Ante la duda, consideralo un choque: correr en serie es seguro, pisarse no.

### Setup del worktree (lo corrés vos desde ROOT)
```sh
git worktree add .worktrees/ID -b factory/ID main
cp .env .worktrees/ID/.env    # y en esa copia cambiás el nombre de la base del DATABASE_URL a barber_job_NNN
docker exec barber-db createdb -U barber barber_job_NNN 2>/dev/null || true
(cd .worktrees/ID && pnpm install --frozen-lockfile && pnpm exec prisma migrate deploy)
```

### Pedido de scope
El builder necesita archivos fuera de su scope. Si los nuevos patrones no chocan con otros jobs activos, los sumás a
`scope` y le mandás `SendMessage` a `builder-ID`: "Scope ampliado: <patrones>. Seguí". Si chocan, dejás el job en
`building` con `note` = "esperando scope de <otro ID>" y lo reanudás cuando ese otro job se mergee.
Si dos jobs se esperan entre sí, pasás el de ID más alto a `needs-human`.

### Merge (lo usan APPROVE y `/factory approve`): secuencial, de a uno
1. Si `merge_lock` está ocupado, ponés el job en la fila: `note` = "esperando merge". Si no, `merge_lock = ID`.
2. En `WT`: `git rebase main`. Si hay conflicto, hacés `git rebase --abort` y el job pasa a `needs-human` con el conflicto en la nota.
3. En `WT`: `pnpm install --frozen-lockfile && pnpm exec prisma migrate deploy && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
   Si algo falla, pasa a `needs-human` con el check que falló.
4. En `ROOT`: `git merge --no-ff factory/ID -m "factory: merge ID"`. Si el árbol sucio lo bloquea, `needs-human`.
5. Si el job tocó `package.json`, `prisma/` o la lockfile, en `ROOT` corrés `pnpm install && pnpm exec prisma migrate deploy`.
6. Limpiás: `git worktree remove --force .worktrees/ID` (en Windows suele fallar con "Directory not empty"; en ese caso,
   `rm -rf .worktrees/ID && git worktree prune`), `git branch -d factory/ID` y
   `docker exec barber-db dropdb -U barber --if-exists barber_job_NNN`.
7. `stage = done`, liberás el slot y el `merge_lock`, hacés el **commit de registro** y corrés `schedule()`
   (los jobs que este bloqueaba pueden arrancar).

En cualquier `needs-human` liberás también el `merge_lock` si lo tenía ese job.

**Commit de registro** (al terminar un job, en `done` o `needs-human`), en ROOT sobre `main` y solo con archivos de la factory:
`git add factory && git commit -m "factory: ID <stage>" -- factory`

## Comandos
- **`/factory <feature>`**: ID = el mayor NNN entre `factory/jobs/` y `backlog.md`, más uno. Corrés el evento "Job nuevo".
- **`/factory next`**: tomás los primeros ítems `- [ ]` de `backlog.md` cuyo `depende de:` ya esté en `done`
  (salteás los demás sin especificarlos), tantos como slots libres haya (2 si no hay nada corriendo). El ID es el que
  figura en el ítem y `depends_on` sale de `depende de:`. Los marcás `- [x]` y lanzás sus spec-writers en paralelo.
  Si después de `schedule()` sigue habiendo un slot libre porque un job quedó bloqueado por scope, especificás el
  siguiente ítem elegible (máximo 2 de lookahead) para buscar uno compatible.
- **`/factory status`**: imprimís una tabla con slots (job, stage, ronda, puerto), cola (`queued-blocked` y su `blocked_by`),
  `needs-human`, `merge_lock` y `git worktree list`. No cambiás nada.
- **`/factory approve <ID>`**: solo para jobs en `needs-human`; el humano es el approver. Le reasignás un slot si hay uno
  libre (si no, usás el merge igual: no hace falta slot para mergear) y corrés **Merge**.
- **`/factory rework <ID> <nota>`**:
  1. Con N = ronda + 1, escribís `DIR/round-N/review-human.md` = `VERDICT: CHANGES` + la nota.
  2. Pasás `reviews` a `past`, ponés `reviews = { "human": "CHANGES" }`, `round = N` y `stage = building`; tomás un slot y
     limpiás `decision` y `note`.
  3. Si `builder-ID` sigue vivo en esta sesión, le mandás `SendMessage` apuntando a `round-N/`. Si no, spawneás un
     `builder` nuevo con el mismo nombre y "retomá: leé build.md y round-N/" (el worktree sigue existiendo).
  4. Cuando termina, la siguiente ronda de reviews es la N+1. El rework humano no cuenta contra `MAX_REWORK`.

## Reglas
- Escribís solo `board.json`, `backlog.md`, `review-human.md` y commits en `main`. Nunca tocás código de producto.
- Ningún builder trabaja en ROOT, y nunca hacés checkout de otra rama en ROOT.
- Al usuario le contás una línea por cada transición de stage.
