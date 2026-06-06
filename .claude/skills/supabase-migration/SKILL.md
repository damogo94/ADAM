---
name: supabase-migration
description: >-
  Workflow para cambios de esquema de la base de datos de ADAM vía migraciones
  Supabase: escribir el SQL de la migración, aplicarlo a producción (con
  confirmación del usuario) y —lo más importante— regenerar y CABLEAR
  correctamente los tipos TypeScript generados. Úsalo SIEMPRE que el usuario
  quiera añadir/alterar/eliminar una tabla o columna, crear una nueva migración,
  cambiar el esquema, regenerar los tipos de Supabase, o mencione que
  `types/db/supabase.ts` está desincronizado. Dispáralo aunque solo digan "añadí
  una columna", "necesito una migración para…" o "regenera los tipos": el paso
  de regeneración tiene gotchas silenciosos (preservar la cabecera del fichero,
  añadir el alias de dominio en `index.ts`, mantener `@supabase/ssr` alineado con
  su peer, cero `as any`) que es fácil hacer mal y que no petan de golpe.
---

# Migración Supabase en ADAM

Una migración de esquema en ADAM no termina cuando el SQL corre: termina cuando
los tipos TypeScript generados reflejan el cambio **y** el typecheck pasa. La
parte que más se olvida —y que falla en silencio— es la sincronización de tipos,
no el SQL. Este skill existe para que ese paso salga bien siempre.

## Por qué importa cablear bien los tipos

`createClient<Database>` deriva TODA la seguridad de tipos de las llamadas a
Supabase de `types/db/supabase.ts`. Si ese fichero está desfasado respecto al
esquema real:
- Los inserts/updates a la tabla nueva tipan como `never` → typecheck roto o, peor,
  alguien "lo arregla" con un `as any` y se pierde la red de seguridad de todo el
  árbol `src` (que está a **cero casts** a propósito).
- Una columna nueva no existe para el cliente tipado → no la puedes leer/escribir
  sin castear.

Por eso el contrato del proyecto es: **los tipos se generan, no se escriben a
mano; se regeneran tras cada migración.**

## El workflow, paso a paso

### 1. Escribir el fichero de migración

Crea `supabase/migrations/00NN_nombre_descriptivo.sql`:
- **Numeración secuencial** — mira el último fichero de `supabase/migrations/` y
  suma uno (con cero a la izquierda: `0011`, `0012`…).
- **Nombre en snake_case** que describa el cambio (`0012_add_trade_fees_column`).
- **Comentario-cabecera** explicando el *por qué* del cambio, no solo el qué (las
  migraciones existentes son la referencia de tono — léete un par).
- **Piensa en RLS**: si creas una tabla, decide su política. Las tablas que solo
  escribe el cron usan `enable row level security` **sin policies** (el
  `service_role` bypasea RLS; el cliente no accede). Las tablas de usuario llevan
  policies `using (user_id = auth.uid())`. Mira `0001_init.sql` y
  `0011_trade_outcomes.sql` como ejemplos de cada patrón.

### 2. Aplicar a producción — CON confirmación

Aplicar DDL es una acción con efecto en producción. **Antes de aplicar, di
explícitamente al usuario qué vas a correr y espera su OK** — nunca apliques una
migración a prod de forma silenciosa.

Con el OK, la vía **canónica del proyecto** es el script `scripts/apply-migration.mjs`,
que aplica el fichero `.sql` tal cual contra la BD (postgres directo, conexión
non-pooling — preferible para DDL multi-statement, evita los prepared statements
del pooler):

```bash
node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/00NN_nombre.sql
```

Lee `POSTGRES_URL_NON_POOLING` de `.env.local` y, al terminar, imprime las tablas
de `public` y el nº de policies RLS → úsalo para verificar de un vistazo que el
cambio cuajó. Su ventaja: aplica **exactamente** el fichero versionado, sin copiar
el DDL a mano a ningún sitio.

Alternativas equivalentes: la herramienta MCP de Supabase **`apply_migration`**
(`project_id` `qaakauberbibfgxthlro`, `name` en snake_case, `query` = el DDL — usa
`apply_migration`, **no** `execute_sql`, que es solo para queries), o
`supabase db push` si el proyecto está linkeado.

### 3. Regenerar los tipos

Genera el `Database` actualizado. Dos vías equivalentes:
- **MCP**: la herramienta **`generate_typescript_types`** con
  `project_id: qaakauberbibfgxthlro`. Devuelve el cuerpo del fichero (empieza en
  `export type Json =`).
- **CLI**: `supabase gen types typescript --project-id qaakauberbibfgxthlro > types/db/supabase.ts`

### 4. Escribir `types/db/supabase.ts` PRESERVANDO la cabecera ⚠️

