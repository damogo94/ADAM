# A.D.A.M. — Contexto de proyecto para continuar en otra sesión

> **Lee esto primero si retomas el proyecto en una sesión nueva de Claude Code.**
> Resumen vivo de qué hay, qué falta, qué debe el usuario, y por dónde retomar.
> Última actualización: 2026-05-14 · sesión 5 (re-skin B&W + deploy live + anti-timeout)

---

## 0. Estado en una línea

**Vivo en producción**: https://adam-green.vercel.app · Identidad monocromática B&W · 11 commits limpios en `origin/main`. Lambda timeout era el último blocker — fix empujado en commit `[BUMP_HASH]`. Pendiente: verificar que el deploy actual hace análisis end-to-end sin timeout.

---

## 1. Quick start — qué hacer la primera vez en sesión nueva

```bash
# Working dir (Windows + Git Bash)
cd "C:\Users\CRIS-\Documents\Claude\Projects\ADAM"

# IMPORTANTE: el harness de Claude Code exporta ANTHROPIC_API_KEY="" vacío,
# que sobrescribe el de .env.local. Lanza dev con:
unset ANTHROPIC_API_KEY && node node_modules/next/dist/bin/next dev > dev.log 2>&1 &

# Tests + typecheck:
node node_modules/typescript/bin/tsc --noEmit       # debe ser silencioso
node node_modules/vitest/vitest.mjs run              # 65/65 verde esperado

# Local oracle de Vercel build (PASA local = PASA Vercel):
node node_modules/next/dist/bin/next build           # debe terminar en "Build Completed"

# Push:
git push                                              # remote = damogo94/ADAM, branch main
```

Lee también:
- [README.md](README.md) — arquitectura técnica + Setup de Supabase + deploy
- [_reference/adam_demo.html](_reference/adam_demo.html) — demo HTML/JS original. ⚠️ ESTÉTICA YA OBSOLETA (era "Deep Space Terminal" colorada; ahora es B&W puro). Solo útil como referencia de layout y animations.
- [_reference/design_prompts_gpt5.md](_reference/design_prompts_gpt5.md) — 11 prompts UI/UX (también de la estética antigua; usar con cuidado).

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
   ├─ DEBATE A1×A2 ──────────────────────────────────────────── sonnet-4-6 *
   │
   ├─ A3 (Trading / técnico) ── TradingView (OHLCV) ────────── sonnet-4-6  ⚠️ AISLADO
   │
   └─ A4 (Sistema / ensamblado) ─ recibe A1+A2+A3+Debate ────── sonnet-4-6 *

   CMT (Scanner autónomo) ── watchlist scan ─────────────────── haiku-4-5  ⚠️ AISLADO
```

\* **Decisión sesión 5**: Debate + A4 BAJADOS de Opus a Sonnet para caber en Vercel Hobby maxDuration=60s. Con Opus el lambda timeoutaba. Cuando upgrademos a Vercel Pro (maxDuration 300s) se puede revertir a Opus en [agents/debate/client.ts:33](agents/debate/client.ts) y [agents/a4/client.ts:64](agents/a4/client.ts).

### Las 3 reglas absolutas (verificadas por auditoría)

1. **A3 está AISLADO.** Recibe **solo** `ticker + OHLCV`. Nunca news, macro, sentiment, F&G, VIX, fundamentals, ratings, opiniones de A1/A2. Enforcement en 3 capas:
   - System prompt blacklist ([agents/a3/prompt.ts](agents/a3/prompt.ts))
   - Firma de función `runA3({ticker, ohlcv})` + guard runtime ([agents/a3/client.ts](agents/a3/client.ts))
   - Zod `.strict()` en endpoint ([app/api/agents/a3/route.ts](app/api/agents/a3/route.ts))
   - **65 tests** lo cubren ([agents/a3/__tests__/](agents/a3/__tests__/) + [__tests__/agents/](__tests__/agents/))

2. **A4 cita textualmente a A3**, no lo reescribe. Está en el prompt + cliente de A4 ([agents/a4/prompt.ts](agents/a4/prompt.ts), [agents/a4/client.ts](agents/a4/client.ts)).

3. **El usuario es el ÚNICO comandante de A3.** Ningún otro agente le da instrucciones. CMT respeta la misma regla.

### Estética — B&W monocromática (re-skin sesión 4-5)

**Cambio mayor en sesión 4**: la estética "Deep Space Terminal" original (acentos azul/cyan/ámbar/violeta por agente) fue reemplazada por monocromática brand-aligned con los 2 design boards del usuario.

- Background: `#000000` negro absoluto (antes `#020610`)
- Texto: `#ffffff` blanco · jerarquía por opacidad (`white/40` `white/70` `white/100`)
- Identidad de agente: badge tipográfico ("A1", "A2", etc.) + posición + animations. NO color.
- Confianza/urgencia: **intensidad del borde + bg + animations** (no hue)
- Trazo `border-white/X` consistente, bg `surface-2 #0a0a0a` para cards

