# A.D.A.M. — Contexto de proyecto para continuar en otra sesión

> **Lee esto primero si retomas el proyecto en una sesión nueva de Claude Code.**
> Resumen vivo de qué hay, qué falta, qué debe el usuario, y por dónde retomar.
> Última actualización: 2026-05-13 · sesión 3 (Sprint 3 + hardening cierre auditoría)

---

## 1. Quick start — qué hacer la primera vez en sesión nueva

```bash
# Working dir (Windows + Git Bash)
cd "C:\Users\CRIS-\Documents\Claude\Projects\ADAM"

# IMPORTANTE: el harness de Claude Code exporta ANTHROPIC_API_KEY="" vacío,
# que sobrescribe el de .env.local. Lanza dev con:
unset ANTHROPIC_API_KEY && node node_modules/next/dist/bin/next dev > dev.log 2>&1 &

# Verifica que env carga:
curl -s http://localhost:3000/api/system  # debe 401 (auth-required) si todo OK

# Tests + typecheck:
node node_modules/typescript/bin/tsc --noEmit       # debe ser silencioso
node node_modules/vitest/vitest.mjs run              # 65/65 verde esperado
```

Lee también:
- [README.md](README.md) — arquitectura técnica + Setup de Supabase + deploy
- [_reference/adam_demo.html](_reference/adam_demo.html) — la demo HTML original con la estética "Deep Space Terminal"
- [_reference/design_prompts_gpt5.md](_reference/design_prompts_gpt5.md) — 11 prompts UI/UX listos para GPT-5/Claude

---

## 2. Qué es A.D.A.M. y reglas innegociables

**A.D.A.M.** (Anomaly Detection & Analysis Module) — copiloto de análisis financiero. **NO** es broker, **NO** ejecuta órdenes, **NO** mueve capital. Solo análisis educativo.

### Arquitectura — 4 agentes + Debate + CMT

```
   ┌─ A1 (Activos / micro) ──── Investing.com + Bloomberg ─── sonnet-4-6
   │
   ├─ A2 (Macro / global) ───── Bloomberg Econ + IMF + Fed ── sonnet-4-6
   │
   │     ↓ si A1 o A2 detectan anomalía
   ├─ DEBATE A1×A2 ──────────────────────────────────────────── opus-4-6
   │
   ├─ A3 (Trading / técnico) ── TradingView (OHLCV) ────────── sonnet-4-6  ⚠️ AISLADO
   │
   └─ A4 (Sistema / ensamblado) ─ recibe A1+A2+A3+Debate ────── opus-4-6

   CMT (Scanner autónomo) ── watchlist scan ─────────────────── haiku-4-5  ⚠️ AISLADO
```

### Las 3 reglas absolutas (verificadas por auditoría)

1. **A3 está AISLADO.** Recibe **solo** `ticker + OHLCV`. Nunca news, macro, sentiment, F&G, VIX, fundamentals, ratings, opiniones de A1/A2. Enforcement en 3 capas:
   - System prompt blacklist ([agents/a3/prompt.ts](agents/a3/prompt.ts))
   - Firma de función `runA3({ticker, ohlcv})` + guard runtime ([agents/a3/client.ts](agents/a3/client.ts))
   - Zod `.strict()` en endpoint ([app/api/agents/a3/route.ts](app/api/agents/a3/route.ts))
   - **65 tests** lo cubren ([agents/a3/__tests__/](agents/a3/__tests__/) + [__tests__/agents/](__tests__/agents/))

2. **A4 cita textualmente a A3**, no lo reescribe. Está en el prompt + cliente de A4 ([agents/a4/prompt.ts](agents/a4/prompt.ts), [agents/a4/client.ts](agents/a4/client.ts)).

3. **El usuario es el ÚNICO comandante de A3.** Ningún otro agente le da instrucciones. CMT respeta la misma regla.

### Estética — "Deep Space Terminal"

