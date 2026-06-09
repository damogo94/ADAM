-- 0013_system_users_overview.sql
--
-- Consola master-detail de usuarios para /system (L0 listado · L1 actividad).
--
-- Vista GLOBAL: cruza auth.users + profiles + analyses_log + signals_history,
-- todas con RLS own-row → hay que bypasear RLS. Patrón: SECURITY DEFINER.
-- El owner de la migración es `postgres`, que tiene SELECT sobre auth.users
-- (verificado), así que el JOIN a auth.users funciona en runtime sin grant extra.
--
-- BLINDAJE EN DB (no solo en la ruta): cada función comprueba
-- public.is_system_authorized() en su PRIMERA línea y lanza 'forbidden' (42501)
-- si el llamante no está en la allowlist. Esto protege incluso una llamada
-- directa supabase.rpc(...) desde una sesión sin allowlist.
--
-- Se llaman con el CLIENT DE SESIÓN (para que auth.jwt() lleve el email del
-- usuario al check), nunca con service-role (no lleva JWT → check false).

-- ── L0 · Listado de usuarios ────────────────────────────────────────────────
create or replace function public.get_users_overview()
returns table (
  user_id          uuid,
  email            text,
  display_name     text,
  registered_at    timestamptz,
  analyses_count   bigint,
  distinct_tickers bigint,
  last_analysis_at timestamptz,
  signals_count    bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_system_authorized() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.display_name,
    u.created_at,
    coalesce(a.analyses_count, 0),
    coalesce(a.distinct_tickers, 0),
    a.last_analysis_at,
    coalesce(s.signals_count, 0)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join (
    select user_id,
           count(*)                as analyses_count,
           count(distinct ticker)  as distinct_tickers,
           max(created_at)         as last_analysis_at
    from public.analyses_log
    group by user_id
  ) a on a.user_id = u.id
  left join (
    select user_id, count(*) as signals_count
    from public.signals_history
    group by user_id
  ) s on s.user_id = u.id
  order by a.last_analysis_at desc nulls last, u.created_at desc;
end;
$$;

revoke all on function public.get_users_overview() from public;
grant execute on function public.get_users_overview() to authenticated;

-- ── L1 · Actividad de un usuario ────────────────────────────────────────────
-- Devuelve jsonb { totals, by_ticker[], recent[] }.
create or replace function public.get_user_activity(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  if not public.is_system_authorized() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'analyses_count',    count(*),
        'distinct_tickers',  count(distinct ticker),
        'last_analysis_at',  max(created_at),
        'avg_confluence_pct', round(avg(confluence_pct)),
        'signals_count', (select count(*) from public.signals_history where user_id = target_user)
      )
      from public.analyses_log
      where user_id = target_user
    ),
    'by_ticker', coalesce((
      select jsonb_agg(t order by t.last_analysis_at desc)
      from (
        select
          ticker,
          count(*)                                       as analyses_count,
          max(created_at)                                as last_analysis_at,
          round(avg(confluence_pct))                     as avg_confluence_pct,
          (array_agg(direction order by created_at desc))[1]  as last_direction,
          (array_agg(confidence order by created_at desc))[1] as last_confidence
        from public.analyses_log
        where user_id = target_user
        group by ticker
      ) t
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(r)
      from (
        select id, ticker, created_at, confluence_pct, direction, confidence, latency_ms, tokens_used
        from public.analyses_log
        where user_id = target_user
        order by created_at desc
        limit 20
      ) r
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_user_activity(uuid) from public;
grant execute on function public.get_user_activity(uuid) to authenticated;

comment on function public.get_users_overview() is
  'L0 consola /system: listado global de usuarios + agregados. SECURITY DEFINER con check is_system_authorized() en la 1a linea.';
comment on function public.get_user_activity(uuid) is
  'L1 consola /system: actividad de un usuario (totals/by_ticker/recent). SECURITY DEFINER con check is_system_authorized() en la 1a linea.';
