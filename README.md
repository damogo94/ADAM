# A.D.A.M.

**Anomaly Detection & Analysis Module** — sistema multi-agente de análisis financiero. Implementa la filosofía ATLAS CAPITAL con 4 agentes IA especializados + un módulo CMT autónomo.

> ⚠️ **A.D.A.M. NO es un broker.** No ejecuta órdenes ni mueve capital. Es un copiloto de análisis. Todo output es **educativo · no constituye asesoramiento financiero regulado**.

---

## Arquitectura

```mermaid
flowchart TB
    U[Usuario] -->|ticker| API[/api/agents/a4]
    API --> MD[Alpha Vantage · market data]
    MD -->|fan-out paralelo| A1[A1 · Activos<br/>sonnet-4-6]
    MD["Alpha Vantage<br/>quote · overview · news · candles"]
    MD --> A2[A2 · Macro<br/>sonnet-4-6]
    MD --> A3["A3 · Price Action<br/>sonnet-4-6<br/><b>AISLADO</b>"]
    A1 -.anomalia.-> DEB[Debate A1×A2<br/>opus-4-6]
    A2 -.opportunity.-> DEB
    A1 --> A4[A4 · Sistema<br/>opus-4-6]
    A2 --> A4
    A3 --> A4
    DEB --> A4
    A4 --> U
    style A3 fill:#1a1a2e,stroke:#f59e0b,stroke-width:2px
    style DEB fill:#1a1a2e,stroke:#a78bfa,stroke-dasharray:5
```

**Reglas absolutas (non-negotiable):**

1. **A3 está aislado.** Nunca recibe context de A1, A2, news, macro, sentiment, F&G, VIX, encuestas, política, geopolítica. Sólo `ticker` + OHLCV. Enforcement en 3 capas: (a) prompt, (b) firma de función `runA3({ ticker, ohlcv })`, (c) Zod `.strict()` en endpoint.
2. **A4 cita textualmente A3.** No lo reescribe.
3. **El usuario es el único comandante de A3.** Ningún agente le da instrucciones.

---

## Stack

| Capa | Tecnología | Notas |
| --- | --- | --- |
| Frontend | Next.js 14 App Router + TypeScript + Tailwind | Mobile-first, "Deep Space Terminal" |
| UI base | shadcn/ui + componentes custom | Demo HTML como referencia visual |
| Charts | TradingView Lightweight Charts + Recharts | Lightweight para precio, Recharts para sparklines |
| LLM | `@anthropic-ai/sdk` | Modelos por agente — ver tabla abajo |
| Datos | Alpha Vantage free tier | quotes + fundamentals + news+sentiment + candles · **25 req/día / 5 req/min** |
| DB | Supabase (PostgreSQL + RLS) | Sprint 2 |
| Auth | Supabase Auth | Sprint 2 |
| Cache + ratelimit | Upstash Redis | TTL 30s para quotes |
| Deploy | Vercel | Edge para `/api/market/*`, Node para `/api/agents/*` |
| Observabilidad | Sentry + Vercel Analytics | Sprint 3 |

**Modelos asignados:**

| Agente | Modelo | Razón |
| --- | --- | --- |
| A1 (activos) | `claude-sonnet-4-6` | Paralelo, latencia importa |
| A2 (macro) | `claude-sonnet-4-6` | Paralelo, latencia importa |
| A3 (técnico) | `claude-sonnet-4-6` | Rigor + aislamiento |
| Debate | `claude-opus-4-6` | Síntesis crítica |
| A4 (sistema) | `claude-opus-4-6` | Consolidación final |
| CMT scanner | `claude-haiku-4-5` | Batch sobre watchlist, 5min cron |

---

## Estructura

```
/agents
  /a1          prompt.ts · schema.ts · client.ts
  /a2          prompt.ts · schema.ts · client.ts
  /a3          prompt.ts · schema.ts · client.ts   ← aislado
  /a4          prompt.ts · schema.ts · client.ts
  /debate      prompt.ts · schema.ts · client.ts
/app
  /api
    /agents/{a1,a2,a3,a4,debate}/route.ts
    /market/{quote,news}/route.ts
  /analysis    page.tsx                 ← pantalla principal
  layout.tsx · page.tsx · globals.css
/lib
  anthropic.ts    SDK client + runAgent helper
  utils.ts        cn, fmtPct, fmtPrice
  /market
    finnhub.ts    quote · profile · candles · news
/types
  index.ts        AgentState, AnalysisRun, CMTSignal
/components       ← Sprint 1 día 4-6: portar agent-cards, confluence, etc.
```

---

## Variables de entorno

Copia `.env.example` a `.env.local`. Ver [.env.example](./.env.example) para la lista completa.

