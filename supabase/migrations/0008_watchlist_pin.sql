-- A.D.A.M. — Watchlist Panel: activos fijados (feature/watchlist-panel)
--
-- Añade el flag `is_pinned` a watchlist_items para que el usuario pueda
-- "pin" los activos que quiere ver siempre arriba del radar, sin afectar
-- la ordenación por prioridad (anomalía/urgencia) de los no-fijados.
--
-- Ordenación final aplicada en `get_watchlist_radar()`:
--   1. is_pinned DESC (los fijados primero)
--   2. pinned_at DESC NULLS LAST (entre fijados, el más reciente arriba)
--   3. position ASC (entre no-fijados, orden manual)
--
-- pinned_at se rellena al hacer pin y se anula al unpin. Permite que el
-- usuario reordene los fijados re-pinando (los más recientes suben).

alter table public.watchlist_items
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz;

-- Índice parcial: solo los pinned están en el índice → pequeño y rápido
-- para los queries que ordenan por is_pinned + pinned_at.
create index if not exists watchlist_items_pinned_idx
  on public.watchlist_items (watchlist_id, pinned_at desc nulls last)
  where is_pinned = true;

-- ─────────────────────────────────────────────────────────────────────
-- RPC actualizada: incluye is_pinned + pinned_at + nueva ordenación.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.get_watchlist_radar()
returns table (
  item_id              uuid,
  watchlist_id         uuid,
  ticker               text,
  asset_type           asset_type,
  "position"           integer,
  notes                text,
  added_at             timestamptz,
  is_pinned            boolean,
  pinned_at            timestamptz,
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
    wi.is_pinned     as is_pinned,
    wi.pinned_at     as pinned_at,
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
  order by wi.is_pinned desc,
           wi.pinned_at desc nulls last,
           wi."position" asc,
           wi.added_at asc;
$$;

revoke all on function public.get_watchlist_radar() from public;
grant execute on function public.get_watchlist_radar() to authenticated;
