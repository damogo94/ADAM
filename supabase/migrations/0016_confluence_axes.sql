-- 0016_confluence_axes.sql
-- Fase 1 · Separación de ejes (VEREDICTO firmado / CONFLUENCIA).
--
-- ADITIVA y NO destructiva. Añade los ejes nuevos como columnas NULLABLE:
--   - net_pct        : veredicto firmado −100..+100 (signo = dirección, |net| = convicción neta)
--   - kappa          : coherencia entre agentes 0..1 (= alineados.score / 100)
--   - actionable_pct : confianza accionable 0..100 = |net| × f(κ)
--
-- `confluence_pct` (semántica vieja) se CONSERVA intacto: no romper la
-- comparabilidad histórica de las 232 filas ni la calibración (signal_outcomes).
-- Las filas previas a esta fase quedan con net_pct/kappa/actionable_pct = NULL;
-- las nuevas los traen, y el a4_output.confluence además marca schema_version = 2
-- (eso vive en el jsonb, no necesita columna).
--
-- Los CHECK se satisfacen con NULL (semántica SQL), así que las filas viejas
-- (todas NULL) pasan sin scan problemático.

alter table public.analyses_log
  add column if not exists net_pct        smallint check (net_pct between -100 and 100),
  add column if not exists kappa          real     check (kappa between 0 and 1),
  add column if not exists actionable_pct smallint check (actionable_pct between 0 and 100);

comment on column public.analyses_log.net_pct is
  'Fase 1 · veredicto firmado −100..+100 (signo=dirección, |net|=convicción neta). NULL en filas pre-ejes.';
comment on column public.analyses_log.kappa is
  'Fase 1 · coherencia entre agentes 0..1 (alineados.score/100). NULL en filas pre-ejes.';
comment on column public.analyses_log.actionable_pct is
  'Fase 1 · confianza accionable 0..100 = |net|·f(κ). Lo que muestra el titular. NULL en filas pre-ejes.';