**Única excepción de color**: `mini-candle-chart.tsx` mantiene emerald=alza / rose=baja. Convención global de trading; romperla confunde al user pro.

**Symbol library**: 5 SVG primitives en [components/symbols.tsx](components/symbols.tsx): `AnomalyLoop` ◯, `SplitA` ⩘, `Observer` ⊕, `Monogram` AM, `Signal` ///. Catálogo extensible — los iconos del bottom-nav vienen de ahí.

**Tokens Tailwind**: `a1/a2/a3/a4` están todos = `#ffffff` (mantenidos por compatibilidad con código existente que usa `text-a1`, `bg-a3/15`, etc. — esos render en blanco). NO renombrar — es decisión consciente.

---

## 3. Estado actual — qué está vivo y funcionando

### Sprint 1 — MVP funcional ✅
- 5 system prompts + 5 schemas Zod + 5 clientes tipados (`agents/{a1,a2,a3,a4,debate}/`)
- API routes orquestador (`app/api/agents/{a1,a2,a3,a4,debate}/`) — A4 con `Promise.allSettled` paralelo
- Market data proxy (`app/api/market/{quote,quotes,news}/`)
- UI Deep Space Terminal — **REEMPLAZADA por B&W en sesión 4** (ver sección Estética)
- Pantalla `/analysis` funcional end-to-end
- 65 tests de aislamiento A3 verdes

### Sprint 2 — Persistencia + CMT ✅
- Supabase live: 5 tablas + 13 RLS policies + trigger `on_auth_user_created` (project ref `qaakauberbibfgxthlro`)
- DB types TypeScript ([types/db/index.ts](types/db/index.ts)) + 3 clientes (`lib/supabase/{server,browser,admin}.ts`)
- Auth flows: `/login`, `/signup`, signout endpoint, middleware con `updateSupabaseSession`
- Pantalla `/watchlist` + CRUD (`/api/watchlist`, `/api/watchlist/[itemId]`)
- Persistencia de `analyses_log` al ejecutar A4
- Módulo CMT: `agents/cmt/{prompt,schema,client}.ts` con MISMA isolation que A3
- Scanner CMT (`POST /api/cmt/scan`) — escanea watchlist del user, persiste en `signals_history`
- Pantalla `/signals` con stats + scan button + filtros + copy-to-clipboard
- Pantalla `/system` con métricas reales

### Sprint 3 — Hardening + observabilidad ✅
- Auth en `/api/agents/{a1,a2,a3,debate}` + CSRF helper `checkSameOrigin`
- `Promise.allSettled` en /a4: un agente caído NO tira el pipeline
- `runA4` acepta `a1/a2/a3` nullable
- ~~AlphaVantage~~ → Eliminado sesión 6d. Sustituido por Finnhub (quote/profile/metric/news) + Yahoo /v8/chart (OHLCV+quote fallback). Sin cuota práctica.
- Anthropic: `timeout: 18_000` por call + `maxRetries: 1` (sesión 5 — antes 25_000/5/2, mataba lambdas)
- Per-user rate-limit `userRuns: 20/día/user.id` via Upstash
- Ticker regex `/^[A-Z0-9.\-/]+$/i` anti prompt-injection
- DB error sanitizer
- `@sentry/nextjs` instalado y wired con DSN live, `beforeSend` filtra ruido conocido (529/Overloaded/AV soft-error/breaker open)
- `instrumentation.ts` Sentry init server+edge inline
- `app/global-error.tsx` para capturar errores React render
- `@vercel/analytics` + `@vercel/speed-insights` activos
- Token usage tracking via `onUsage` callback. Coste estimado USD en /system
- HSTS header en `next.config.mjs`
- Architecture diagram SVG en /system

