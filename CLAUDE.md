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

Engines: Node ≥20 <23. Canonical package manager is **pnpm@9.12.0** (`packageManager` field). On Windows boxes without pnpm, `npm install --legacy-peer-deps` works as a fallback — `eslint@9` vs `eslint-config-next@14`'s peer range otherwise blocks resolution.

## Architecture (big picture)

A.D.A.M. is a multi-agent analysis copilot. **It is not a broker** — it never executes trades. The output is educational JSON consumed by the Next.js UI under `/analysis`.

### The four agents + debate

Model assignment (ADR-001, referenced inline in `agents/a3/narrate.ts` and `agents/debate/prompt.ts`):

| Agent | Role | Model | Notes |
| --- | --- | --- | --- |
| A1 | Asset micro-snapshot | Sonnet | News + fundamentals + quote |
| A2 | Macro context | Sonnet | FRED-style series cached in `lib/a2-cache.ts` (Upstash, TTL ~24h) |
| A3 | **Price action — isolated** | Haiku (narrate) + code (compute) | OHLCV only. See "A3 isolation" below. |
| Debate | Synthesis A1×A2 | Sonnet | Fires only if A1 or A2 flag a signal — downgraded from Opus to fit Hobby 60s lambda |
| A4 | System consolidator | Haiku (narrate) + code (confluence) | Final user-facing JSON; cites A3 verbatim |
| CMT scanner | Watchlist scan | Haiku | Cron-driven via `/api/cron/watchlist-scan` |

**If you change model assignment, update `MODELS` in `lib/anthropic.ts` AND the corresponding `narrate.ts` / `client.ts`. The costs and latency budget assume this allocation.**

### Pipeline shape — `runADAM()` is the primary path

`app/analysis/page.tsx` hits **`/api/agents/run`** (the refactored pipeline). The legacy `/api/agents/a4` route still exists and works, but new wiring goes through `runADAM()` in `agents/pipeline.ts`. Per-agent endpoints (`/api/agents/{a1,a2,a3,debate}`) remain for cache-warming and ad-hoc calls.

`runADAM()` orchestrates:

1. **Compute layer** (no LLM) — `agents/a3/compute/*` does deterministic TA: SMA/EMA/VWAP/ATR (via `technicalindicators`), trend (HH/HL + monotonic fallback), levels (pivot clustering), patterns (double top/bottom, flags), operative (R/B ≥ 1.5 enforced in code). `agents/a4/compute.ts` computes confluence math (30/40/30 weighting + alive-count capping).
2. **Narrate layer** (LLM) — each agent has a `narrate.ts` that turns compute output into narrative-only JSON validated against `A3NarrativeOnly` / `A4NarrativeOnly` in `agents/shared/types.ts`. The code merges back `ticker`, `confluence`, and the **literal `DISCLAIMER_LITERAL`** (U+00B7 separator — a single char drift fails Zod).
3. **Resilience** — `Promise.allSettled` on A1/A2/A3. Any single failure degrades to partial. All three failing → 503 `all_agents_failed`. A4 failure → 500 (no consolidated output to return).
4. **Trace ID** — `runADAM` generates or accepts a `traceId` (UUID) and propagates it to every `narrate*` call. Used for log correlation and Sentry tags.

`runADAM` returns `{ output: A4Output, meta: { traceId, failures, debateRan, durationMs }, intermediates: { a1, a2, a3, debate } }`. The endpoint persists `intermediates.*` into `analyses_log` so reruns are auditable.

### A2 caching pattern — `skipA2Narrate`

`/api/agents/run` passes `skipA2Narrate: true` to `runADAM`. A2 is read from the Upstash cache only; if missing, A2 stays `null` and the pipeline degrades gracefully. The frontend (`app/analysis/page.tsx`) fires `/api/agents/a2` in **parallel** to warm the cache in its own lambda — splitting load away from the 60s budget of `/run`. Tests and legacy callers that omit `skipA2Narrate` get the inline narrate behaviour. If you add a new caller, decide consciously which mode applies.

### Market data — Yahoo + Finnhub + FRED (macro)

`lib/market/finnhub.ts` exposes `fallbackQuote / fallbackDaily / fallbackIntraday / fallbackOverview / fallbackNewsSentiment`. Yahoo serves prices and candles (no auth, realtime); Finnhub serves fundamentals and news. `lib/market/macro.ts` adds a daily-cached macro snapshot used to populate `MarketSnapshot.macro_snapshot`. **Alpha Vantage was removed** — do not reintroduce it (the code comment in `a4/route.ts` is `// sesión 6d, AV eliminado`).

