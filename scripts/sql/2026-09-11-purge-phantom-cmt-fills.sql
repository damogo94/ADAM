-- scripts/sql/2026-09-11-purge-phantom-cmt-fills.sql
--
-- R2 · Purga de fills FANTASMA en signal_trade_outcomes (plan de precisión
-- 2026-09, sección 5). NO es una migración de esquema: no toca DDL ni tipos.
--
-- CONTEXTO
--   Hasta la migración 0019 (signals_history.entry_type) el cron
--   evaluate-signal-trades asumía entry_type='market' para toda señal CMT: una
--   orden LÍMITE se "rellenaba" al precio del nivel el día de emisión y corría la
--   carrera stop/target, fabricando wins en órdenes que jamás se habrían
--   ejecutado (BTC venta límite 69280 con máximo posterior ~66k). 0019 añadió y
--   backfileó la columna, pero (a) las filas ya evaluadas quedaron en
--   signal_trade_outcomes, y como para el cron "existe fila = resuelto"
--   (app/api/cron/evaluate-signal-trades/route.ts, cruce con signal_trade_outcomes)
--   nunca se re-evaluaron; y (b) el fallback 'market' para entry_type NULL
--   siguió vivo en lib/backtest/signal-plan.ts y fabricó 4 fills más el
--   2026-07-11. Ese fallback se eliminó en código (R1): ahora NULL → plan null →
--   outcome 'not_evaluable' (terminal). Este script limpia el histórico.
--
-- DEFINICIÓN DE "PHANTOM" (única, fijada aquí; el plan barajaba 11/12/13):
--   fila de outcome evaluada como 'market' cuya señal NO es 'market'
--   (entry_type 'limit' o NULL):  o.entry_type = 'market'
--                                 AND s.entry_type IS DISTINCT FROM 'market'
--   No se purga por corte de fecha (sección 8 del plan: conservaría 2 losses del
--   mismo defecto y la GC=F se fabricó el 13-jul, después del fix).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- (a) DIAGNÓSTICO — solo lectura. Lista exactamente las filas afectadas.
-- ─────────────────────────────────────────────────────────────────────────────

select
  o.signal_id,
  s.ticker,
  s.emitted_at,
  s.entry_type  as signal_entry_type,
  o.entry_type  as outcome_entry_type,
  o.direction,
  o.outcome,
  round(o.r_multiple::numeric, 3) as r_multiple,
  o.resolved_days,
  o.evaluated_at
from public.signal_trade_outcomes o
join public.signals_history s on s.id = o.signal_id
where o.entry_type = 'market'
  and s.entry_type is distinct from 'market'
order by s.emitted_at;