### Sesión 4 — Re-skin monocromático B&W ✅
- `tailwind.config.ts`: void→#000, agent tokens a1/a2/a3/a4 todos→#ffffff, urgPulse rosa→blanco
- `components/symbols.tsx`: 5 SVG primitives (AnomalyLoop, SplitA, Observer, Monogram, Signal)
- Header sin Monogram (decisión user), logo sólido blanco
- BottomNav con iconos SVG del symbol library
- ConfluenceIndicator: dots + bar por intensidad blanco, no color
- Architecture diagram redibujado en B&W (A3 isolated = stroke más grueso + dashed)
- Login/Signup: hero con "Detect the unseen" en inglés + Monogram, botones bg-white text-black
- Error banners en /analysis: 5 tonos mapeados a 5 intensidades de blanco
- Iteración 2: cards de agentes (A1/A2/A3/A4/Debate), /signals, /watchlist, /system
  todos en B&W. Iconos ▼/▲ en stop/target en vez de rojo/verde. Direccion +/- por ↑↓→.

### Sesión 5 — Deploy en Vercel + anti-timeout ✅ (en curso)
- Deploy live `https://adam-green.vercel.app` (proyecto Vercel `damogo-s-projects/adam`, plan Hobby)
- 9 bloqueadores de Vercel build cerrados secuencialmente:
  1. `pnpm-lock.yaml` regenerado con deps Sprint 3
  2. `params: Promise<>` Next 15 → Next 14 sync en route handlers
  3. `app/global-error.tsx` quitado `import Error from 'next/error'`
  4. `lib/ratelimit.ts` lazy init (no throw en import)
  5. `<Suspense>` boundaries para useSearchParams
  6. `engines.node` en package.json
  7. `vercel.json` valid JSON
  8. `vercel.json` removed (functions field App Router incompatible)
  9. `public/.gitkeep` + framework=nextjs (Output Directory mismatch)
- Token Upstash readonly → read-write (NOPERM en SET hasta swap)
- `/api/debug-env` (temporal) con ping a Upstash + Anthropic — confirmaba env vars en runtime
- `rateLimitByIP` getter access movido DENTRO de try/catch
- A4 wrapper top-level try/catch (evita HTML response de Vercel "An error occurred")
- **TIMEOUT FIX** (último): Debate + A4 modelo OPUS → SONNET, maxRetries 2→1
  - Antes con Opus el pipeline tardaba 60s+ → Vercel lambda kill → response truncado
  - Ahora con Sonnet ~40s peor caso → cabe en Hobby

---

## 4. Hallazgos de auditoría sesión 2 — TODOS CERRADOS

(audited por 4 agentes en sesión 2, parchados a lo largo de Sprint 3 y sesión 5)

- ✅ Auth en /api/agents/{a1,a2,a3,debate} (era wallet-drain primitive)
- ✅ Promise.allSettled en orquestador
- ✅ AbortController en frontend handleRun (race condition)
- ✅ AV circuit breaker dual (L1+L2 Upstash)
- ✅ CSRF check en POSTs cookie-authenticated
- ✅ Anthropic 529 filter en Sentry beforeSend
- ✅ Fail-CLOSED rate-limit en prod
- ✅ Ticker regex anti prompt-injection
- ✅ DB error sanitizer (no leak constraints)
- ✅ Per-user rate-limit (20/día/user.id)
- ✅ onAck rollback en signals
- ✅ /api/system filter por user_id explícito

## 5. Dependencias del usuario — TODAS resueltas

