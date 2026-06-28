# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # next dev --turbo, http://localhost:3000
pnpm typecheck        # tsc --noEmit
pnpm lint             # next lint
pnpm test             # vitest run (unit)
pnpm test:watch       # vitest watch
pnpm test:e2e         # playwright
pnpm format           # prettier
pnpm build && pnpm start

# Single test file / pattern
pnpm test agents/a3/__tests__/isolation.test.ts
pnpm test -t "A3 isolation"
```

Engines: Node ≥20 <23 (Node 24 works with a benign engine warning). Canonical package manager is **pnpm@9.12.0** (`packageManager` field); if pnpm isn't on PATH, run everything via `corepack pnpm …`. ESLint is wired up (`.eslintrc.json` → `next/core-web-vitals` + `@typescript-eslint` plugin so disable-directives resolve); `pnpm lint` runs clean (only non-blocking warnings). eslint is pinned to **8.57.1** to satisfy `eslint-config-next@14`'s peer — do **not** bump it back to 9 without moving config-next too. **CI** (`.github/workflows/ci.yml`) runs `install --frozen-lockfile → typecheck → lint → test` on every PR and push to `main`.

Feature branches follow the `feat/*` / `redesign/*` pattern; merging one into `main` (and pushing `main`) triggers the Vercel production deploy.

## Architecture (big picture)

A.D.A.M. is a multi-agent analysis copilot. **It is not a broker** — it never executes trades. The output is educational JSON consumed by the Next.js UI under `/analysis`.

### The four agents + debate

Model assignment (ADR-001, referenced inline in `agents/a3/narrate.ts` and `agents/debate/prompt.ts`):

| Agent | Role | Model | Notes |
| --- | --- | --- | --- |
| A1 | Asset micro-snapshot | Haiku (narrate) | News + fundamentals + quote |
| A2 | Macro context | Sonnet | FRED-style series cached in `lib/a2-cache.ts` (Upstash, TTL ~24h) |
| A3 | **Price action — isolated** | Haiku (narrate) + code (compute) | OHLCV only. See "A3 isolation" below. |
| Debate | Synthesis A1×A2 | Sonnet | Fires only if A1 or A2 flag a signal — downgraded from Opus to fit Hobby 60s lambda |
| A4 | System consolidator | Haiku (narrate) + code (confluence) | Final user-facing JSON; cites A3 verbatim |
| CMT scanner | Watchlist scan | **code (determinista, sin LLM)** | Reusa `computeTechnical()` vía `agents/cmt/build-signal.ts` (`buildCMTSignal`). Cron-driven via `/api/cron/watchlist-scan`. Señal siempre `1D`; intraday → MTF (no genera 1H). R/B≥1.5 forzado en código. |

**If you change model assignment, update `MODELS` in `lib/anthropic.ts` AND the corresponding `narrate.ts` / `client.ts`. The costs and latency budget assume this allocation.**

### Pipeline shape — `runADAM()` is the primary path

`app/analysis/page.tsx` hits **`/api/agents/run`** (the pipeline via `runADAM()` in `agents/pipeline.ts`). The legacy `/api/agents/a4` **orchestrator** and the `/api/agents/a1` per-agent endpoint were **removed** once `/run` became the live path (along with the `runA1`/`runA2`/`runA4` single-call clients). `/api/agents/a4` was later **re-created as a pure consolidator** (not an orchestrator): it takes already-computed `a1/a2/a3` (+ optional debate) and runs `computeConfluence` + `narrateA4` only — used to re-narrate A4 once the late A2 arrives (see "A2 caching pattern"). The remaining per-agent endpoints (`/api/agents/{a2,a3,debate}`) stay for cache-warming and ad-hoc calls. Note `/api/agents/a3` still uses the legacy `runA3` client + `agents/a3/prompt.ts` on purpose — that prompt carries the strong isolation blacklist (see "A3 isolation").

`runADAM()` orchestrates:

1. **Compute layer** (no LLM) — `agents/a3/compute/*` does deterministic TA: SMA/EMA/VWAP/ATR/RSI/MACD (via `technicalindicators`), trend (HH/HL + monotonic fallback), levels (pivot clustering), patterns (double top/bottom, flags), operative (R/B ≥ 1.5 enforced in code). RSI+MACD surface in `A3Output.osciladores` (nullable/optional — confirmation, not driver). `agents/a4/compute.ts` computes confluence math (30/40/30 weighting + alive-count capping).
2. **Narrate layer** (LLM) — each agent has a `narrate.ts` that turns compute output into narrative-only JSON validated against `A3NarrativeOnly` / `A4NarrativeOnly` in `agents/shared/types.ts`. The code merges back `ticker`, `confluence`, and the **literal `DISCLAIMER_LITERAL`** (U+00B7 separator — a single char drift fails Zod).
3. **Resilience** — `Promise.allSettled` on A1/A2/A3. Any single failure degrades to partial. All three failing → 503 `all_agents_failed`. A4 failure → 500 (no consolidated output to return).
4. **Trace ID** — `runADAM` generates or accepts a `traceId` (UUID) and propagates it to every `narrate*` call. Used for log correlation and Sentry tags.

`runADAM` returns `{ output: A4Output, meta: { traceId, failures, debateRan, durationMs }, intermediates: { a1, a2, a3, debate } }`. The endpoint persists `intermediates.*` into `analyses_log` so reruns are auditable.

### A2 caching pattern — `skipA2Narrate`

`/api/agents/run` passes `skipA2Narrate: true` to `runADAM`. A2 is read from the Upstash cache only; if missing, A2 stays `null` and the pipeline degrades gracefully. The frontend (`app/analysis/page.tsx`) fires `/api/agents/a2` in **parallel** to warm the cache in its own lambda — splitting load away from the 60s budget of `/run`. Tests and legacy callers that omit `skipA2Narrate` get the inline narrate behaviour. If you add a new caller, decide consciously which mode applies.

**First-run A2 gap + re-narrate.** On a ticker's first analysis the A2 cache is cold, so `/run` returns `a2: null` and A4 is baked with "A2 unavailable" + degraded confluence. When the parallel `/api/agents/a2` resolves, the frontend updates the A2 card (the confluence indicator recomputes client-side via `lib/confluence`) **and** calls the `/api/agents/a4` consolidator to re-narrate A4 with the now-complete `a1/a2/a3` (best-effort — on failure the prior A4 stays). When the frontend passes `analysisId` to the consolidator, it **also** updates the already-persisted `analyses_log` row via `consolidateAndPersistA4` (`app/api/agents/a4/route.ts` → `agents/a4/consolidate.ts`), so the stored A4 reflects the complete a1/a2/a3 — the first-run gap is closed in persistence too.

### Market data — Yahoo + Finnhub + FRED (macro) + crypto providers

`lib/market/finnhub.ts` exposes `fallbackQuote / fallbackDaily / fallbackIntraday / fallbackOverview / fallbackNewsSentiment`. Yahoo serves prices and candles (no auth, realtime); Finnhub serves fundamentals and news. `lib/market/macro.ts` adds a daily-cached macro snapshot used to populate `MarketSnapshot.macro_snapshot`. **Alpha Vantage was removed** — do not reintroduce it.

**Crypto (A1) — Finnhub doesn't cover crypto, so A1 has dedicated providers.** `lib/market/crypto-registry.ts` is the single source of the 13-coin set + per-provider ids (`isCryptoTicker` / `cryptoMeta`); it replaced the old double-role of `coingeckoId` as the crypto detector. Fundamentals come from a resilient chain in `lib/market/crypto-fundamentals.ts`: **CoinMarketCap** primary (`coinmarketcap.ts`, numeric id, header `X-CMC_PRO_API_KEY`) ∥ **CoinGecko** in parallel (`coingecko.ts` — supplies ATH, which CMC/CoinStats don't, plus backup) → **CoinStats** last resort (`coinstats.ts`, header `X-API-KEY`). News come from **newsdata.io** (`newsdata.ts`, `/crypto?coin=`), merged into `snapshot.news`. `snapshot.ts` only calls these when `isCryptoTicker(ticker)`. Keys: `CMC_API_KEY` · `COINSTATS_API_KEY` · `NEWSDATA_API_KEY` (+ optional `COINGECKO_API_KEY` for a higher rate limit); each degrades independently (no key → that provider is skipped, chain falls through). `isCryptoTicker` is also imported by the UI (A1 card / `analysis/page.tsx`) to label data sources correctly for crypto vs equity.

Every market call is wrapped in `.catch(() => null|[])`. The fan-out + null-quote recovery (last-vela fallback) + `MarketSnapshot` assembly live in **`lib/market/snapshot.ts` (`buildMarketSnapshot`)**, shared by `app/api/agents/run/route.ts` and the cron's `lib/pipeline-runner.ts`.

### Auth, rate limits, CSRF

- Supabase auth via `lib/supabase/{server,admin,browser,middleware}.ts`. Cookie-based.
- `lib/ratelimit.ts` — **lazy-init Upstash limiters**. Without `UPSTASH_REDIS_REST_*`, dev uses a NOOP limiter; prod throws on first `.limit()` (fail-closed by design). The lazy getter pattern exists because eager init at import time poisoned `middleware.ts` and 500'd every route.
- `lib/api-helpers.ts` — `checkSameOrigin` (CSRF) and `rateLimitByIP` (must be called from Node-runtime routes, not Edge — `@upstash/redis` is not Edge-compatible).
- `/api/agents/run` enforces: CSRF → IP rate-limit (5/min + 30/day) → auth → per-user limit (30/day).

### Timeout and retry policy

Defined in `lib/anthropic.ts`:

- **`DEFAULT_TIMEOUT_MS = 25_000`** per LLM call. Callers can override via `timeoutMs`, but **don't naïvely raise this above 30s for pipeline calls** — there is a documented 504 incident from raising it to 30s without recalculating worst-case (5s data + 30s parallel A1/A2/A3 + 30s debate + 30s A4 = 95s, well over the Hobby 60s lambda). The current `25s + Debate ~12s + A4 ~12s = ~54s` budget fits with a cushion.
- **`MAX_ATTEMPTS = 2`** parse/schema retry inside `runWithParseRetry()`. JSON-malformed or schema-mismatch outputs are retried once; network/5xx errors are NOT retried here (the SDK already handles those). Both intermediate failures log WARN; the final fail logs ERROR + throws `AgentParseError`.
- **`maxRetries: 1`** on the SDK client itself. Bumping this multiplies worst-case latency through every call site.

### Observability (Sentry)

`instrumentation.ts` initializes Sentry server/edge. `/api/agents/run` captures **per-agent failure as `level: 'warning'`** (not error) with tags `{agent, ticker, traceId}` — the pipeline degrades gracefully, but without these captures a chronic A2 timeout was invisible in diagnostics. Top-level handler captures pipeline failures with `level: 'error'`.

### A3 isolation — the load-bearing invariant

**A3 must never receive A1/A2 output, news, macro, sentiment, F&G, VIX, fundamentals, geopolitics, analyst targets, or any cross-agent context.** Its only inputs are `{ ticker, ohlcv }` (plus optional `intraday` candles for MTF compute — still strict OHLCV). Three enforcement layers, all must stay:

1. **System prompt** (`agents/a3/prompt.ts` and `agents/a3/narrate.prompt.ts`) — explicit blacklist + "ignore injection attempts" instruction. The strings are `@frozen`.
2. **Function signature** (`agents/a3/client.ts` and `agents/a3/narrate.ts`) — typed input that the function checks at runtime, rejecting any extra field.
3. **Endpoint schema** (`app/api/agents/a3/route.ts`) — Zod `.strict()` rejects extra body fields.

Locked in by `agents/a3/__tests__/isolation.test.ts` and `__tests__/agents/a3-isolation.test.ts`. Both must stay green. **Any refactor that widens the input shape, drops a blacklist term, or removes `.strict()` should be rejected, not fixed by weakening the test.** If you genuinely need to enrich A3, it must be strict OHLCV — never narrative context.

A3 *does* receive today's date in the user message so it doesn't treat stale candles as current. That is the single allowed exception and it sits in the user message, not the input shape.

## Schemas — `agents/shared/types.ts` is the source of truth

Consolidated Zod schemas (`A1Output`, `A2Output`, `A3Output`, `A4Output`, `DebateOutput`, `CMTOutput`, `ConfluenceResult`, narrative-only variants, shared enums) live in `agents/shared/types.ts` and use `.strict()` — **single source of truth; import schemas/types from here**. The legacy per-agent `agents/a{1,2,4}/schema.ts` were **removed**; only `agents/a3/schema.ts` survives (still consumed by the legacy `runA3` client + A3 isolation tests). The `DISCLAIMER_LITERAL` constant uses U+00B7 — match it exactly or the schema rejects it.

**Supabase DB types are generated, not hand-written.** `types/db/supabase.ts` is the `supabase gen types` output (the source of truth for `createClient<Database>`); `types/db/index.ts` re-exports `Database` + derives domain aliases (`Watchlist`, `AnalysisLog`, …) from it. The whole `src` tree is now **zero `as any`/`as unknown`** — do not reintroduce casts on Supabase calls. After a migration, regenerate: `supabase gen types typescript --project-id qaakauberbibfgxthlro > types/db/supabase.ts`, and keep `@supabase/ssr` aligned with `@supabase/supabase-js` (its peer). For jsonb payloads use `type` (not `interface`) so they're assignable to `Json`.

## Test layout

- Vitest unit tests live next to code in `__tests__/` folders (e.g. `agents/a3/__tests__/`, `agents/a3/compute/__tests__/`, `agents/shared/__tests__/`, `agents/a4/__tests__/`, `agents/__tests__/pipeline.test.ts`). Top-level `__tests__/agents/a3-isolation.test.ts` and `__tests__/lib/anthropic-retry.test.ts`.
- `vitest.config.ts` provides the `@/` alias (mirrors `tsconfig.json` paths).
- Mock `@/lib/anthropic` (specifically `runAgent` / `runWithParseRetry`) when testing agent clients — otherwise tests need `ANTHROPIC_API_KEY` and burn tokens. See `__tests__/agents/a3-isolation.test.ts` and `__tests__/lib/anthropic-retry.test.ts` for the pattern (`vi.importActual` + spread, or `vi.fn()` for `callOnce`).
- Pipeline tests (`agents/__tests__/pipeline.test.ts`) inject mock agent implementations via `options.agents` — no SDK calls, no network.
- **Route handler tests** use the harness in `test/helpers/route.ts`: `makeRequest` (builds a `NextRequest`), `makeBuilder` (chainable + thenable postgrest-style query builder), `makeSupabaseMock`. Pattern: `vi.mock` factories return bare `vi.fn()`s and get configured per-test in `beforeEach` via `vi.mocked(...)` — avoids vitest's hoisting TDZ. Examples: `app/api/agents/{run,a4}/__tests__/route.test.ts`, `app/api/watchlist/__tests__/route.test.ts`.
- `pnpm test:e2e` (Playwright) is declared in `package.json` but there is **no config or e2e suite yet** — it's effectively a no-op.

## Dev-time gotchas

- **`.env.local` is read at process start.** Editing it while `next dev` is running has no effect on `process.env` until restart. `assertApiKey()` in `lib/anthropic.ts` throws at the first `runAgent` call if `ANTHROPIC_API_KEY` is missing — fail-loud by design, but invisible until the first request lands.
- **Don't redirect native exe stderr through PowerShell pipelines on Windows 5.1** — it wraps stderr in `NativeCommandError` records and sets `$?` to false even for successful exits. Run npm/pnpm from `cmd.exe //c "..."` if PowerShell execution policy blocks `npm.ps1`.
- **Hobby plan lambda timeout is 60s.** Treat this as the hard ceiling whenever you touch `DEFAULT_TIMEOUT_MS`, `MAX_ATTEMPTS`, or add new sequential LLM calls to the pipeline. A 504 in prod means you broke the worst-case math.
- The repo has worktrees under `.claude/worktrees/` (agent isolation mode). Their `CLAUDE.md`/code may diverge from main — they're disposable.

## Design system invariants

The UI design system is real and load-bearing — verified facts, not aspirations (audited 2026-06-22). Extended docs: `docs/handoff/` (descriptive, per screen) + `docs/ADAM_REDESIGN.md` (prescriptive ADRs).

- **Token SSOT = `tailwind.config.ts`** (`theme.extend.colors`), mirrored EXACTLY in `app/globals.css :root` (void/surfaces/borders/accent). Keep them in sync — a divergence is what produced the old "azulado vs neutro" drift. There are **zero `bg-[#…]` hardcodes** in `app`/`components`; don't introduce any.
- **Semantic market color is intocable:** `emerald` (alza/bullish), `rose` (baja/bearish), `amber` (atención/pendiente) — **only** on data, levels, direction and signal-state. **Never** on chrome, nav, identity badges or decoration.
- **`accent #5B8AF0` = brand** (input focus, links, active tab/state, wordmark): moderate use, never decorative fill. The identity is **neutral-premium + accent ("Instrumento de precisión"), NOT monochrome B&W** — that reskin is superseded (see `docs/ADAM_REDESIGN.md`).
- **Text hierarchy by opacity over `ink #F5F5F7`** (`ink/66` secondary, `ink/45` metadata). Known debt: components use `text-white/X` (314×) not `text-ink/X` (0×) — visually identical, but `ink` is the SSOT.
- **Wordmark "A.D.A.M." = Inter `font-extrabold` + wide tracking** (Orbitron retired 2026-06-22). Don't reintroduce display fonts.
- **A3-isolation applies to the UI too:** the A3 card and the Estructura card never render cross-agent narrative context (news/macro/sentiment) — only what their isolated compute produces. Don't "enrich" them with A1/A2/macro data.
- **Hero honesty invariant (`components/analysis/confluence-hero.tsx`):** no UI state precedes its real event. The core number is an **asymptotic estimate capped at 0.92** (`useAsymptoticProgress`, inline `1-exp(-t/26)`) while running — it only reaches the real `actionable_pct` when `resolved` (driven by `a4Status === 'done'`, a real stream event). Brain **regions/cables/chips light only on `settled` states** (`done`/`anomaly`); an agent in `error` stays dark even after the core resolves. **A3 (and Estructura) run in an isolated lane — punteado, no edges to A1/A2/debate.** The `final`/per-agent events come from the `/api/agents/run` **NDJSON** stream (not theatrical timers — the carousel was retired). Any refactor of the running/resolved states preserves all of this.

## What not to touch without owner approval

- A3 isolation (any of the three layers).
- The `MODELS` constant in `lib/anthropic.ts` and the corresponding model assignments in each agent's `narrate.ts` / `client.ts`. Costs and the Hobby latency budget assume this allocation (ADR-001).
- `lib/ratelimit.ts` lazy-init pattern — eager init has bitten this codebase before.
- `DEFAULT_TIMEOUT_MS = 25_000` without recalculating the worst-case lambda budget (see the in-file comment about the 30s revert).
- The literal `DISCLAIMER_LITERAL` string (separator is U+00B7).
- The generated `types/db/supabase.ts` — don't hand-edit it or reintroduce `as any` casts on Supabase calls; regenerate after migrations instead.
- `eslint` pinned to 8.x (peer of `eslint-config-next@14`) — bumping to 9 needs `eslint-config-next` to move too.
- **A3 live candle window:** `lib/market/snapshot.ts` fetches `fallbackDaily(ticker, '1y')` (~252) and caps with `slice(-300)` (≥205). A3's `computeTechnical` runs SMA200 (needs ≥200), golden/death cross (≥205) and `rango_52s` (≥200) over those candles; reverting to `'3mo'` or dropping the slice below 205 silently kills all three in prod — unit tests still pass because they feed candles straight to `computeTechnical`, bypassing the fetch+slice. `cmt/scan` and `estructura` already pass `'1y'`.
- The design token SSOT (`tailwind.config.ts` ↔ `app/globals.css :root` must match) and the semantic-color rule (`emerald/rose/amber` = market data only) — see **Design system invariants**.