- Background `#020610` void absoluto · texto `white/off-white` · slate `#475569` para secundarios · bordes whisper `white/5-10%`
- Acentos por agente: A1 `#3b82f6` azul · A2 `#22d3ee` cyan · A3 `#f59e0b` ámbar · A4 `#a78bfa` violeta
- Confianza: rose `#f43f5e` baja → amber media → emerald `#10b981` alta
- Fonts: Orbitron (marca/títulos) · Inter (body) · IBM Plex Mono (datos técnicos)
- NADA de gradientes purpúreos, emojis aleatorios, neón cyberpunk. "Menos es más".

---

## 3. Estado actual — qué está vivo y funcionando

### Sprint 1 — MVP funcional ✅
- 5 system prompts + 5 schemas Zod + 5 clientes tipados (`agents/{a1,a2,a3,a4,debate}/`)
- API routes orquestador (`app/api/agents/{a1,a2,a3,a4,debate}/`) — A4 con `Promise.all` de A1+A2+A3 paralelo
- Market data proxy (`app/api/market/{quote,news}/`)
- UI Deep Space Terminal completa: AgentCardShell con sweep animation, ConfluenceIndicator (5 puntos × 3 niveles), AssetInput, bottom-nav
- Pantalla `/analysis` funcional end-to-end (smoke-test con AAPL verificado)
- 65 tests de aislamiento A3 verdes
- Error reporting: zod issues en respuesta API, raw output logueado en dev cuando schema falla
- Parser tolerante a fences `` ```json `` abiertas sin cierre

### Sprint 2 — Persistencia + CMT ✅
- Supabase live: 5 tablas + 13 RLS policies + trigger `on_auth_user_created` (project ref `qaakauberbibfgxthlro`)
- DB types TypeScript ([types/db/index.ts](types/db/index.ts)) + 3 clientes (`lib/supabase/{server,browser,admin}.ts`)
- Auth flows: `/login`, `/signup`, signout endpoint, middleware con `updateSupabaseSession` (usa `getUser()` JWT-validated)
- Pantalla `/watchlist` + CRUD (`/api/watchlist`, `/api/watchlist/[itemId]`)
- Persistencia de `analyses_log` al ejecutar A4 (admin client, user_id desde sesión)
- Módulo CMT: `agents/cmt/{prompt,schema,client}.ts` con MISMA isolation que A3
- Scanner CMT (`POST /api/cmt/scan`) — escanea watchlist del user, persiste en `signals_history`
- Pantalla `/signals` con stats + scan button + copy-to-clipboard + mark-as-read
- Pantalla `/system` con métricas reales (analyses_total, signals_total, latencia media, confluencia media)
- Header con UserMenu (avatar iniciales + logout)
- 3 commits en main + push a https://github.com/damogo94/ADAM.git

### Quick-fixes post-auditoría (sesión 2)
- Cache en proceso (Map con TTL + stale-fallback) en `lib/market/alphavantage.ts`
- A4 resiliente: si quote falla pero hay daily candles, recupera último close
- `lib/anthropic.ts`: `maxRetries=5` + custom retry wrapper para 408/429/500/503/529 (Overloaded)
- Recovery de campo `null` en JSON: prompt patterns con `string | null` fuera de comillas
- `maxTokens` default subido 2048→8192 (A2 truncaba)

### Sprint 3 + cierre auditoría (sesión 3 · 2026-05-13)

**Hardening crítico (cierra los 4 bloqueadores de la auditoría):**
- Auth en `/api/agents/{a1,a2,a3,debate}` (replicación del patrón de /a4)
- `Promise.allSettled` en /a4: un agente caído NO tira el pipeline. Si los 3 caen → 503
- `runA4` acepta `a1/a2/a3` nullable + prompt extendido con reglas de degradación
- AlphaVantage: timeout 8s + circuit breaker module-level (60s lockout) + L2 cache Upstash write-through
- Anthropic: `timeout: 25_000` por call
- Middleware fail-CLOSED en producción (503 con log si Upstash error)
- Per-user rate-limit `userRuns: 20/día/user.id` via Upstash
- Ticker regex `/^[A-Z0-9.\-/]+$/i` anti prompt-injection
- CSRF helper `checkSameOrigin` aplicado a 5 POST endpoints
- DB error sanitizer (no leak constraint names en prod)

**Observabilidad:**
- `@sentry/nextjs` instalado y wired (no-op si DSN vacío). `instrumentation.ts` + `instrumentation-client.ts` siguiendo el patrón Next 14
- `app/global-error.tsx` para capturar errores React render
- `@vercel/analytics` + `@vercel/speed-insights` integrados en layout
- Token usage tracking via `onUsage` callback en `runAgent`; cada agente reporta input/output tokens
- `analyses_log.tokens_used` ahora persiste el sumatorio. Coste estimado USD en /system
- HSTS header en `next.config.mjs`

**Visual / spec gaps cerrados:**
- Mini-chart de velas en A3 card (`lightweight-charts` con priceLine entry/stop/target)
- Sparkline 7D en watchlist items (SVG puro, sin Recharts dep en runtime)
- Diccionario de errores UI con tono (rate_limit/transient/auth/partial/fatal) → mensajes en español con acción concreta
- Architecture diagram SVG en /system mostrando el flujo + A3 aislado visualmente

**Infra deploy-ready:**
- `vercel.json` con `maxDuration: 60` (Hobby plan) + cron CMT cada 6h
- CMT scanner cron multi-user implementado real (`/api/cmt/scan` acepta GET con `Authorization: Bearer ${CRON_SECRET}` y itera todas las watchlists default)
- `/api/market/quotes?symbols=A,B,C&spark=1` batch endpoint para reemplazar N llamadas a /quote
- Filtros en /signals: por nivel, ticker, ack-status
- CRON_SECRET generado y en `.env.local`

---

## 4. Hallazgos de auditoría — estado actual

4 sub-agentes auditaron el 2026-05-12. La sesión 3 cerró los 4 bloqueadores 🔴 y la mayoría de 🟡. Estado tras hardening:

### 🔴 BLOQUEADORES — TODOS CERRADOS ✅
1. ✅ Auth en `/api/agents/{a1,a2,a3,debate}` — aplicado
2. ✅ `Promise.allSettled` en /a4 + A4 prompt tolerante a nulls — aplicado
3. ✅ Middleware fail-CLOSED en prod — aplicado
4. ✅ Timeouts en AV (8s) + Anthropic (25s) + circuit breaker — aplicado

### 🟡 ALTOS — CERRADOS EN SU MAYORÍA
5. ✅ CSRF check en 5 POST endpoints — aplicado vía `lib/api-helpers.ts`
6. ✅ Error UX raw → diccionario `lib/errors.ts` con tonos
7. ✅ CMT scan con spacing 13s entre tickers + early-break 3 soft-errors
8. ⚠️ A4 maxDuration=60s — Hobby plan no permite más. **Aceptable**: si Opus tarda mucho, se pierde la analítica. Sentry capturará el timeout. Pro upgrade futuro = subir a 300.
9. ⚠️ `analyses_log/signals_history` sin INSERT RLS policy — funcionalmente seguro (admin client + user.id de getUser validado). Documentado.

### 🟢 MEDIOS — CERRADOS
- ✅ Watchlist batch quote endpoint `/api/market/quotes?symbols=...&spark=1`
- ✅ HSTS header
- ✅ DB error sanitizer (`sanitizeDbError` en `lib/api-helpers.ts`)
- ⚠️ `.env.example` placeholder cosmético — pendiente trivial

### Gaps de spec — ESTADO
- ✅ Mini-chart velas A3 card (lightweight-charts con priceLine)
- ✅ Sparkline 7D en watchlist
- ✅ Architecture diagram en System screen
- ⚠️ Hero stats portfolio 7D en watchlist — pendiente (item del spec, baja prioridad)
- ❌ Slash commands `/plan /macro /cmt /agentes` — **deferred a v2** (decisión consciente)
- ⚠️ System screen calls/min + latency per agent — actualmente solo global. Pendiente migration con `tokens_per_agent jsonb` en analyses_log.

### Cosas BIEN según auditoría (no tocar)
- **A3 isolation real end-to-end** (3 capas + 65 tests)
- **A4 cita A3 textualmente**
- **RLS policies correctas** en operaciones de read
- **Middleware usa `getUser()` (JWT-validated)**
- **Schemas Zod estrictos** con `z.literal` en campos críticos

---

## 5. Dependencias del usuario — tareas pendientes

### Hechas ✅
- Upstash Redis creado + creds en `.env.local`
- Email confirmation desactivado en Supabase
- Trigger `on_auth_user_created` verificado y aplicado
- Anthropic key rotada (la nueva en `.env.local`)
- `.claude/settings.local.json` limpiado (wildcard pattern, sin key literal)
- Sentry proyecto creado + DSN en `.env.local`
- Vercel Hobby plan confirmado

### Pendientes ahora mismo:

**1. Crear proyecto Vercel + primer deploy (15 min tuyos)**
   - https://vercel.com/new → Import `damogo94/ADAM` → framework Next.js (auto) → Deploy (fallará la primera vez por env vars vacías, normal)
   - Settings → Environment Variables → pegar TODOS estos (de `.env.local`):
     ```
     ANTHROPIC_API_KEY
     ALPHA_VANTAGE_API_KEY
     NEXT_PUBLIC_SUPABASE_URL
     NEXT_PUBLIC_SUPABASE_ANON_KEY
     SUPABASE_SERVICE_ROLE_KEY
     UPSTASH_REDIS_REST_URL
     UPSTASH_REDIS_REST_TOKEN
     SENTRY_DSN
     NEXT_PUBLIC_SENTRY_DSN
     CRON_SECRET
     ```
   - Redeploy desde el dashboard
   - El cron de `/api/cmt/scan` (definido en `vercel.json`) arrancará automáticamente cada 6h una vez deployado

**2. (Opcional) Sentry source maps:**
   - Sentry dashboard → Settings → Auth Tokens → crear con scope `project:releases` y `org:read`
   - En Vercel env: añadir `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT=adam` (o el nombre que diste al proyecto)

### Decisiones pendientes:
- **System screen métricas per-agent** — requiere migration 0003 añadiendo `tokens_per_agent jsonb` a `analyses_log`. Decidir si implementar (~45 min) o defer.
- **Trade journal** (outcome win/loss/partial por signal) — requiere migration 0003 añadiendo enum + columna. Recomendación: **SÍ**, es el feedback loop del producto.
- **Supabase Realtime para signals push** — toast cuando entra signal urgente sin refrescar. Requiere enable replication en dashboard Supabase. Recomendación: **SÍ**, completa el "autonomous".

---

## 6. Stack & dependencias

```
Next.js 14.2.35 (App Router) + TypeScript 5.6.3 + Tailwind CSS 3.4
@anthropic-ai/sdk 0.32 (5 retries default ahora)
@supabase/ssr 0.5.2 + @supabase/supabase-js 2.105.4 (postgrest-js type quirk — ver memoria)
@upstash/ratelimit 2.0 + @upstash/redis 1.34 (pendiente creds)
zod 3.23
lightweight-charts 4.2 (en deps, sin usar — TODO)
recharts 2.13 (en deps, sin usar — TODO)
vitest 2.1 (65 tests verdes)
postgres 3.4 (devDep, para scripts/apply-migration.mjs)
```

**Modelos LLM:**
- `claude-sonnet-4-6` → A1, A2, A3 (paralelos, latency-sensitive)
- `claude-opus-4-6` → Debate, A4 (síntesis crítica)
- `claude-haiku-4-5-20251001` → CMT scanner (batch throughput)

**Data providers:**
- **Alpha Vantage free tier** — 25 req/día, 5/min. SIN Upstash el cache es solo in-process (vive lo que vive next dev / lambda warm).
- **Supabase** — live, project ref `qaakauberbibfgxthlro`, región Frankfurt.

---

## 7. Estructura de archivos clave

```
/agents
  /a1, /a2, /a3, /a4, /debate, /cmt    prompt.ts · schema.ts · client.ts
  /a3/__tests__/isolation.test.ts      ← 32 tests de aislamiento A3
