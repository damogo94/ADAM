-- 0010_backfill_signal_outcomes_hit.sql
--
-- Backfill puntual: recalcula `signal_outcomes.hit` con el mapeo de dirección
-- correcto.
--
-- Bug (corregido en código): hasta el fix de scoring, el cron evaluate-signals
-- pasaba la dirección de la BD (`positivo` / `negativo` / `neutral`) a
-- `scoreSignal`, que esperaba el vocabulario `alcista` / `bajista` / `neutral`.
-- Resultado: TODA señal direccional caía fuera de las ramas → `hit = false`,
-- aunque el activo se hubiera movido en la dirección predicha. Solo las señales
-- `neutral` puntuaban bien (esa rama coincidía en ambos vocabularios).
--
-- `return_pct` NO depende de la dirección, así que ya estaba bien guardado:
-- recalculamos `hit` desde lo persistido, sin re-descargar precios. El umbral
-- es SIGNAL_THRESHOLD_PCT = 2.0 (ver lib/scoring.ts). Idempotente: solo toca
-- filas cuyo `hit` difiere del valor correcto, así que re-ejecutar es no-op.

update public.signal_outcomes so
set hit = (
  case al.direction
    when 'positivo' then so.return_pct >= 2.0
    when 'negativo' then so.return_pct <= -2.0
    when 'neutral'  then abs(so.return_pct) < 2.0
    else so.hit
  end
)
from public.analyses_log al
where al.id = so.analysis_id
  and so.hit is distinct from (
    case al.direction
      when 'positivo' then so.return_pct >= 2.0
      when 'negativo' then so.return_pct <= -2.0
      when 'neutral'  then abs(so.return_pct) < 2.0
      else so.hit
    end
  );