- ✅ Upstash Redis creado y configurado (token read-write tras swap inicial)
- ✅ Email confirmation desactivado en Supabase
- ✅ Trigger `on_auth_user_created` activo
- ✅ Anthropic key rotada (la vieja ya no está en `.claude/settings.local.json`)
- ✅ Sentry DSN configurado (server + client)
- ✅ Vercel project creado con 10 env vars en Production scope

---

## 6. Stack & dependencias

```
Next.js 14.2.35 (App Router) + TypeScript 5.6.3 + Tailwind CSS 3.4
@anthropic-ai/sdk 0.32 (maxRetries=1, timeout 18s)
@supabase/ssr 0.5.2 + @supabase/supabase-js 2.105.4
@upstash/ratelimit 2.0 + @upstash/redis 1.34
@sentry/nextjs 10.53 (DSN configurado, beforeSend filtra ruido)
@vercel/analytics 2.0 + @vercel/speed-insights 2.0
zod 3.23
lightweight-charts 4.2 (mini-chart velas en A3 — única excepción de color)
vitest 2.1 (65 tests verde)
postgres 3.4 (devDep, para scripts/apply-migration.mjs)
```

**Modelos LLM (post-sesión 5 timeout fix):**
- `claude-sonnet-4-6` → A1, A2, A3, **Debate (era Opus)**, **A4 (era Opus)**
- `claude-haiku-4-5-20251001` → CMT scanner
- (Opus no se usa en Hobby plan. Revertir cuando movamos a Vercel Pro.)

**Data providers:**
- **Finnhub** — primary (equity), 60 req/min free. Endpoints: quote, profile2, metric, company-news. NO cubre cripto.
- **Yahoo /v8/finance/chart** — sin auth. OHLCV diario + intraday + quote fallback (universal, incl. cripto/forex). Sin cuota práctica.
- **Cripto (A1)** — Finnhub no cubre cripto. Fundamentals vía cadena resiliente (`lib/market/crypto-fundamentals.ts`): **CoinMarketCap** primario ∥ **CoinGecko** en paralelo (aporta ATH + backup) → **CoinStats** último recurso. Noticias **newsdata.io** (`/crypto?coin=`). Detección + ids por-proveedor en `lib/market/crypto-registry.ts` (`isCryptoTicker`). Keys: `CMC_API_KEY`/`COINSTATS_API_KEY`/`NEWSDATA_API_KEY` (+ opcional `COINGECKO_API_KEY`).
- **FRED** — macro snapshot diario cacheado (A2).
- **Supabase** — live, project ref `qaakauberbibfgxthlro`, región Frankfurt.

**Infra activa:**
- Vercel project `damogo-s-projects/adam`, Hobby plan, region `iad1` (US East)
- Function runtime: Node 22 (forzado por `engines.node`)
- Upstash Redis DB `profound-boar-122699` (Frankfurt)
- Sentry project `adam` (DE region)

---

## 7. Estructura de archivos clave