-- RESULTADO REAL (ejecutado en producción el 2026-09-11, SELECT de solo lectura):
-- 13 filas — coincide con la cifra "13" del plan (H01/R2).
--
--   signal_id                             ticker  emitted_at            sig.entry  out.entry  dir   outcome  r_mult  days  evaluated_at
--   f6f0261f-f2f8-484b-bb39-ca1499f3aeac  BTC     2026-07-04 21:30:17   limit      market     sell  win      3.090   0     2026-07-11
--   91ef82b4-ea7b-4fc1-b3a7-3c0f2ae93d18  BTC     2026-07-04 21:30:18   limit      market     sell  win      3.090   0     2026-07-11
--   e16e379c-e8fa-4bc2-93f8-2d1cecaab3d0  BTC     2026-07-05 21:30:17   limit      market     sell  win      3.253   0     2026-07-11
--   13d863c8-2fed-4879-9ff1-eeafecfa9572  BTC     2026-07-05 21:30:17   limit      market     sell  win      3.253   0     2026-07-11
--   4972584f-c569-4193-9a5a-b175b06aa397  BTC     2026-07-06 21:31:08   limit      market     sell  win      3.063   1     2026-07-11
--   13ea0b3a-e079-4eb4-a769-50dc724e9740  BTC     2026-07-06 21:31:09   limit      market     sell  win      3.063   1     2026-07-11
--   b8eb053f-99cc-4c53-8218-829a8006b981  BTC     2026-07-07 13:16:50   limit      market     sell  win      3.106   0     2026-07-11
--   4d800d5d-f300-42fd-9bb9-ef278bd6943d  BTC     2026-07-07 21:10:55   limit      market     sell  win      3.106   0     2026-07-11
--   f72fc397-6ac5-4468-8767-a5983854aeb0  BTC     2026-07-07 21:10:56   limit      market     sell  win      3.106   0     2026-07-11
--   a4d819c6-d5f5-4f43-ac12-aed908f6f74b  GC=F    2026-07-11 21:08:44   NULL       market     sell  win      2.595   1     2026-07-13
--   91219b91-0063-44ec-a79a-02742d03eb91  XRP     2026-07-11 21:08:44   NULL       market     buy   loss    -1.000   26    2026-08-07
--   0858f4a8-f184-4dbd-8a28-291fa831b81e  SPY     2026-07-11 21:08:44   NULL       market     sell  loss    -1.000   24    2026-08-04
--   b2b882e1-064f-43e3-88cd-dff9f44aaa3b  GC=F    2026-07-11 21:08:46   NULL       market     sell  win      2.595   1     2026-07-13
--
-- Desglose: 9 × (limit→market, todas BTC sell "win" resueltas en 0–1 día) +
-- 4 × (NULL→market: GC=F ×2 win, XRP loss, SPY loss). Las 4 NULL son las ÚNICAS
-- señales con entry_type NULL de la tabla (125 señales: 102 limit, 19 market,
-- 4 NULL). Agregado de signal_trade_outcomes antes de la purga: 102 filas =
-- 17 win / 44 loss / 39 no_fill / 2 timeout. Sin las 13 phantom: 6 win / 42 loss
-- / 39 no_fill / 2 timeout (n=89).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ORDEN OBLIGATORIO: (b0) ANTES de (b). Si (b) ya corrió sin (b0), el cron habrá
-- escrito 'not_evaluable' (terminal: existencia de fila = resuelto) para las 4
-- señales NULL y el UPDATE posterior NO las re-evaluará. En ese caso, tras (b0),
-- repetir (b) acotado a esos 4 signal_id (delete ... where signal_id in (...)).
-- ─────────────────────────────────────────────────────────────────────────────
-- (b0) OPCIONAL, ANTES DEL DELETE — recuperar el entry_type de las 4 señales NULL.
--      Se emitieron el 2026-07-11 21:08 (misma pasada del cron), DESPUÉS de que
--      corriera el backfill de 0019, por lo que quedaron sin rellenar aunque su
--      `setup_detected` codifica el tipo ("Venta en límite …" / "Venta a mercado
--      …" / "Compra en límite …"). Es el MISMO parse de 0019 y el CHECK
--      signals_history_entry_type_check lo admite. Si NO se ejecuta, tras el
--      DELETE el cron las persistirá como 'not_evaluable' (R1) — también correcto,
--      solo menos informativo. Sin efecto sobre ninguna otra fila (WHERE IS NULL).
-- ─────────────────────────────────────────────────────────────────────────────

-- EJECUTAR SOLO CON APROBACION DEL OWNER
-- update public.signals_history
-- set entry_type = case
--   when setup_detected ilike '%en límite%' or setup_detected ilike '%en limite%' then 'limit'
--   when setup_detected ilike '%a mercado%' then 'market'
--   else null
-- end
-- where entry_type is null;
-- -- esperado: UPDATE 4  (GC=F ×2 → limit · XRP → limit · SPY → market)

-- ─────────────────────────────────────────────────────────────────────────────
-- (b) PURGA — borra las 13 filas phantom. Idempotente (segunda ejecución = 0).
-- ─────────────────────────────────────────────────────────────────────────────

-- EJECUTAR SOLO CON APROBACION DEL OWNER
-- delete from public.signal_trade_outcomes o
-- using public.signals_history s
-- where s.id = o.signal_id
--   and o.entry_type = 'market'
--   and s.entry_type is distinct from 'market';
-- -- esperado: DELETE 13

-- Verificación posterior (solo lectura; debe devolver 0):
-- select count(*) from public.signal_trade_outcomes o
-- join public.signals_history s on s.id = o.signal_id
-- where o.entry_type = 'market' and s.entry_type is distinct from 'market';

-- ─────────────────────────────────────────────────────────────────────────────
-- (c) QUÉ PASA DESPUÉS — re-evaluación automática por el cron
-- ─────────────────────────────────────────────────────────────────────────────
-- Verificado leyendo app/api/cron/evaluate-signal-trades/route.ts:
--   · La selección de candidatas es: signals_history WHERE timeframe='1D' AND
--     entry_price/stop_loss/target_price NOT NULL, ORDER BY emitted_at ASC,
--     LIMIT 500 (125 señales en total → cabe todo). NO hay ninguna cota sobre
--     emitted_at, así que las 13 señales vuelven a ser candidatas en cuanto deje
--     de existir su fila en signal_trade_outcomes (el cron descarta solo las que
--     tienen fila: "existencia = resuelto"). No hace falta ajustar el cron.
--   · Con la ventana (30d) ya vencida, el cron acota las velas Yahoo (`1y`) a
--     (emitted_at, emitted_at+30d] y corre evaluateTrade con el entry_type REAL:
--       - 'limit' → fill SOLO si alguna vela toca el nivel; si no → no_fill (0R).
--         Esperado para las 9 BTC (venta límite 69280.53; el plan documenta un
--         máximo posterior a 30d de ~66258): no_fill. Para GC=F (4248.83, máximo
--         documentado ~4164) si se aplicó (b0): no_fill.
--       - 'market' (SPY tras (b0)) → se re-evalúa a mercado desde la emisión;
--         la pérdida es honesta y debería reproducirse.
--       - NULL (si NO se aplicó (b0)) → 'not_evaluable' con direction inferida y
--         entry_type null (R1: nunca 'market').
--   · Único límite temporal: la re-evaluación necesita que Yahoo `1y` aún cubra
--     la ventana de la señal. Estas señales son de jul-2026 → ejecutar la purga
--     ANTES de ~jun-2027; pasada esa fecha el cron las cerraría como
--     'not_evaluable' por "ventana vencida sin velas" (route.ts, rama
--     `win.length === 0 && windowElapsed`), que sigue siendo honesto pero pierde
--     el no_fill informativo.
--   · Tests que fijan este comportamiento:
--       lib/backtest/__tests__/signal-plan.test.ts (NULL → sin plan; limit ≠ market)
--       app/api/cron/evaluate-signal-trades/__tests__/route.test.ts (NULL →
--       not_evaluable; limit sin toque → no_fill; candidatas sin cota temporal).
-- Lecturas afectadas (ninguna rota): GET /api/signals y /api/watchlist/radar
-- mostrarán outcome null para esas 13 señales hasta la siguiente pasada del cron
-- (diaria); el track record CMT pasa a 6W/42L por fila hasta la re-evaluación.
