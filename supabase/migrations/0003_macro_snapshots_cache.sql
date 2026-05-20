-- 0003_macro_snapshots_cache.sql
--
-- Cache diario del snapshot macro (fuente: FRED). Macro no cambia intraday
-- (Fed funds, yields, CPI, etc.) — cachear por fecha evita hacer N llamadas
-- a FRED por run.
--
-- Solo el server (service_role) lee y escribe. Sin RLS no es problema porque
-- service_role bypassa RLS de todas formas, pero la habilitamos por higiene
-- y no añadimos policies → cliente normal no ve nada.

create table public.macro_snapshots_cache (
  as_of       date primary key,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

alter table public.macro_snapshots_cache enable row level security;
-- Sin policies. service_role (server) bypassa RLS. Cliente no accede.