/__tests__/agents/a3-isolation.test.ts ← 33 tests adicionales (mocked SDK)

/app
  /(auth)/{login,signup}/page.tsx
  /analysis/page.tsx                   ← pantalla principal (auto-trigger ?ticker=X)
  /watchlist/page.tsx
  /signals/page.tsx
  /system/page.tsx
  /api
    /agents/{a1,a2,a3,a4,debate}/route.ts  ⚠️ a1/a2/a3/debate SIN AUTH (bloqueador)
    /market/{quote,news}/route.ts
    /watchlist/route.ts + /[itemId]/route.ts
    /signals/route.ts + /[id]/ack/route.ts
    /system/route.ts
    /cmt/scan/route.ts
    /auth/signout/route.ts
  /layout.tsx, /globals.css

/components
  /agents/{a1,a2,a3,a4,debate}-card.tsx
  agent-card-shell.tsx                 ← sweep animation, status dot, header
  asset-input.tsx, bottom-nav.tsx, confluence-indicator.tsx, header.tsx, user-menu.tsx, section-label.tsx

/lib
  anthropic.ts                          ← SDK client + runAgent + retry logic
  /market/alphavantage.ts               ← AV client con cache in-process
  /supabase/{server,browser,admin,middleware}.ts
  ratelimit.ts                          ← Upstash wrapper (NOOP si no hay creds)
  confluence.ts, utils.ts, watchlist.ts