Every market call is wrapped in `.catch(() => null|[])`. Downstream code must handle null quote (last-vela fallback in `app/api/agents/run/route.ts` and the legacy `/a4` route).

### Auth, rate limits, CSRF

- Supabase auth via `lib/supabase/{server,admin,browser,middleware}.ts`. Cookie-based.
- `lib/ratelimit.ts` — **lazy-init Upstash limiters**. Without `UPSTASH_REDIS_REST_*`, dev uses a NOOP limiter; prod throws on first `.limit()` (fail-closed by design). The lazy getter pattern exists because eager init at import time poisoned `middleware.ts` and 500'd every route.
- `lib/api-helpers.ts` — `checkSameOrigin` (CSRF) and `rateLimitByIP` (must be called from Node-runtime routes, not Edge — `@upstash/redis` is not Edge-compatible).
- `/api/agents/run` and `/api/agents/a4` both enforce: CSRF → IP rate-limit (5/min + 30/day) → auth → per-user limit (30/day).

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

Consolidated Zod schemas (`A1Output`, `A2Output`, `A3Output`, `A4Output`, `DebateOutput`, `CMTOutput`, `ConfluenceResult`, narrative-only variants, shared enums) live in `agents/shared/types.ts` and use `.strict()`. The legacy per-agent schema files (`agents/a*/schema.ts`) coexist for backward compat; new code should import from `shared/types.ts`. The `DISCLAIMER_LITERAL` constant uses U+00B7 — match it exactly or the schema rejects it.

## Test layout

- Vitest unit tests live next to code in `__tests__/` folders (e.g. `agents/a3/__tests__/`, `agents/a3/compute/__tests__/`, `agents/shared/__tests__/`, `agents/a4/__tests__/`, `agents/__tests__/pipeline.test.ts`). Top-level `__tests__/agents/a3-isolation.test.ts` and `__tests__/lib/anthropic-retry.test.ts`.
- `vitest.config.ts` provides the `@/` alias (mirrors `tsconfig.json` paths).
- Mock `@/lib/anthropic` (specifically `runAgent` / `runWithParseRetry`) when testing agent clients — otherwise tests need `ANTHROPIC_API_KEY` and burn tokens. See `__tests__/agents/a3-isolation.test.ts` and `__tests__/lib/anthropic-retry.test.ts` for the pattern (`vi.importActual` + spread, or `vi.fn()` for `callOnce`).
- Pipeline tests (`agents/__tests__/pipeline.test.ts`) inject mock agent implementations via `options.agents` — no SDK calls, no network.
- Playwright config under `tests-e2e/` (excluded from vitest).

## Dev-time gotchas

- **`.env.local` is read at process start.** Editing it while `next dev` is running has no effect on `process.env` until restart. `assertApiKey()` in `lib/anthropic.ts` throws at the first `runAgent` call if `ANTHROPIC_API_KEY` is missing — fail-loud by design, but invisible until the first request lands.
- **Don't redirect native exe stderr through PowerShell pipelines on Windows 5.1** — it wraps stderr in `NativeCommandError` records and sets `$?` to false even for successful exits. Run npm/pnpm from `cmd.exe //c "..."` if PowerShell execution policy blocks `npm.ps1`.
- **Hobby plan lambda timeout is 60s.** Treat this as the hard ceiling whenever you touch `DEFAULT_TIMEOUT_MS`, `MAX_ATTEMPTS`, or add new sequential LLM calls to the pipeline. A 504 in prod means you broke the worst-case math.
- The repo has worktrees under `.claude/worktrees/` (agent isolation mode). Their `CLAUDE.md`/code may diverge from main — they're disposable.

## What not to touch without owner approval

- A3 isolation (any of the three layers).
- The `MODELS` constant in `lib/anthropic.ts` and the corresponding model assignments in each agent's `narrate.ts` / `client.ts`. Costs and the Hobby latency budget assume this allocation (ADR-001).
- `lib/ratelimit.ts` lazy-init pattern — eager init has bitten this codebase before.
- `DEFAULT_TIMEOUT_MS = 25_000` without recalculating the worst-case lambda budget (see the in-file comment about the 30s revert).
- The literal `DISCLAIMER_LITERAL` string (separator is U+00B7).