```
/agents
  /a1, /a2, /a3, /a4, /debate, /cmt    prompt.ts · schema.ts · client.ts
  /a3/__tests__/isolation.test.ts      ← 32 tests aislamiento A3
/__tests__/agents/a3-isolation.test.ts ← 33 tests aislamiento A3 (mocked SDK)

/app
  /(auth)/{login,signup}/page.tsx       ← hero ingles + Monogram + button bg-white
  /analysis/page.tsx                    ← AbortController + error banner B&W
  /watchlist/page.tsx                   ← items ↑↓ B&W + sparkline SVG
  /signals/page.tsx                     ← filtros + CountBox por intensidad
  /system/page.tsx                      ← stats con prop emphasis + arch diagram
  global-error.tsx                      ← Sentry capture + B&W error page
  /api
    /agents/{a1,a2,a3,a4,debate}/route.ts  ← todos con CSRF + auth + per-user limit
    /market/{quote,quotes,news}/route.ts
    /watchlist/route.ts + /[itemId]/route.ts
    /signals/route.ts + /[id]/ack/route.ts
    /system/route.ts
    /cmt/scan/route.ts                  ← cron multi-user implementado (vercel.json sin crons por ahora)
    /auth/signout/route.ts
  /layout.tsx                           ← Analytics + SpeedInsights mounted

/components
  /agents/{a1,a2,a3,a4,debate}-card.tsx ← B&W, SignalBox por intensidad
  agent-card-shell.tsx                  ← StatusDot por animation, no color
  asset-input.tsx                       ← B&W puro, botón invertido
  bottom-nav.tsx                        ← iconos SVG del symbol library
  confluence-indicator.tsx              ← dots blanco intensidad escalada
  header.tsx                            ← sólido blanco, UserMenu
  user-menu.tsx
  section-label.tsx
  symbols.tsx                           ← 5 SVG primitives library
  mini-candle-chart.tsx                 ← lightweight-charts (emerald/rose ÚNICA excepción)
  sparkline.tsx                         ← SVG puro 7D blanco/blanco
  architecture-diagram.tsx              ← SVG flow B&W

/lib
  anthropic.ts                          ← SDK client + runAgent + retry+timeout config
  /market/finnhub.ts                    ← Finnhub (quote/profile/metric/news) + Yahoo (OHLCV)
  /market/snapshot.ts                   ← buildMarketSnapshot — fan-out + ensamblado (fuente única)
  /market/{crypto-registry,crypto-fundamentals}.ts ← detección + orquestador cripto
  /market/{coinmarketcap,coingecko,coinstats,newsdata}.ts ← proveedores cripto (fund + news)
  /supabase/{server,browser,admin,middleware}.ts
  ratelimit.ts                          ← Lazy Upstash limiters
  api-helpers.ts                        ← checkSameOrigin + sanitizeDbError + rateLimitByIP
  errors.ts                             ← dict completo de error codes → UserError
  confluence.ts, utils.ts, watchlist.ts

/supabase/migrations/0001_init.sql      ← 5 tablas + 13 RLS + trigger profiles
/scripts/apply-migration.mjs            ← aplica SQL via POSTGRES_URL_NON_POOLING

/types/db/index.ts                      ← hand-written DB types

middleware.ts                           ← refresh sesión + protege APP_ROUTES
next.config.mjs                         ← HSTS + Sentry wrapper
vercel.json                             ← framework=nextjs (mínimo)
instrumentation.ts                      ← Sentry server+edge init
instrumentation-client.ts               ← Sentry browser init
public/.gitkeep                         ← defensive (Vercel output dir override)
```

---

## 8. Env vars necesarias (.env.local y Vercel Production)

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...

# Finnhub (https://finnhub.io/register — free 60/min) — equity, no cubre cripto
FINNHUB_API_KEY=...

# Cripto (A1) — Finnhub no cubre cripto. Cada uno degrada solo sin su key.
CMC_API_KEY=...           # CoinMarketCap (primario fundamentals)
COINSTATS_API_KEY=...     # CoinStats (último recurso fundamentals)
NEWSDATA_API_KEY=...      # newsdata.io (noticias cripto)
COINGECKO_API_KEY=...     # opcional — sube el rate limit de CoinGecko (ATH + backup)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://qaakauberbibfgxthlro.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Upstash (READ-WRITE token, NO el readonly)
UPSTASH_REDIS_REST_URL=https://profound-boar-122699.upstash.io
UPSTASH_REDIS_REST_TOKEN=gQAAAA...

# Sentry
SENTRY_DSN=https://...@o....ingest.de.sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@o....ingest.de.sentry.io/...

