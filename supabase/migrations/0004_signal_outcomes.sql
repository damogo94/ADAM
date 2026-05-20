-- 0004_signal_outcomes.sql
--
-- Modo B de backtesting: tracking forward de cada señal emitida por ADAM.
-- Cada analisis se evalua automaticamente a 7d y 30d cuando madura.
--
-- 1) analyses_log gana initial_price (precio al ejecutar el run) y
--    initial_price_at (timestamptz). Sin estos no podemos calcular retorno.
--    Nullable para no romper inserts en flight durante el deploy.
--
-- 2) signal_outcomes: una fila por (analysis_id, horizon_days). El cron
--    /api/cron/evaluate-signals la rellena cuando el horizonte madura.

alter table public.analyses_log
  add column if not exists initial_price    numeric,
  add column if not exists initial_price_at timestamptz;

create table public.signal_outcomes (
  analysis_id    uuid not null references public.analyses_log(id) on delete cascade,
  horizon_days   smallint not null check (horizon_days in (7, 30)),
  eval_price     numeric not null,
  return_pct     numeric not null,
  hit            boolean not null,
  evaluated_at   timestamptz not null default now(),
  primary key (analysis_id, horizon_days)
);

create index signal_outcomes_evaluated_idx
  on public.signal_outcomes(evaluated_at desc);

alter table public.signal_outcomes enable row level security;
-- Sin policies. service_role (cron + admin client) bypassa RLS.
