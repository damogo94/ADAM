-- 0017_analyses_log_estructura.sql
-- Estructura (futuros · MTF) como 4ª pata co-igual en la persistencia.
--
-- Hasta ahora EST era opt-in SOLO en el cliente: el indicador de confluencia se
-- recalculaba en vivo a 4 patas, pero ni la narrativa de A4 ni la fila persistida
-- reflejaban EST (se horneaban a 3 patas en /run). Cuando el usuario suma EST y
-- se re-narra A4, queremos guardar el output crudo de EST igual que a1/a2/a3/
-- debate_output — paridad de auditoría: un rerun reconstruye POR QUÉ la
-- confluencia pasó a 4 patas.
--
-- ADITIVA y NO destructiva. Columna NULLABLE: las filas a 3 patas (la mayoría)
-- quedan con estructura_output = NULL; solo las que sumaron EST lo traen.

alter table public.analyses_log
  add column if not exists estructura_output jsonb;

comment on column public.analyses_log.estructura_output is
  'Output del Agente de Estructura (futuros · MTF) cuando el usuario sumó la 4ª pata y se re-narró A4. NULL en análisis a 3 patas.';
