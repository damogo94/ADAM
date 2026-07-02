-- 0018_trade_outcomes_source.sql
--
-- Backtest del trade de A-Estructura además del de A3 (ADR-003, decisión D).
--
-- Hasta ahora trade_outcomes tenía una fila por análisis (PK analysis_id) porque
-- solo se medía la operativa de A3. Estructura es un 4º agente opt-in que emite
-- su propio plan de trade (gestion + setup, multi-timeframe) y hasta ahora se
-- mostraba en el historial rotulado "no evaluado automáticamente". Para medirlo
-- con el mismo cron path-dependent (evaluate-trades) necesitamos una SEGUNDA fila
-- por análisis, distinguida por la fuente del trade.
--
-- Cambios:
--   1. Nueva columna `source` (a3 | estructura), NOT NULL default 'a3'. El default
--      backfilea las filas existentes (todas son de A3) sin migración de datos.
--   2. PK compuesta (analysis_id, source): permite (analysis_id,'a3') y
--      (analysis_id,'estructura') a la vez, manteniendo la unicidad por fuente.
--
-- La FK analysis_id → analyses_log(id) on delete cascade se conserva (ambas filas
-- de un análisis caen juntas). RLS sigue sin policies: solo el cron (service_role)
-- escribe; el cliente no accede.

alter table public.trade_outcomes
  add column source text not null default 'a3'
    constraint trade_outcomes_source_check check (source in ('a3', 'estructura'));

-- Repivotar la PK: de analysis_id a (analysis_id, source). Las filas existentes
-- ((analysis_id) únicos, ahora source='a3') satisfacen la nueva PK compuesta.
alter table public.trade_outcomes
  drop constraint trade_outcomes_pkey,
  add constraint trade_outcomes_pkey primary key (analysis_id, source);

comment on table public.trade_outcomes is
  'Resultado path-dependent del trade (win/loss/timeout/no_fill). Una fila por (análisis, fuente): source a3 = operativa de A3 (ADR-002 f3); source estructura = plan de A-Estructura (ADR-003).';

comment on column public.trade_outcomes.source is
  'Origen del trade evaluado: a3 (operativa de A3) | estructura (plan de A-Estructura). Parte de la PK compuesta (analysis_id, source).';
