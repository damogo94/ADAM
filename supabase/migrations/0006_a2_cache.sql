-- 0006_a2_cache.sql
--
-- Cache de output de A2 (macro narrate). Idempotente sobre (ticker, macro_as_of).
--
-- Razonamiento: A2 narra "cómo afecta este régimen macro a este activo".
-- Con temperatura 0.3 y mismos inputs (ticker + macro snapshot), el output
-- es casi-determinístico. Re-llamar a Anthropic cuando los inputs no han
-- cambiado quema tokens y latencia sin valor añadido.
--
-- Clave: (ticker, macro_as_of)
--   - macro_as_of cambia cuando FRED publica datos nuevos (diario para Fed
--     funds/yields/VIX, mensual para CPI/UNRATE). Al rotar `as_of`, el
--     cache se invalida orgánicamente sin DELETE.
--   - ticker porque A2 personaliza la narrativa (correlaciones, sensibilidad).
--
-- Cache shared entre usuarios — A2 no contiene info personal del user, solo
-- contextualiza macro × ticker. RLS desactiva acceso desde cliente; solo
-- service_role lee/escribe.
--
-- TTL: no implementado. Math: ~30 tickers en catálogo × 365 días/año
-- = ~11k rows/año × ~10KB = ~100MB/año. Supabase free 500MB. Tardaría
-- ~5 años en notarse. Lookup O(log n) por PK no degrada con tamaño.

create table public.a2_cache (
  ticker        text not null,
  macro_as_of   date not null,
  output        jsonb not null,
  cached_at     timestamptz not null default now(),
  primary key (ticker, macro_as_of)
);

alter table public.a2_cache enable row level security;
-- Sin policies. service_role (server) bypassa RLS. Cliente no accede.

comment on table public.a2_cache is
  'Output cacheado de A2 narrate. Idempotente sobre (ticker, macro_as_of). Sin TTL — se invalida orgánicamente al rotar as_of del snapshot macro.';