| Variable | Obligatoria | Notas |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | ✅ | Server-only. Nunca exponer en cliente. |
| `ALPHA_VANTAGE_API_KEY` | ✅ | Free tier **25/día, 5/min** — caché Upstash crítico |
| `NEXT_PUBLIC_SUPABASE_URL` | Sprint 2 | Auth + DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sprint 2 | |
| `SUPABASE_SERVICE_ROLE_KEY` | Sprint 2 | Server-only |
| `UPSTASH_REDIS_REST_URL` | Sprint 1 (cache) | |
| `UPSTASH_REDIS_REST_TOKEN` | Sprint 1 | |
| `CRON_SECRET` | Sprint 2 | Protege `/api/cmt/scan` |
| `SENTRY_DSN` | Sprint 3 | |

---

## Desarrollo local

```bash
pnpm install
cp .env.example .env.local   # rellena ANTHROPIC_API_KEY y ALPHA_VANTAGE_API_KEY mínimo
pnpm dev                     # http://localhost:3000
```

**Comandos:**

- `pnpm dev` — Next con turbo
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — eslint
- `pnpm test` — vitest (unit)
- `pnpm test:e2e` — playwright

**⚠️ Gotcha — entornos con `ANTHROPIC_API_KEY` pre-exportada vacía:**

Algunas shells (incluyendo la del harness de Claude Code) exportan `ANTHROPIC_API_KEY=` vacía al iniciar la sesión. Next.js respeta la precedencia `process.env > .env.local`, así que un valor vacío del shell silencia el de `.env.local` sin error visible (solo aparece el warn `[A.D.A.M.] ANTHROPIC_API_KEY not set` en el log del dev server).

Si lo ves, lanza dev así:
```bash
unset ANTHROPIC_API_KEY && pnpm dev
```
Para diagnosticar el estado del env desde dentro del runtime, basta con crear una API route mínima temporal que lea `process.env.ANTHROPIC_API_KEY` y exponga si está presente.

**Flujo manual de validación end-to-end:**

1. `pnpm dev`
2. Abre http://localhost:3000/analysis
3. Mete `AAPL` y pulsa ▶
4. Deberías ver outputs de A1, A2, A3, A4 (y Debate si A1 o A2 detectan anomalía).

**Smoke-test desde terminal (sin UI):**
```bash
curl -s -X POST http://localhost:3000/api/agents/a4 \
  -H "Content-Type: application/json" \
  -d '{"ticker":"AAPL"}' --max-time 180 | head -c 500
```
Respuesta esperada: JSON con keys `a1`, `a2`, `a3`, `debate` (null si no hubo anomalía), `a4`. Coste aprox por run: 3 calls Sonnet + 1-2 Opus + 5 requests Alpha Vantage (cuidado, free tier = 25/día — caché Upstash es crítico).

---

## Setup de Supabase (Sprint 2)

1. **Crear proyecto Supabase** (free tier: 500MB DB, 2GB transfer, 50K MAU).
   - https://supabase.com/dashboard → New Project
   - Region recomendada: Frankfurt (eu-central-1) o West US según latencia
   - Anota la `Project URL` y guarda la `Database password`

2. **Obtener las 3 keys** desde Project Settings → API:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (segura para cliente, protegida por RLS)
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ NUNCA exponer al cliente — bypasea RLS)

3. **Aplicar el schema** — copia [supabase/migrations/0001_init.sql](./supabase/migrations/0001_init.sql) al SQL Editor del dashboard y ejecuta. Crea:
   - `profiles`, `watchlists`, `watchlist_items`, `signals_history`, `analyses_log`
   - Trigger que auto-crea profile al hacer signup
   - RLS policies por tabla (cada user sólo ve lo suyo)
   - Inserts a `signals_history` y `analyses_log` desde server requieren service_role

4. **Validar RLS**: en SQL Editor: `select * from pg_policies where schemaname = 'public';` debe devolver al menos 11 policies.

5. **Pegar las keys en `.env.local`** y reiniciar `pnpm dev`. La sesión de Supabase persiste vía cookies, leída por `lib/supabase/server.ts`.

**Regenerar types tras cambios de schema:**
```bash
npx supabase gen types typescript --project-id YOUR_REF > types/db/supabase.ts
```
Y re-exporta desde `types/db/index.ts`. Hasta entonces, los tipos hand-written en [types/db/index.ts](./types/db/index.ts) son la fuente de verdad.

---

## Deploy a Vercel

1. `vercel link` desde el repo
2. Configurar env vars en Vercel dashboard (Settings → Environment Variables) con las mismas que `.env.local`
3. `git push` a `main` → deploy automático
4. Verificar logs en Vercel → Functions → `/api/agents/a4` (Node runtime, 60s timeout)

