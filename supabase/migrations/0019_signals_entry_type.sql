-- 0019_signals_entry_type.sql
--
-- Propaga `entry_type` (market | limit) a las señales CMT.
--
-- BUG (2026-07): el compute (agents/a3/compute/operative.ts) distingue entrada a
-- mercado vs en límite (short en la resistencia / long en el soporte, esperando
-- el rebote). Ese `entry_type` llegaba a `buildCMTSignal` pero se PERDÍA al
-- persistir: ni CMTOutput ni signals_history tenían la columna. El backtest
-- (evaluate-signal-trades → buildSignalTradePlan) asumía SIEMPRE 'market', así
-- que rellenaba la orden límite al precio del nivel el día de emisión y corría
-- la carrera stop/target — fabricando "wins" en órdenes que nunca se habrían
-- ejecutado (p.ej. cortos límite de BTC a 69280 con el precio en ~63k). 9 de 11
-- "ganadas" eran fills fantasma.
--
-- Fix de datos: columna nullable con CHECK. Backfill del histórico parseando
-- `setup_detected` ("… en límite …" / "… a mercado …"), que ya codifica el tipo.
-- Las filas ya evaluadas de forma fantasma en signal_trade_outcomes se borran
-- aparte (fuera de esta migración) para que el cron las reevalúe con el tipo real.

alter table public.signals_history
  add column entry_type text
    constraint signals_history_entry_type_check check (entry_type in ('market', 'limit'));

comment on column public.signals_history.entry_type is
  'Tipo de entrada de la señal: market (a mercado, precio pegado al nivel) | limit (orden en el nivel, esperar el toque). Necesario para el backtest path-dependent (buildSignalTradePlan): una orden límite no rellenada NO es un trade. Puede ser null en filas viejas sin dato recuperable.';

-- Backfill: el texto del setup ya lleva el tipo ("Venta en límite …" / "… a mercado …").
update public.signals_history
set entry_type = case
  when setup_detected ilike '%en límite%' or setup_detected ilike '%en limite%' then 'limit'
  when setup_detected ilike '%a mercado%' then 'market'
  else null
end
where entry_type is null;