/supabase/migrations/0001_init.sql      ← 5 tablas + 13 RLS + trigger profiles
/scripts/apply-migration.mjs            ← aplica SQL via POSTGRES_URL_NON_POOLING

/types/db/index.ts                      ← hand-written DB types

/_reference
  adam_demo.html                        ← demo HTML/JS original
  design_prompts_gpt5.md                ← 11 prompts UI/UX para GPT-5

middleware.ts                           ← refresh sesión + protege APP_ROUTES + rate-limit
next.config.mjs                         ← headers básicos (X-Frame-Options, etc)
```

---

## 8. Env vars necesarias (.env.local)

```bash
# Anthropic (innegociable)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Alpha Vantage (innegociable hasta migrar a otro provider)
ALPHA_VANTAGE_API_KEY=...

# Supabase (innegociable Sprint 2+)
NEXT_PUBLIC_SUPABASE_URL=https://qaakauberbibfgxthlro.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# (Vercel preset también genera SUPABASE_URL, SUPABASE_ANON_KEY,
#  POSTGRES_URL_NON_POOLING — todos en .env.local pero el código usa
#  los NEXT_PUBLIC_ y SUPABASE_SERVICE_ROLE_KEY directamente)

# Upstash (PENDIENTE — el user tiene que crearlo)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Cron (futuro)
CRON_SECRET=