**Configuración de Vercel Cron (Sprint 2):**

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cmt/scan", "schedule": "*/5 * * * *" }
  ]
}
```

---

## Checklist de seguridad

- [x] `ANTHROPIC_API_KEY` y `ALPHA_VANTAGE_API_KEY` sólo en server (nunca `NEXT_PUBLIC_*`)
- [x] Validación Zod en todos los endpoints antes de invocar SDK
- [x] `Z.strict()` en `/api/agents/a3` para rechazar campos extra (refuerza aislamiento)
- [x] Headers `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` en `next.config.mjs`
- [ ] Rate limiting con `@upstash/ratelimit` (Sprint 1 hardening)
- [ ] RLS Supabase activado en todas las tablas (Sprint 2)
- [ ] CSP headers (Sprint 3)
- [x] Disclaimer educativo presente en footer y system prompt de A4

---

## Tests críticos — aislamiento de A3

Cubierto por dos suites complementarias (65 tests entre ambas):

- [`__tests__/agents/a3-isolation.test.ts`](./__tests__/agents/a3-isolation.test.ts) — mocks del SDK, verifica que `runA3` rechaza inputs con campos prohibidos ANTES de llamar al modelo, comprueba que el mensaje de error nombra el campo ofensor, y aplica un *sanity check inverso* sobre la lista de herramientas permitidas (✅) para detectar capacidades prohibidas disfrazadas.
- [`agents/a3/__tests__/isolation.test.ts`](./agents/a3/__tests__/isolation.test.ts) — enumera los términos prohibidos uno a uno, hace snapshot del prompt completo (cualquier cambio fuerza review), y comprueba que el schema de output no expone campos `sentiment`/`news`/`macro`/`fundamentals`.

`pnpm test` corre ambas. Si una falla, **no se debilita el test — se rechaza el cambio que la rompió**.

---

## Sprints

**Sprint 1 — MVP funcional:**
- [x] Scaffold + configs
- [x] 5 system prompts + 5 schemas + 5 clients
- [x] API routes (4 agentes + debate + market proxy)
- [x] Pantalla ANÁLISIS visual completa con componentes Deep Space Terminal (agent cards, confluence indicator, bottom nav)
- [x] Tests de aislamiento de A3 (65 tests entre dos suites complementarias)
- [x] Smoke-test end-to-end verificado con AAPL — pipeline `a1+a2+a3 → debate? → a4` completo
- [x] Error reporting robusto: zod issues surfaced en respuesta API, raw output logueado en dev cuando schema falla
- [x] Parser tolerante a fences `` ```json `` abiertas sin cierre (caso real cuando max_tokens corta la respuesta)
- [ ] Rate limiting Upstash conectado (middleware ya escrito, faltan credenciales)
- [ ] Deploy Vercel inicial

**Sprint 2 — Persistencia + CMT:**
- [x] Supabase schema + migrations + RLS ([supabase/migrations/0001_init.sql](./supabase/migrations/0001_init.sql))
- [x] DB types TypeScript + clients (`lib/supabase/{server,browser,admin}.ts`)
- [x] Auth flows: login/signup pages + session middleware (`@supabase/ssr`)
- [x] Header user menu con logout
- [x] Watchlist screen + CRUD endpoints (`/api/watchlist`)
- [x] Persistencia de `analyses_log` al ejecutar A4 (admin client)
- [x] Módulo CMT autónomo (prompt + schema + cliente Haiku, mismo aislamiento que A3)
- [x] Scanner CMT (`POST /api/cmt/scan`) — escanea watchlist del user
- [x] Pantalla SEÑALES con copy-to-clipboard y mark-as-read
- [x] Pantalla SISTEMA con métricas reales de `analyses_log` + `signals_history`
- [ ] Cron multi-user del CMT scanner (Vercel cron, Sprint 2.5)

**Sprint 3 — Pulido:**
- [ ] Pantalla SISTEMA con métricas reales
- [ ] Animaciones (sweep, blink, urg-pulse) — ya en tailwind.config
- [ ] Sentry + Analytics
- [ ] Playwright E2E críticos

---

## Continuar en Claude Code (CLI)

Esta sesión inició el proyecto en Cowork. Para el ciclo iterativo (instalar deps, levantar dev server, iterar UI con la demo HTML como referencia), abre **Claude Code** en el directorio del proyecto:

```bash
cd C:\Users\CRIS-\Documents\Claude\Projects\ADAM
claude
```

**Primer prompt sugerido para Claude Code:**

> Sigo desde Cowork. El scaffold está completo (5 prompts + schemas + clients + API routes + pantalla ANÁLISIS funcional). Próximo paso: `pnpm install`, `pnpm dev`, validar end-to-end con `AAPL`. Luego portar la estética visual completa de `_reference/adam_demo.html` a `app/analysis/page.tsx` respetando los componentes (agent cards, indicador de confluencia con 5 puntos × 3 niveles, etc.). Lee `README.md` para contexto completo.

> Coloca `adam_demo.html` en `_reference/` (carpeta nueva) si quieres que Claude Code lo tenga a mano.

---

## Disclaimer

A.D.A.M. produce análisis educativo. No constituye asesoramiento financiero regulado. No tomes decisiones de inversión basadas exclusivamente en estos outputs. Consulta a un asesor profesional certificado antes de operar.
