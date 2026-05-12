-- A.D.A.M. — Initial schema (Sprint 2)
-- Run via Supabase CLI: `supabase db push` or paste in Studio SQL Editor.
-- Asume Postgres 15+ y extension pgcrypto (Supabase la trae por defecto).

------------------------------------------------------------------
-- ENUMS
------------------------------------------------------------------
create type asset_type as enum ('equity', 'etf', 'crypto', 'forex', 'commodity', 'bond');
create type signal_level as enum ('urgente', 'atencion', 'monitorear', 'sin_senal');
create type direction_t as enum ('positivo', 'negativo', 'neutral');
create type confidence_t as enum ('alta', 'media', 'baja');

------------------------------------------------------------------
-- profiles — extends auth.users con metadata visible al cliente
-- (auth.users tiene email/created_at; aqui solo lo "publico" para join facil)
------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create profile on signup via auth trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------
-- watchlists — un usuario puede tener varias listas
------------------------------------------------------------------
create table public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Solo una watchlist por usuario puede ser default
  constraint watchlists_unique_default exclude (user_id with =) where (is_default)
);
create index watchlists_user_idx on public.watchlists(user_id);

------------------------------------------------------------------
-- watchlist_items — activos dentro de cada lista
------------------------------------------------------------------
create table public.watchlist_items (
  id           uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  ticker       text not null,
  asset_type   asset_type not null default 'equity',
  position     integer not null default 0,
  notes        text,
  added_at     timestamptz not null default now(),
  unique (watchlist_id, ticker)
);
create index watchlist_items_watchlist_idx on public.watchlist_items(watchlist_id, position);

------------------------------------------------------------------
-- signals_history — alertas CMT emitidas por el scanner
-- El scanner corre como service_role y bypasea RLS para escribir.
-- Cada signal va dirigida a un user_id (el dueno del watchlist origen).
------------------------------------------------------------------
create table public.signals_history (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  ticker              text not null,
  level               signal_level not null,
  timeframe           text not null,
  setup_detected      text not null,
  confidence_pct      smallint not null check (confidence_pct between 0 and 100),
  entry_price         numeric(18,8),
  stop_loss           numeric(18,8),
  target_price        numeric(18,8),
  risk_reward_ratio   numeric(8,2),
  invalidation_factor text not null,
  indicators          jsonb not null default '{}'::jsonb,  -- full CMT output
  emitted_at          timestamptz not null default now(),
  acknowledged_at     timestamptz
);
create index signals_history_user_emitted_idx on public.signals_history(user_id, emitted_at desc);
create index signals_history_level_idx on public.signals_history(level) where acknowledged_at is null;

------------------------------------------------------------------
-- analyses_log — log de cada ejecucion de A4 (para metricas /system)
------------------------------------------------------------------
create table public.analyses_log (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  ticker         text not null,
  confluence_pct smallint not null check (confluence_pct between 0 and 100),
  direction      direction_t not null,
  confidence     confidence_t not null,
  a1_output      jsonb not null,
  a2_output      jsonb not null,
  a3_output      jsonb not null,
  debate_output  jsonb,
  a4_output      jsonb not null,
  latency_ms     integer,
  tokens_used    integer,
  created_at     timestamptz not null default now()
);
create index analyses_log_user_created_idx on public.analyses_log(user_id, created_at desc);
create index analyses_log_ticker_idx on public.analyses_log(ticker, created_at desc);

------------------------------------------------------------------
-- updated_at triggers (touch on UPDATE)
------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger watchlists_touch before update on public.watchlists
  for each row execute function public.touch_updated_at();

------------------------------------------------------------------
-- ROW LEVEL SECURITY — innegociable. Sin RLS, cualquier user ve todo.
------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.watchlists      enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.signals_history enable row level security;
alter table public.analyses_log    enable row level security;

-- profiles: usuario ve y edita su propio profile
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid());

-- watchlists: CRUD del propio user
create policy "watchlists_select_own" on public.watchlists
  for select using (user_id = auth.uid());
create policy "watchlists_insert_own" on public.watchlists
  for insert with check (user_id = auth.uid());
create policy "watchlists_update_own" on public.watchlists
  for update using (user_id = auth.uid());
create policy "watchlists_delete_own" on public.watchlists
  for delete using (user_id = auth.uid());

-- watchlist_items: heredan ownership del watchlist parent
create policy "watchlist_items_select" on public.watchlist_items
  for select using (
    exists (select 1 from public.watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  );
create policy "watchlist_items_insert" on public.watchlist_items
  for insert with check (
    exists (select 1 from public.watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  );
create policy "watchlist_items_update" on public.watchlist_items
  for update using (
    exists (select 1 from public.watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  );
create policy "watchlist_items_delete" on public.watchlist_items
  for delete using (
    exists (select 1 from public.watchlists w
            where w.id = watchlist_id and w.user_id = auth.uid())
  );

-- signals_history: usuario lee sus propias signals. Inserts solo via service_role (RLS bypass).
create policy "signals_select_own" on public.signals_history
  for select using (user_id = auth.uid());
create policy "signals_update_own" on public.signals_history
  for update using (user_id = auth.uid());  -- permite marcar acknowledged_at

-- analyses_log: usuario lee sus runs. Inserts solo via server (service_role).
create policy "analyses_select_own" on public.analyses_log
  for select using (user_id = auth.uid());
