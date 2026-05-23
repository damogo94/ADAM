-- A.D.A.M. — Watchlist Radar (feature/watchlist-radar)
--
-- RPC `get_watchlist_radar()` devuelve el estado consolidado del radar
-- para los items de la watchlist DEFAULT del usuario autenticado, en un
-- solo round-trip:
--
--   - item              (fila de watchlist_items)
--   - latest_analysis   (último analyses_log para ese user+ticker)
--   - previous_analysis (penúltimo — base del DELTA)
--   - latest_unacked_signal (última signals_history sin acknowledge)
--
-- DECISIONES (FASE 0, aprobadas):
--   - Sin tabla nueva: el snapshot ya vive en analyses_log.
--   - DELTA = latest vs immediately previous (no "sesión previa").
--   - SECURITY INVOKER + auth.uid() internamente → RLS aplica a las tablas
--     referenciadas; un user solo ve sus propios datos. Defense in depth:
--     el endpoint además valida el cookie session antes de invocar.
--
-- Aprovecha índices existentes:
--   - analyses_log_user_created_idx   (user_id, created_at desc)
--   - analyses_log_ticker_idx         (ticker, created_at desc)
--   - signals_history_user_emitted_idx (user_id, emitted_at desc)
--
-- Retorna jsonb para campos anidados para mantener type-safety estable
-- aunque crezcan los schemas de los outputs (a1/a2/a3/a4_output ya son jsonb).

create or replace function public.get_watchlist_radar()
returns table (
  item_id              uuid,
  watchlist_id         uuid,
  ticker               text,
  asset_type           asset_type,
  "position"           integer,
  notes                text,
  added_at             timestamptz,
  latest_analysis      jsonb,
  previous_analysis    jsonb,
  latest_unacked_signal jsonb
)
language sql
security invoker
stable
as $$
  with current_uid as (select auth.uid() as uid)
  select
    wi.id            as item_id,
    wi.watchlist_id  as watchlist_id,
    wi.ticker        as ticker,
    wi.asset_type    as asset_type,
    wi."position"    as "position",
    wi.notes         as notes,
    wi.added_at      as added_at,
    (
      select to_jsonb(al.*)
      from public.analyses_log al
      where al.user_id = (select uid from current_uid)
        and al.ticker = wi.ticker
      order by al.created_at desc
      limit 1
    ) as latest_analysis,
    (
      select to_jsonb(al.*)
      from public.analyses_log al
      where al.user_id = (select uid from current_uid)
        and al.ticker = wi.ticker
      order by al.created_at desc
      offset 1
      limit 1
    ) as previous_analysis,
    (
      select to_jsonb(sh.*)
      from public.signals_history sh
      where sh.user_id = (select uid from current_uid)
        and sh.ticker = wi.ticker
        and sh.acknowledged_at is null
      order by sh.emitted_at desc
      limit 1
    ) as latest_unacked_signal
  from public.watchlist_items wi
  join public.watchlists w on w.id = wi.watchlist_id
  where w.user_id = (select uid from current_uid)
    and w.is_default = true
  order by wi."position" asc, wi.added_at asc;
$$;

-- Solo los usuarios autenticados pueden invocar. Anon no.
revoke all on function public.get_watchlist_radar() from public;
grant execute on function public.get_watchlist_radar() to authenticated;