# Sentry (Sprint 3)
SENTRY_DSN=

# Misc
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 9. Gotchas conocidas

### ⚠️ El harness exporta `ANTHROPIC_API_KEY=` vacía

Cuando Claude Code arranca una sesión, exporta `ANTHROPIC_API_KEY=""` en la shell. Next.js sigue precedencia `process.env > .env.local`, así que ese vacío sobrescribe tu key del archivo. Síntoma: SDK falla con `"Could not resolve authentication method"` aunque `.env.local` tenga la key.

**Workaround**: lanzar dev con `unset ANTHROPIC_API_KEY && next dev` (o equivalente PowerShell `Remove-Item Env:ANTHROPIC_API_KEY`).

### ⚠️ `@supabase/postgrest-js` 2.105.x rompe tipos hand-written

Inserts/updates resuelven a `never[]` aunque `Database` esté bien tipado. Workaround: cast `as any` con `eslint-disable` puntual (ya aplicado en 5 sitios: `lib/watchlist.ts`, `app/api/watchlist/route.ts`, `app/api/agents/a4/route.ts`, `app/api/cmt/scan/route.ts`, `app/api/signals/[id]/ack/route.ts`).

**Solución definitiva**: `npx supabase gen types typescript --project-id qaakauberbibfgxthlro > types/db/supabase.ts` y reemplazar `types/db/index.ts`. Los casts desaparecen.

