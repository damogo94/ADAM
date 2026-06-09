-- 0015_signal_trade_outcomes.sql
--
-- Resultado PATH-DEPENDENT de las señales CMT (espejo de 0011_trade_outcomes,
-- que mide la operativa de A3 colgando de analyses_log). Las señales CMT viven
-- en signals_history y hoy NO se evalúan: trade_outcomes/signal_outcomes cuelgan
-- de analyses_log, no de signals_history. Esta tabla cierra ese hueco.
--
-- El cron evaluate-signal-trades sigue cada señal 1D con niveles completos desde
-- emitted_at hasta que toca target o stop dentro de la ventana (30d) →
-- win/loss/timeout. La dirección se infiere de la geometría entry/stop/target
-- (el schema CMT no la expone); geometría degenerada → not_evaluable. Las señales
-- 1H (intradía) las salta el cron: con velas diarias no se resuelve el orden
-- TP/SL intradía. entry_type es siempre 'market' (CMT no distingue tipo de entrada).
--
-- Una fila por señal (PK signal_id). Solo el cron (service_role) escribe; sin
-- policies, el cliente no accede directamente (la página lee vía /api/signals,
-- que mergea el outcome acotado a los signal_ids del propio usuario).

create table public.signal_trade_outcomes (
  signal_id     uuid primary key references public.signals_history(id) on delete cascade,
  direction     text,                     -- buy | sell (inferida de la geometría) | null si not_evaluable
  entry_type    text,                     -- siempre 'market' en esta fase
  timeframe     text,                     -- 1D (las 1H se saltan)
  outcome       text not null,            -- win | loss | timeout | no_fill | not_evaluable
  entry         double precision,
  stop_loss     double precision,
  target        double precision,
  exit_price    double precision,
  return_pct    double precision,
  r_multiple    double precision,         -- resultado en múltiplos de riesgo (win≈+R/B, loss=-1)
  resolved_days integer,                  -- días desde emitted_at hasta la resolución
  evaluated_at  timestamptz not null default now()
);

alter table public.signal_trade_outcomes enable row level security;
-- Sin policies. service_role (cron) bypassa RLS. Cliente no accede directamente.

comment on table public.signal_trade_outcomes is
  'Resultado path-dependent de las señales CMT (win/loss/timeout/no_fill/not_evaluable). Una fila por señal. Espejo de trade_outcomes para signals_history.';