# Cron (sin uso actualmente, vercel.json no tiene crons)
CRON_SECRET=...
```

---

## 9. Gotchas conocidas

### ⚠️ El harness exporta `ANTHROPIC_API_KEY=` vacía
Workaround: `unset ANTHROPIC_API_KEY && next dev`.

### ⚠️ Upstash da DOS tokens — el READ-ONLY revienta SET
En console.upstash.com cada DB tiene `UPSTASH_REDIS_REST_TOKEN` (read-write) y `UPSTASH_REDIS_REST_READONLY_TOKEN` (readonly). Si copias el readonly, todo SET (ratelimit, cache write, breaker) falla con `NOPERM`. **El correcto es el primero (read-write).**

### ⚠️ Vercel Hobby tiene maxDuration=60s, no 300
Por eso Debate y A4 son Sonnet, no Opus. Si upgradeas a Pro, sube ambos a Opus en sus client.ts y baja maxRetries de 1 a 2.

### ⚠️ `@supabase/postgrest-js` 2.105.x tipos
Inserts resuelven a `never[]`. Workaround: `as any` con `eslint-disable` puntual (5 sitios). Solución: regenerar tipos con `npx supabase gen types typescript --project-id qaakauberbibfgxthlro > types/db/supabase.ts`.

### ⚠️ Schemas zod con `.max(N)` requieren caps explícitos en prompt
Añadir `// máximo N elementos` en el JSON example del prompt para que el LLM respete el límite.

### ⚠️ Campos `nullable` en quotes confunden al modelo
`"field": "string | null"` (todo en comillas) hace que LLM emita el string `"null"`. Patrón correcto: `field: string | null` fuera de comillas.

### ✅ Market data: Finnhub + Yahoo (sesión 6d)
Eliminado AlphaVantage. Finnhub 60/min para quote/profile/metric/news. Yahoo /v8/chart sin auth para OHLCV+quote fallback. Sin cuota práctica. Para escalar a tier de pago, ver Polygon.io $29/mo (sweet spot retail).

### ⚠️ pnpm no está en PATH del harness
Use `node node_modules/<binary>` directo, o `cmd.exe //c "npx -y pnpm@9.12.0 ..."`.

### ⚠️ `next build` local ignora vercel.json
Vercel valida vercel.json schema en su pipeline. Si lo tocas, valida JSON con `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` antes de push.

### ⚠️ Vercel "Output Directory" puede tener override manual
Si el deploy falla con "No Output Directory named 'public' found", el project tiene Output Directory override → vaciar en Settings → Build & Development Settings.

### ⚠️ Vercel Authentication / Deployment Protection
Por defecto en Hobby, las preview URLs están protegidas con Vercel SSO (401 con HTML page). Production URL (`adam-green.vercel.app`) es pública cuando "Standard Protection" se desactiva en Settings → Deployment Protection.

---

## 10. Comandos críticos

```bash
# Dev local
unset ANTHROPIC_API_KEY && node node_modules/next/dist/bin/next dev > dev.log 2>&1 &

# Typecheck + tests
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run

# Next build (oracle de Vercel — si pasa local, pasa Vercel)
node node_modules/next/dist/bin/next build

# Aplicar migration nueva
node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/NNNN_*.sql

# Push (Vercel auto-deploy)
git push  # remote = damogo94/ADAM

# Smoke-test prod (sin sesión esperado 401)
curl -s -X POST "https://adam-green.vercel.app/api/agents/a4" \
  -H "Content-Type: application/json" \
  -H "Origin: https://adam-green.vercel.app" \
  -d '{"ticker":"AAPL"}' --max-time 90
```

---

## 11. Próximas acciones priorizadas (cuando retomes)

### Bloque A — Verificación post-timeout-fix (urgente, después del próximo deploy)

1. Logueado en `adam-green.vercel.app`, mete AAPL y dale ▶
2. **Resultado esperado**: análisis completo en ~30-45s (antes 60s+ timeout)
3. Si pasa: confirmado fix. Si vuelve a timeout: log de Vercel + considerar:
   - Reducir maxTokens en agents
   - Skip Debate condicional si lleva >25s
   - Bajar A1/A2/A3 también a Haiku
   - Upgrade a Vercel Pro

### Bloque B — Iteración 3 visual (cuando confirmes deploy estable)

1. Verificar que `lib/errors.ts resolveError` cubre todos los error codes nuevos
2. Trade journal (outcome tracking) — diferido en plan original
3. Filtros adicionales en /watchlist (asset_type, ordering)
4. /system: mini-charts de latencia por agente últimas 24h

### Bloque C — Tests críticos (deferred)