### ⚠️ Schemas zod con `.max(N)` requieren caps explícitos en el prompt

Si el schema dice `.max(8)` pero el prompt JSON example no lo menciona, el LLM emite 9+ entradas y falla validation. Patrón aplicado: añadir comentarios inline tipo `// máximo 8 elementos` en el JSON example del prompt.

### ⚠️ Campos `nullable` en quotes confunden al modelo

`"field": "string | null"` (todo en comillas) hace que el LLM emita el string `"null"` en vez de JSON `null`. Patrón correcto: `field: string | null` fuera de comillas.

### ⚠️ Alpha Vantage free tier es muy ajustado

25 req/día, 5/min. Una sola ejecución de A4 quema 5 req. Sin Upstash el cache solo dura lo que dure el proceso. Comportamiento esperado: 5-6 análisis y AV te corta.

### ⚠️ pnpm no está en PATH del harness por defecto

Workaround: usar `node node_modules/<binary>` directo. O `cmd.exe //c "npm install <pkg> --legacy-peer-deps"` (peer-deps porque eslint-config-next 14 quiere eslint 8 y el proyecto tiene 9).

---

## 10. Comandos críticos

```bash
# Dev (siempre con unset por el gotcha del harness)
unset ANTHROPIC_API_KEY && node node_modules/next/dist/bin/next dev > dev.log 2>&1 &

# Typecheck
node node_modules/typescript/bin/tsc --noEmit

# Tests
node node_modules/vitest/vitest.mjs run

# Aplicar migration (cuando crees una nueva)
node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/NNNN_*.sql

# Smoke-test full pipeline (1 user logueado vía cookie)
# Necesita estar logueado primero — sin auth el endpoint da 401
curl -s -X POST http://localhost:3000/api/agents/a4 \
  -H "Content-Type: application/json" -b "supabase-auth-cookie=..." \
  -d '{"ticker":"AAPL"}' --max-time 180

# Aplicar el push
git push  # remote ya configurado a https://github.com/damogo94/ADAM.git
```

---

## 11. Próximas acciones priorizadas (cuando retomes)

### Bloque A — Hardening crítico (yo lo puedo hacer sin que tú actúes)

1. Auth en `/api/agents/{a1,a2,a3,debate}` (replicar patrón de `/a4`)
2. `Promise.all` → `Promise.allSettled` en `/api/agents/a4` + A4 prompt/schema tolerante a `null` agents
3. Timeouts: `AbortSignal.timeout(8000)` en AV fetch, `timeout: 25_000` en Anthropic SDK
4. Circuit breaker AV: módulo-level `avThrottledUntil: number`, una vez soft-error no vuelve a pegar AV durante 60s
5. Fail-closed rate-limit en production (`middleware.ts`)
6. Per-user rate-limit en `/api/agents/a4` (20 runs/día/user, usa Upstash si está; memoria si no)
7. Diccionario de errores en UI (`app/analysis/page.tsx`): mapear códigos conocidos a español con acción concreta

### Bloque B — Dependencias del user (concurrente con A)

Ver §5. Resumen: Upstash, desactivar email confirm, verificar trigger, rotar key Anthropic.

### Bloque C — Spec gaps (decidir con el user)