Este es el gotcha principal. El output del generador **no incluye** la cabecera
de comentario del fichero; empieza directo en `export type Json =`. Si vuelcas el
output crudo, te cargas la cabecera que documenta que el fichero es generado.

Sobrescribe `types/db/supabase.ts` con **la cabecera original + el cuerpo
generado**. La cabecera a preservar es exactamente:

```ts
/**
 * A.D.A.M. — Tipos generados de Supabase.
 *
 * GENERADO. No editar a mano. Regenerar con:
 *   supabase gen types typescript --project-id qaakauberbibfgxthlro > types/db/supabase.ts
 *
 * Los alias de dominio (Profile, Watchlist, AnalysisLog, …) viven en
 * `types/db/index.ts` y se derivan de estos tipos para mantener estable
 * la API pública del módulo.
 */
```

Si usaste el CLI con `>`, la cabecera se pierde igual → vuelve a añadirla. No
toques nada más del cuerpo generado a mano (la regla es: este fichero no se edita
a mano, jamás).

**Finales de línea (CRLF) — gotcha #2.** El repo usa `core.autocrlf=true` y el
fichero committed está en **CRLF**; el generador (MCP o CLI) emite **LF**. Si
escribes `supabase.ts` en LF, `git diff` marcará TODAS las líneas como cambiadas
— un diff de fin de línea espurio que entierra el cambio real de esquema y ensucia
la revisión. Escríbelo en CRLF (o deja que `core.autocrlf` lo normalice al
`git add`) y confirma con `git diff --stat` que solo cambian las líneas del
esquema, no el fichero entero.

### 5. Añadir el alias de dominio en `types/db/index.ts`

`index.ts` es la API pública estable de los tipos: re-exporta `Database` y deriva
alias de dominio por tabla. Si creaste una tabla nueva, añade su alias en la
sección "Filas (Row) por tabla", siguiendo el patrón existente:

```ts
export type TradeOutcome = Database['public']['Tables']['trade_outcomes']['Row'];
```

Para enums nuevos, añádelos en la sección "Enums" con el mismo patrón
(`Database['public']['Enums']['nombre']`). El resto del código importa **desde
`@/types/db`**, nunca desde `./supabase` directamente.

### 6. Verificar

```bash
corepack pnpm typecheck
```

Debe pasar limpio. Si sale un error tipo `never` en un insert/update a la tabla
tocada, es señal de que los tipos no se regeneraron o no se volcaron bien → vuelve
al paso 3.

## Invariantes que no se rompen (defensa en profundidad)

- **Cero `as any` / `as unknown` en `src`.** Si te tienta castear una llamada a
  Supabase, el problema casi siempre es que los tipos están desfasados — regenera,
  no castees. Reintroducir un cast aquí es exactamente lo que este skill evita.
- **`@supabase/ssr` alineado con el peer de `@supabase/supabase-js`.** Si bumpeas
  uno, comprueba el otro: una desalineación entre ambos fue la causa raíz de un
  bug de tipos `never[]` en inserts. Verifícalo con
  `corepack pnpm why @supabase/ssr` si hay dudas.
- **Payloads jsonb con `type`, no `interface`.** Un `type` es asignable a `Json`;
  una `interface` no (por la firma de índice implícita). Si defines la forma de un
  campo jsonb, usa `type X = {...}`.
- **`types/db/supabase.ts` nunca se edita a mano** salvo la cabecera del paso 4.

## Ejemplo de invocación

**Input del usuario:** "Añade una columna `fees_pct` (numeric, nullable) a
`trade_outcomes` para registrar las comisiones asumidas en el backtest."

**Lo que haces:**
1. Creas `supabase/migrations/0012_trade_outcomes_fees.sql` con
   `alter table public.trade_outcomes add column fees_pct double precision;` +
   comentario explicando por qué.
2. Le dices al usuario "voy a aplicar esto a prod: `<DDL>`" y esperas su OK.
3. Aplicas con `apply_migration`.
4. Regeneras con `generate_typescript_types`.
5. Sobrescribes `types/db/supabase.ts` = cabecera preservada + cuerpo generado
   (ahora `trade_outcomes` tiene `fees_pct`).
6. `trade_outcomes` ya tenía alias en `index.ts` → no hace falta tocarlo (si fuera
   tabla nueva, lo añadirías).
7. `corepack pnpm typecheck` → verde. Reportas qué cambió.

## Notas de entorno

- Gestor de paquetes canónico: **pnpm@9.12.0** vía `corepack pnpm …`.
- En Windows PowerShell, evita redirigir el stderr de ejecutables nativos por la
  pipeline (envuelve el stderr en `NativeCommandError`); corre npm/pnpm desde
  `cmd.exe //c "..."` si la política de ejecución bloquea `npm.ps1`.
