-- 0014_fix_users_overview_ambiguity.sql
--
-- Hotfix de 0013. get_users_overview() lanzaba en runtime:
--   42702: column reference "user_id" is ambiguous
-- La columna OUT `user_id` de la RETURNS TABLE es una variable plpgsql, y
-- colisionaba con las referencias `user_id` de las subconsultas (group by /
-- select). Se cualifican esas referencias con alias de tabla (al./sh.) para
-- eliminar la ambigüedad. Firma idéntica → no cambian los tipos generados.

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
    select al.user_id,
           count(*)                  as analyses_count,
           count(distinct al.ticker) as distinct_tickers,
           max(al.created_at)        as last_analysis_at
    from public.analyses_log al
    group by al.user_id
  ) a on a.user_id = u.id
  left join (
    select sh.user_id, count(*) as signals_count
    from public.signals_history sh
    group by sh.user_id
  ) s on s.user_id = u.id
  order by a.last_analysis_at desc nulls last, u.created_at desc;
end;
$$;
