-- 0011_trade_outcomes.sql
--
-- Resultado PATH-DEPENDENT de la operativa de A3 (ADR-002 fase 3). Distinto de
-- signal_outcomes (que mide la DIRECCIÓN consolidada de A4 a 7d/30d): aquí
-- medimos el trade real (entrada/stop/target) — qué se toca primero dentro de
-- la ventana del horizonte → win/loss/timeout/no_fill.
--
-- Una fila por análisis (la operativa tiene un único horizonte) → PK analysis_id.
-- Solo el cron (service_role) escribe; sin policies, cliente no accede.

create table public.trade_outcomes (
  analysis_id   uuid primary key references public.analyses_log(id) on delete cascade,
  direction     text not null,            -- buy | sell
  entry_type    text not null,            -- market | limit
  horizonte     text not null,            -- swing | posicional (intradia → fase 4)
  outcome       text not null,            -- win | loss | timeout | no_fill | not_evaluable
  entry         double precision,
  stop_loss     double precision,
  target        double precision,
  rb_ratio      double precision,         -- R/B prometido por el plan (baseline = 1/(1+rb))
  exit_price    double precision,
  return_pct    double precision,
  r_multiple    double precision,         -- resultado en múltiplos de riesgo (win≈+rb, loss=-1)
  resolved_days integer,                  -- días desde el análisis hasta la resolución
  evaluated_at  timestamptz not null default now()
);

alter table public.trade_outcomes enable row level security;
-- Sin policies. service_role (cron) bypassa RLS. Cliente no accede.

comment on table public.trade_outcomes is
  'Resultado path-dependent de la operativa de A3 (win/loss/timeout/no_fill). Una fila por análisis. ADR-002 fase 3.';