1. Mini-chart velas en A3 card (lightweight-charts) — ~1.5h
2. Sparkline 7D + signal badge en watchlist — ~45 min
3. Slash commands — defer a v2

### Bloque D — Production readiness

1. `vercel.json` con `maxDuration: 300` en `/api/agents/*` (requiere Vercel Pro para >60s) y opcionalmente `crons` para CMT
2. Sentry: `pnpm add @sentry/nextjs && npx @sentry/wizard@latest -i nextjs` — ~30 min
3. Vercel Analytics + Speed Insights — `pnpm add @vercel/analytics @vercel/speed-insights` + 2 tags en layout
4. Token usage tracking en `analyses_log.tokens_used` (sumar `response.usage.input_tokens + output_tokens` de cada call)
5. Branded email templates en Supabase (cuando reactives email confirm)

---

## 12. Memoria persistente (en `~/.claude/projects/.../memory/`)

```
project_adam.md                                       — contexto general
feedback_validate_before_coding.md                    — validar arquitectura antes de codear
reference_adam_env_gotcha.md                          — ANTHROPIC_API_KEY vacía del harness
feedback_strict_schemas_need_explicit_prompt_limits.md — caps + nullables en prompts
reference_postgrest_2x_type_quirk.md                  — casts as-any en inserts
MEMORY.md (index)                                     — lista todas las anteriores
```

Si retomas en otra máquina, la memoria persistente se va con la instalación del harness. En máquina nueva → memoria vacía → este CONTEXT.md es tu referencia primaria.

---

## 13. Git state al cierre de sesión 3

Branch `main` · todos pushed a https://github.com/damogo94/ADAM:

```
* Sprint 3 — observabilidad + UX visual + production deploy (sesión 3)
* hardening: cierra los 4 criticos + per-user limit + Upstash L2 cache
* fix: retry Anthropic transient errors (529 Overloaded incluido)
* docs: CONTEXT.md — handoff document
* Resilience: in-process cache + graceful AV degradation
* Sprint 2 — Auth, watchlist, CMT scanner, persistencia, sistema
* Sprint 2 — Supabase foundations (schema + RLS + clients)
* Initial commit — A.D.A.M. Sprint 1 MVP
```

Identidad: `damogo94 <damogo94@users.noreply.github.com>` (env vars, NO git config global — no tocamos config a petición del owner).

---

## 14. Verdict honesto sobre estado del producto

**El producto está listo para deploy a Vercel.** Los 4 bloqueadores 🔴 de la auditoría están cerrados, los 🟡 también. La única dependencia bloqueante es **la acción humana de crear el proyecto Vercel y pegar env vars**.

**Lo que falta para que el producto sea "completo según spec":**
- **Trade journal** (outcome tracking) — feedback loop del producto, decidir cuándo.
- **Realtime push de signals** — toast cuando llega urgente sin refrescar.
- **Métricas per-agent** (calls/min + latency por A1/A2/A3/A4) — spec lo pedía, hoy solo global.

**Lo que NO va a hacerse** (decisión consciente, post-MVP):
- Slash commands `/plan`, `/macro`, `/cmt`, `/agentes`.

**Riesgos vivos:**
- Hobby plan = maxDuration 60s. Si A4 + Debate Opus tarda más, el lambda muere. Sentry lo capturará. Mitigación: upgrade a Pro cuando crezca uso.
- Alpha Vantage free tier 25/día. Con Upstash L2 ahora aguanta multi-user razonablemente, pero >5 users activos lo desbordan. Mitigación: paid AV tier o cambiar a Finnhub.
- CMT cron cada 6h — agresivo en AV. Si llegas a 4+ users con watchlists de 10+ tickers cada uno, el cron solo te pasará 25 calls AV/día. Considerar bajar a 1d en producción real.

---

**Última cosa**: lee también [README.md](README.md) en paralelo a este archivo. README documenta arquitectura técnica, este documento documenta el estado actual + decisiones. Los dos juntos cubren todo.