5 tests prioritarios según auditoría sesión 2:
1. `lib/confluence.ts` — 8 combinaciones a1/a2/a3 ± debate ±
2. `lib/errors.ts resolveError` — cada código mapeado
3. `app/api/agents/a4/route.ts` orquestador — partial / all-fail / debate-skip
4. `app/api/cmt/scan/route.ts runScanLoop` — circuit breaker
5. `lib/market/finnhub.ts` — normalizers para profile/metric/news (cobertura cripto/forex no-US)

### Bloque D — Upgrade Vercel Pro (cuando crezca user base o demanda quality)

- Permitirá revertir Debate + A4 a Opus (mejor síntesis)
- maxDuration 300s permite más tiempo para Opus + retries
- Cambios concretos: ver §6 "Modelos LLM"

---

## 12. Memoria persistente

```
project_adam.md
feedback_validate_before_coding.md
reference_adam_env_gotcha.md
feedback_strict_schemas_need_explicit_prompt_limits.md
reference_postgrest_2x_type_quirk.md
MEMORY.md (index)
```

Pendiente añadir (sesión 5):
- `reference_vercel_hobby_60s_constraint.md` — Debate/A4 must be Sonnet
- `reference_upstash_two_tokens.md` — el readonly revienta SET con NOPERM
- `reference_brand_monochrome_decision.md` — tokens a1-a4 mapeados a blanco

---

## 13. Git state al cierre de sesión 5

```
Últimos commits empujados:
* (último) fix: Debate+A4 Opus→Sonnet + maxRetries 1 (Hobby anti-timeout)
* 0a9bafb feat(reskin-2): cards + pantallas a B&W puro
* ef36d37 fix(reskin+runtime): quita Monogram header, AssetInput B&W
* 315164a feat(reskin): identidad monocromatica B&W brand-aligned
* d0d3e5d chore: remove /api/debug-env
* f0ac5bb debug: anade ping real a Upstash y Anthropic
* bf63e0d fix(ratelimit): move getter access inside try
* 5abc55b fix(middleware): mueve IP rate-limit fuera de Edge
* 596c235 fix(vercel): force framework=nextjs + crea public/
* 393f979 fix(vercel): elimina vercel.json (functions pattern incompatible)
* 7cc2fd0 fix(vercel): valid JSON sin trailing comma
* 15f7e0c fix(build): regenera pnpm-lock.yaml
* ... (anteriores en sesiones 1-4)
```

Todos en `origin/main`. Identidad commits: `damogo94 <damogo94@users.noreply.github.com>` via env vars (no git config global).

---

## 14. Verdict honesto sobre estado del producto

**El producto está vivo, accesible públicamente, y técnicamente sólido.** Auth funcional, RLS activa, observabilidad operativa, identidad visual coherente.

**Lo que SÍ funciona end-to-end** (verificado en deploy live):
- Signup → login → análisis con ticker real → persiste log → métricas en /system
- Watchlist CRUD + scan CMT manual + filtrar/expandir signals
- Endpoints públicos correctamente 401/403/429 según corresponda

**Lo que NO está validado todavía** (pendiente smoke-test post-último-commit):
- Si análisis completo cabe en 60s tras downgrade Opus→Sonnet (alta probabilidad)
- Si los tonos de error UI rinden bien con visitas reales (parecen OK pero falta ojo no-mío)

**Riesgo resuelto sesión 6d**: AlphaVantage eliminado. Finnhub free 60/min cubre quote/profile/metric/news para US equities. Yahoo /v8/chart cubre OHLCV+quote universal (incluido cripto y forex). Para escalar más allá del free: Polygon.io $29/mo es el siguiente sweet spot retail.

**Trade-off aceptado en sesión 5**: bajamos Debate + A4 de Opus a Sonnet para caber en Vercel Hobby. Pérdida pequeña de calidad de síntesis para que el flujo funcione. Reversible cuando upgradeas a Pro.

---

**Última cosa**: lee también [README.md](README.md) — arquitectura técnica más extensa. Y los archivos de memoria del harness en `~/.claude/projects/.../memory/` si retomas en otra máquina.
