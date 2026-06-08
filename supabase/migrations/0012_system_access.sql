-- 0012_system_access.sql
--
-- Allowlist de acceso a /system (datos internos: prompts, costes, trazas).
-- Estar logueado NO basta; el usuario debe estar en esta lista.
--
-- Lectura SOLO vía la función is_system_authorized() (SECURITY DEFINER). La
-- tabla queda con RLS y SIN policies de select para clientes → nadie puede
-- enumerar la lista; la función (que corre con privilegios del owner) es la
-- única vía. Esto evita el footgun de "tabla protegida por RLS" que queda
-- ilegible y hace que el check siempre falle.
--
-- Ampliable SIN redeploy: un INSERT añade a alguien; un DELETE lo revoca y,
-- como el check se consulta fresco en cada request (sin cache), la revocación
-- es inmediata.

create table public.system_access (
  email      text primary key,   -- guardar en minúsculas (el check normaliza con lower())
  user_id    uuid references auth.users(id) on delete cascade,  -- opcional, informativo
  note       text,
  created_at timestamptz not null default now()
);

alter table public.system_access enable row level security;
-- Sin policies. Ni select para clientes: la lista no se lee directamente.

-- ── Función de autorización ────────────────────────────────────────────────
-- Devuelve true si el email del JWT del llamante está en la allowlist.
-- SECURITY DEFINER → corre con privilegios del owner y puede leer la tabla
-- (los clientes no). STABLE + search_path fijo por higiene/seguridad.
create or replace function public.is_system_authorized()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.system_access
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- Solo authenticated/anon pueden ejecutarla (anon → false: no hay email).
revoke all on function public.is_system_authorized() from public;
grant execute on function public.is_system_authorized() to authenticated, anon;

comment on table public.system_access is
  'Allowlist de /system (prompts/costes/trazas). Lectura SOLO vía is_system_authorized() (SECURITY DEFINER). Ampliable por INSERT sin redeploy; revocación inmediata.';
comment on function public.is_system_authorized() is
  'true si el email del JWT del llamante está en system_access. SECURITY DEFINER: la única vía de lectura de la allowlist.';

-- Seed del owner para no quedarnos fuera al activar el gate.
insert into public.system_access (email, note)
values ('david@aetherlabs.es', 'owner')
on conflict (email) do nothing;
