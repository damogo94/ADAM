-- A.D.A.M. — signals_history: UPDATE restringido a acknowledged_at
--
-- La policy RLS `signals_update_own` (0001) deja al usuario hacer UPDATE de
-- su propia fila, pero RLS no puede comparar OLD vs NEW. Por tanto un usuario
-- autenticado podía reescribir `level`, `confidence_pct`, precios, etc. de sus
-- señales vía PostgREST. El radar/digest confían en esos campos verbatim, así
-- que era posible auto-forjar una señal "urgente" (solo visible al propio
-- usuario, blast radius bajo, pero la intención de la policy era ack-only).
--
-- Este trigger BEFORE UPDATE rechaza cualquier cambio que no sea marcar
-- acknowledged_at. Aplica a TODOS los roles; el scanner CMT solo hace INSERT
-- (app/api/cmt/scan) y evaluate-signals escribe en signal_outcomes, así que
-- ningún path legítimo hace otro UPDATE sobre signals_history.

create or replace function public.signals_history_ack_only()
returns trigger
language plpgsql
as $$
begin
  if (
    new.id is distinct from old.id or
    new.user_id is distinct from old.user_id or
    new.ticker is distinct from old.ticker or
    new.level is distinct from old.level or
    new.timeframe is distinct from old.timeframe or
    new.setup_detected is distinct from old.setup_detected or
    new.confidence_pct is distinct from old.confidence_pct or
    new.entry_price is distinct from old.entry_price or
    new.stop_loss is distinct from old.stop_loss or
    new.target_price is distinct from old.target_price or
    new.risk_reward_ratio is distinct from old.risk_reward_ratio or
    new.invalidation_factor is distinct from old.invalidation_factor or
    new.indicators is distinct from old.indicators or
    new.emitted_at is distinct from old.emitted_at
  ) then
    raise exception
      'signals_history: solo acknowledged_at es editable (intento de modificar otra columna)';
  end if;
  return new;
end;
$$;

drop trigger if exists signals_history_ack_only_guard on public.signals_history;
create trigger signals_history_ack_only_guard
  before update on public.signals_history
  for each row execute function public.signals_history_ack_only();
