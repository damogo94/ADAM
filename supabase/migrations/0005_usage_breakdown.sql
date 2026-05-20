-- 0005_usage_breakdown.sql
--
-- Observabilidad por agente. Hoy `analyses_log.tokens_used` agrega los
-- tokens de los 5 agentes en un solo entero, lo cual hace imposible
-- responder "¿qué agente quema el presupuesto?" o "¿el coste medio de
-- Debate se duplicó tras el último cambio de prompt?".
--
-- `usage_breakdown` guarda el array crudo de AgentUsage devuelto por el
-- pipeline (uno por llamada LLM):
--
--   [
--     { "agent":"A1", "model":"claude-sonnet-4-6",
--       "input_tokens":2100, "output_tokens":850,
--       "cache_read_input_tokens":1800, "cache_creation_input_tokens":0 },
--     { "agent":"A2", ... },
--     ...
--   ]
--
-- Decisión: JSONB en `analyses_log` antes que tabla normalizada
-- `agent_runs`. Escala pequeña (1 user, ~30 runs/día), una columna evita
-- migration pesada y joins. Si la query agregada de "30 días por agente"
-- empieza a tirarse >500ms, normalizamos.

alter table public.analyses_log
  add column if not exists usage_breakdown jsonb;

-- Index GIN para que `where usage_breakdown @> '[{"agent":"A2"}]'` y
-- agregaciones tipo `jsonb_array_elements` no hagan seq scan completo
-- una vez la tabla crezca.
create index if not exists analyses_log_usage_breakdown_idx
  on public.analyses_log
  using gin (usage_breakdown);

comment on column public.analyses_log.usage_breakdown is
  'Array de AgentUsage (lib/anthropic.ts) — uno por llamada LLM dentro del run. NULL para runs anteriores a 2026-05.';
