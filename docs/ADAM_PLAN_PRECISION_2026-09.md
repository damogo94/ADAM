# ADAM · Plan de precisión (2026-09-11)

> Informe generado el 2026-09-11 por el workflow multi-agente `adam-precision-plan-lite` (23 agentes: 3 lectores de código, 2 analistas SQL de solo lectura más el análisis de operativas A3 de una corrida previa, 1 generador de hipótesis, 8 contrafactuales in-sample, 8 escépticos con tres lentes cada uno, 1 síntesis con crítico de completitud). Datos: `analyses_log`, `signal_outcomes`, `trade_outcomes`, `signals_history`, `signal_trade_outcomes` de producción a esa fecha. No se modificó ningún fichero del repo ni ninguna fila de la base de datos.
>
> **Contexto operativo:** la cuenta de Anthropic está sin crédito desde el 4 de agosto de 2026 (confirmado disparando el cron `watchlist-scan` en producción: `"credit balance is too low"`). Desde entonces no hay análisis nuevos; los crons deterministas (`cmt/scan`, `evaluate-*`) siguen vivos.
>
> **Cómo leer las hipótesis:** los escépticos tenían la instrucción "si dudas, refuta". Las ocho candidatas fueron refutadas *tal cual* (in-sample, un régimen, 1-2 setups por celda); el informe recoge en las secciones 3-6 las reformulaciones que sí sobreviven a esa crítica. Este documento es un plan de trabajo, no una validación: nada de lo que sigue convierte una señal en tradeable (ADR-004/005).

Todo lo que sigue es IN-SAMPLE (may–ago 2026), un solo régimen (oro, SPY, QQQ y BTC al alza salvo la caída de BTC en mayo), y con n efectivo de ~10 setups A3 / ~12 clusters CMT / ~6 eventos de mercado. n<20 = anecdótico. Nada de este informe convierte una señal en tradeable (ADR-004/005).

## 1. Diagnóstico en 10 líneas

1. **Medición rota antes que señal mala.** El único track record positivo del sistema (CMT +7.9R, 17W/44L, n63) contiene 11–13 fills físicamente imposibles (BTC límite 69280 con máximo 30d 66258; GC=F 4248.83 con máximo 4164) evaluados antes/alrededor de la migración 0019. Sin ellos: 6W/44L, −25.4R (n52).
2. Las 5 ganadas A3 de BTC-mayo vienen de un compute retirado (sin osciladores/SMA200). Con el código vigente y fills reales existe **un solo setup ganador** (BTC compra límite jul: 3 filas A3 + 4 CMT). Fuera de BTC: 0 de 50 (A3) y 2W/42L (CMT honesto).
3. **Régimen, no información:** 46/50 pérdidas A3 y 42/42 pérdidas CMT honestas se resolvieron el 4–7 de agosto (rally oro+SPY). A4 'negativo' acertó 100% en mayo (n23), 28.9% en junio (n97), 2.8% en julio (n107): sigue la tasa base bajista del mes, no la anticipa.
4. **Sesgo estructural a cortos:** 101 sell vs 7 buy en 489 análisis; commodity 40/0, index_etf 41/0. Nace de la geometría (detector de tendencia con 2 swings + sin resistencia arriba en máximos → hold) y no de una lectura del mercado. Solo puede perder en un mercado alcista.
5. **A4 no supera la tasa base:** 34.0% @30d (n482) vs 'siempre alcista' 36.3% / 'siempre neutral' 35.5%. Por ticker solo empata en BTC. 48.5% de veredictos negativos cuando solo 28.2% de ventanas cayeron.
6. El sesgo negativo es en 3/4 partes **narrativo**: 91/118 negativos-con-hold-de-A3 tienen net_pct NULL o |net|<G_MIN (Haiku pone la dirección); solo 27 los manda compute.ts. kappa y actionable_pct no discriminan (kappa≥0.3 → 18.4%, n103).
7. **A2 ausente en 288/332 filas del cron (86.7%)** por timeout inline de 25s + reintento SDK (latencia mediana 58.5s, 'timeout' literal en 257 resúmenes); los 44 con A2 son hits de caché de usuarios manuales. Con A2 null el Debate nunca corre (0/342) y κ queda anclado a 0.30.
8. **Estructura nunca ha persistido** (0/489) y el pipeline LLM está parado desde el 2026-08-03 (sin crédito). Los crons deterministas siguen vivos: CMT ha emitido 29 señales desde el 04-ago (23 sin evaluar) — la única muestra fuera de muestra que se está acumulando.
9. n inflado por repetición: cron diario sin dedup (QQQ 27 filas = 1 nivel), 151/489 filas en fin de semana (95 del cron, 59 en tickers cerrados con vela repetida).
10. Conclusión: no hay palanca con evidencia de edge. Hay (a) higiene de datos obligatoria, (b) defectos operativos reparables sin crédito, (c) gates de exposición que solo pueden validarse fuera de muestra con el harness extendido a cortos.

## 2. Tabla resumen de hipótesis

Lentes: E = estadística, C = código/ADR, R = reproducibilidad (✗ = refutada tal cual, ✓ = sostenida). Esfuerzo S/M/L.

| id | tipo | regla | baseline → con regla (n) | n efectivo | E / C / R | esfuerzo |
|---|---|---|---|---|---|---|
| H01 | reparar | purgar/re-evaluar fills phantom pre-0019 + contar por cluster | CMT 17W/44L +7.9R (63) → 6W/44L −25.4R (52) | 6 clusters rellenados (2W/4L) | ✗ .55 / ✗ .50 / ✓ .85 | M (migración) |
| H02 | reparar | timeout A2 ≥40s en cron + mover pre-warm | 34.0% (482) → 34.0% (482) por construcción | 21 clusters cron con A2 | ✗ .70 / ✗ .65 / ✓ .85 | S–M |
| H03 | reparar | HOLD de A3 no vota en net_pct | 34.0% (482) → 32.1% (364); pred 118 filas 39.8% | 28 clusters; solo 27 filas mandadas por código | ✗ .80 / ✗ .70 / ✗ .85 | M |
| H04 | filtrar | veto corto si precio > SMA200 | A3 8W/50L −22.5R (58) → 8W/27L +0.6R (35) | 23 vetadas = 4 clusters / 2 setups | ✗ .90 / ✗ .60 / ✓ .90 | S (shadow) |
| H05 | filtrar | límite a >2 ATR → 'esperando' | 8W/50L (58) → 8W/34L −6.5R (42); excl 0W/16L/12NF | ~3 setups; umbral solo válido en [1.71, 2.12] ATR | ✗ .85 / ✗ .70 / ✓ .90 | M |
| H06 | descartar | target >6 ATR no operativo | 8W/50L −22.5R (58) → 5W/20L −2.5R (25); excl 3W/30L | 4 setups; sin BTC 0W en todo K∈[4,8] | ✗ .85 / ✗ .75 / ✓ .80 | M |
| H07 | validar | harness multi-régimen a cortos + benchmark + N eff | no testable por SQL; unión H04∪H05∪H06 retiene 13 filas 5W/8L +9.5R (6.5 ATR → 8W/8L) | 1 cluster explica toda la 'mejora' | ✗ .80 / ✗ .60 / — .70 | L |
| H08 | validar | holdout forward tras recarga | no testable (0 filas desde 03-ago); proxy 86 filas 30.2% | ~120 clusters/trimestre → detecta solo Δ≥18pt | ✗ .80 / ✓ .70 / ✗ .85 | M |

Ninguna sobrevive **tal cual**; las reformulaciones de las secciones 4–6 sí.

## 3. DESCARTAR ya

| qué | evidencia | qué se pierde |
|---|---|---|
| El track record CMT +7.9R y las 9 'wins' BTC sell | 11–13 fills sin toque real del nivel (máx 30d 66258 vs nivel 69280; 4164 vs 4248.83), resueltos en 0–1 día | El único número positivo del sistema; queda 6W/44L −25.4R (n52), 2 clusters ganadores |
| kappa / actionable_pct como filtro de emisión | kappa≥0.3 → 18.4% (n103) < base 34.0; actionable<30 21.7% (n175); ≥0.6 n5 | Nada: hoy no se usan como filtro |
| 'R/B ≥ 2' y 'solo market' como filtros CMT | R/B≥2 → 4W/42L −26.7R (n87), elimina las únicas ventas ganadoras honestas (GC=F R/B 1.6); solo market 2W/10L (n12) | Nada |
| 'urgente' como semántica de calidad | urgente ≡ venta a mercado en SPY; 0W/11L −11R (2 clusters, ambos 04-ago) | La prioridad visual del radar debe pasar a ser 'tipo de entrada', no 'calidad' |
| Reponderar A4 / K_FLOOR / G_MIN ahora | A2 ausente en 342/489 → A3 domina el net; cualquier ajuste aprende 'no ir corto en 2026' (negativo·media 8.6% n105 vs positivo·media 70% n20) | Nada (Etapa 2 ya pausada por el owner) |
| Mover a2-reconcile a 20:45 como fix | macro_as_of = todayISODate() (macro.ts:100,125), no rota intradía; el pre-warm falla porque narra a 30s (34 filas en ~36 días) | Nada |
| Pre-warm de A2 dentro del lambda de watchlist-scan | 4.4 filas/día × 58s ≈ 255s de 300s, sin TIME_BUDGET | Nada |
| Las 5 ganadas BTC-may como evidencia de cortos | a3_output sin 'osciladores', sma200 NULL, timeframes 1D+4H: compute retirado | La 'prueba' de que el corto funcionó alguna vez con el código actual |
| Contar por fila (70 A3, 102 CMT, 482 A4) | 70 → 17 grupos → ~10 setups; 102 → 13 clusters; 482 → 135 runs → ~6 eventos | Todas las tasas presentadas hoy en /system y radar |

## 4. FILTRAR (gates de exposición; sin evidencia de edge; solo como *shadow tag* hasta OOS)

Advertencia común: cada número es in-sample, un régimen, y coincide con 1–2 setups; el umbral se eligió mirando la muestra. Se implementan como **marca persistida** (operativa sigue emitiéndose, se sigue evaluando) para que producción mida el gate gratis, y como filtro solo en presentación/radar detrás de flag OFF.

| gate | predicado | in-sample A3 (58 rellenadas) | in-sample CMT honesto | baseline trivial que debe batir |
|---|---|---|---|---|
| F1 · veto corto sobre SMA200 (H04) | `signal='sell' AND initial_price > sma200` | vetadas 0W/23L (SPY 20, AAPL 3) = 2 setups; conservadas 8W/27L; **0/24 del oro no se tocan**; 5 wins con sma200 NULL indeterminados | vetadas SPY 0/16 + QQQ 26 NF; conservadas GC=F 0/27 | 'ningún corto en index_etf' (SPY+QQQ: 0W/20L + 21 pend.) — si no lo supera, no aporta |
| F1' · espejo obligatorio | `signal='buy' AND initial_price < sma200` | mataría BTC buy 3/3 (−10% bajo SMA200) y CMT 4/4 | — | Si el espejo destruye el largo, 'no operar contra tendencia mayor' queda falsado |
| F2 · límite a >2 ATR = 'esperando' (H05) | `entry_type='limit' AND abs(entrada−precio)/atr > 2` | excl 0W/16L/12NF; ganadas a ≤1.70 ATR; a 1.5 ATR mata 3/8 ganadas, a 3 ATR no excluye nada | excl 0W/17L/26NF (QQQ 27/27 NF, dist 1.4–4.9 ATR) | Efecto R esperado = 0 (los no_fill ya valen 0R); objetivo = fill-rate y ruido del radar |
| F3 · coherencia target↔ventana CMT (H06 reformulada) | CMT: `K=|target−entrada|/ATR > √30 = 5.48` | — | 26/26 señales R/B≥10 son no_fill; targets −12..−21% | Constante derivada del código (K² barras), no elegida; A3 posicional K>√120≈10.95 no afecta hoy a nadie |
| F4 · no 'negativo' con A2 risk_on | `direction='negativo' AND a2.regime_outlook='risk_on'` | 53 filas, 2 aciertos (3.8%); global 34.0 → 37.8% (n429) | — | A2 nunca emitió risk_off: equivale a 'no ir contra el macro en un mercado alcista' |
| F5 · fin de semana | no-crypto en sáb/dom en watchlist-scan y cmt/scan | 59 filas cron no-crypto con vela repetida (de 95) | señales repetidas sin vela nueva | Reduce n falso y ~13k tokens/día; no cambia decisiones |

Por clase (analyses_log, n=489): commodity 108 filas, 40 sell/0 buy, rellenadas 0W/24L · index_etf 152, 41/0, 0W/20L (+21 QQQ pendientes) · crypto 187, 17/6, 8W/3L · equity 42, 3/1, 0W/3L. La regla 'ningún corto en commodity/index_etf' elimina in-sample 0W/44L y es el comparador honesto de F1/F3.

## 5. REPARAR (defectos del generador y de la medición)

| # | defecto | file:lines | fix |
|---|---|---|---|
| R1 | NULL entry_type degrada a 'market' → fabrica fills | `lib/backtest/signal-plan.ts:57` | NULL → plan null → cron persiste `not_evaluable`; nunca 'market' |
| R2 | 13 filas phantom siguen en `signal_trade_outcomes` y el cron nunca reevalúa (existencia = resuelto) | `app/api/cron/evaluate-signal-trades/route.ts:70-78`; `supabase/migrations/0019:17-18` ya lo anunciaba | Migración aprobada: `eval_version` o delete+reinsert de las 13 filas (`o.entry_type='market' AND s.entry_type IS DISTINCT FROM 'market'`), re-evaluar con fill por toque; limit → esperado no_fill, NULL → not_evaluable |
| R3 | cmt/scan reinserta la misma señal cada día | `app/api/cmt/scan/route.ts:73-97` | dedup por `(user_id, ticker, dirección, entry±1%, target)` mientras exista señal sin outcome <30d; no tocar GET /api/signals, ack ni `.in()` del radar |
| R4 | A2 inline en cron a 25s + retry SDK = 288/332 nulls, ~50s perdidos | `agents/pipeline.ts:225` (sin timeoutMs), `lib/pipeline-runner.ts:100`, `lib/anthropic.ts:46,89` | `a2TimeoutMs?: number` en RunADAMOptions, solo a narrateA2; cron pasa 45_000 (único valor con evidencia, `app/api/agents/a2/route.ts:79`). DEFAULT_TIMEOUT_MS y /run intactos |
| R5 | a2-reconcile narra a 30s → 34 filas warm en ~36 días | `app/api/cron/a2-reconcile/route.ts:103,158` | 30_000 → 45_000; persistir warmed/backfilled (Sentry breadcrumb o tabla); comentario obsoleto 'P99 26-28s' en `agents/a2/narrate.ts:83` → 'P50: a 25s falla 257/260' |
| R6 | watchlist-scan sin presupuesto de tiempo (≈255s/300s) | `app/api/cron/watchlist-scan/route.ts:102-121` | TIME_BUDGET_MS ≈ 240s + log de corte, como reconcile |
| R7 | A4 narra dirección libre en banda muerta (|net|<G_MIN o net NULL): 91/118 negativos-hold | `agents/a4/narrate.ts:181-183`, `agents/a4/compute.ts:401-405` | Mandar `neutral` cuando |net|<G_MIN (o loguear `direccion_narrada` vs mandada); versionar `schema_version=3` |
| R8 | 'confianza' de A4 es juicio libre de Haiku | `agents/a4/narrate.ts:164-173` | Persistir `confianza_derivada = levelFromScore(actionable_pct)` junto a la narrada (no sustituir) para calibrar ambas |
| R9 | Calibración presenta 34% sin tasa base ni n por run | `app/api/metrics/calibration/route.ts` (no consume signal_trade_outcomes); `components/signals/helpers.ts` + `app/api/signals/route.ts` para CMT | Añadir 'siempre alcista/neutral/bajista' por ticker con umbral max(2%, ATR%) y n por cluster (≤3d/ticker) junto al hit; documentar horizonte efectivo [h,h+1) en `app/api/cron/evaluate-signals/route.ts:48-58` |
| R10 | 'urgente' = venta a mercado con R/B≥2.5 (0/11) | `agents/cmt/build-signal.ts:96-107` | Etiquetar el nivel por tipo de entrada/alcanzabilidad (F2/F3), no como prioridad de calidad |
| R11 | OperativaInput no recibe sma200; SELL sin veto ni marca | `agents/a3/compute/operative.ts:53-79, 202-237`; `agents/a3/compute.ts:95,135-147` | Pasar sma200 y emitir `operativa.veto_regimen: boolean|null` nullable+optional en **ambos** schemas (`agents/a3/schema.ts` + `agents/shared/types.ts`), merge por código, nunca al prompt |
| R12 | Estructura 0/489 persistida | `components/analysis/run-provider.tsx` → `app/api/agents/a4/route.ts` (`consolidateAndPersistA4`) | Verificar si el toggle opt-in llega a persistir; si nadie lo usa, no invertir en su leg de trade_outcomes |
| R13 | Cron corre 7 días sobre tickers cerrados | `vercel.json` (`0 21 * * *`, `30 21 * * *`), watchlist-scan, cmt/scan | Skip de tickers no-crypto sáb/dom (por asset_type del catálogo), o dedup por vela |
| R14 | Sin crédito Anthropic desde 03-ago: A1/A2/A3-narrate/A4 parados | operativo | Recargar; presupuesto medido ≈10.2k tokens/análisis (4.98M/489), cron ≈44k tokens/día; R4 convierte 2 llamadas Sonnet fallidas en 1 útil |

Restricciones que respetan todos los R: A3 sigue solo-OHLCV (SMA200 es OHLCV), Estructura y sus `CLAVES_PERMITIDAS` intactas, `MODELS`/`DEFAULT_TIMEOUT_MS`/`HORIZON_WINDOW_DAYS`/`entry_type` end-to-end intocados, `A3_LONG_TREND_FOLLOW` OFF, `exhaustion.ts` dormido.

## 6. VALIDAR (protocolo OOS/forward, ADR-004/005)

**V1 · Harness multi-régimen extendido a cortos (H07 reformulada).** `scripts/multiregime-backtest.test.ts` (`RUN_BACKTEST=1`, Yahoo 10y, 38 tickers + techos colapsados elegidos por regla mecánica documentada, p.ej. drawdown ≥80% desde ATH 2016-2024).
- ADR-0006 escrito y commiteado ANTES de correr, con hash de umbrales; declarar que F1/F2/F3 nacen de la muestra live → esta corrida es su PRIMER test, no una confirmación.
- Implementación 100% en `scripts/` como post-filtros sobre `out.operativa/out.medias/out.soportes` (no tocar `operative.ts`; la constante K_TARGET no existe). Dos pasadas: sell con `A3_LONG_TREND_FOLLOW` OFF (compute idéntico a prod), buy con el stub actual (l.49). Corregir la truncación: bucle hasta `cs.length − WIN[horizonte] − 1` (hoy H2=63 < WIN posicional 120 → timeouts contados como resueltos, l.72 + trade-eval:113).
- Métricas: R por plan EMITIDO (no_fill = 0R) y por rellenado; exceso vs buy&hold(-corto) del propio nombre y vs SPY (fuera de A3); doble-null; N efectivo = clusters ticker×trimestre; IC bootstrap por bloque temporal×ticker.
- Sanity previo obligatorio: reproducir +0.077R gross / +0.031R neto@10/40 (±0.01) en la rama buy antes de leer cifras sell.
- **Un** test primario pre-fijado (neto@20/80 de F1∪F3 en universo des-sesgado, IC excluye 0); todo lo demás exploratorio con Holm. Criterio de conservación como candidato a paper-trading: pasa el primario Y no empeora bull/bear/lateral por debajo de −0.05R Y supera 'ningún corto' y 'ningún corto en index_etf'. Reportar cortos ganadores vetados, no solo perdedores evitados.
- Aprobar ≠ tradeable: después, paper-trading forward (ADR-005).

**V2 · Forward holdout (H08 reformulada).** Prerrequisitos ordenados: R4/R5 → recarga de crédito → fecha t0 → holdout = created_at ≥ t0 (mide el sistema NUEVO, con A2). Test primario único de no-inferioridad: hit@30d por cluster de A4 ≥ constante del ticker **fijada ahora** (ganadora in-sample o siempre-neutral si empate), IC bootstrap por cluster. Potencia declarada: ~120 clusters/trimestre detectan solo Δ≥18pt (Δ=10pt exige ~390 clusters/brazo). Régimen etiquetado por fila (SPY y BTC vs SMA200) y reportado estratificado; si resulta un solo régimen, conclusión pre-escrita 'no decidible'. A2 presente/ausente solo dentro de filas de cron. Dedup por calendario bursátil por asset_type, no por `dow(created_at UTC)`.

**V3 · OOS ya en curso (no mirar hasta madurar; contar como 1 setup cada uno).** 23 señales CMT sin evaluar (BTC compra 75185 ×6, GC=F compra 4025 ×4, SPY urgente 766–770 ×5, SPY límite 776.39 ×2, GC=F venta 4777/4358 ×4, BTC 62383 ×2): primer test de F1/F3/R10. 21 QQQ sell·posicional (nivel 746.29, target 591.63) maduran 10-nov → 1-dic-2026: n=1.

## 7. Orden de ejecución en 3 tandas

| tanda | contenido | criterio de éxito medible | necesita crédito |
|---|---|---|---|
| **T1 · higiene + operativo (1–2 semanas)** | R1, R2 (migración), R3, R9 (tasa base + n por cluster en /system y radar), R10, R13, R4/R5/R6 (código), R11 shadow tag, R14 | Track record CMT publicado = 6W/44L por fila y 2W/4L por cluster; 0 filas `market` con señal no-market; cmt/scan inserta ≤1 fila por (user, ticker, nivel) por 30d; /system muestra 'siempre alcista/neutral' junto a A4; `pnpm test` verde + tests nuevos (signal-plan NULL, dedup, veto_regimen en ambos schemas) | No (R4/R5 se verifican tras recarga) |
| **T2 · validación OOS (2–4 semanas, offline)** | ADR-0006 + V1 (harness sell, benchmark, N eff, JSON versionado en `scripts/out/`) | Sanity ±0.01R reproducido; informe con test primario + exploratorios con Holm; decisión escrita por gate: candidato a paper-trading / descartado; ningún flag de prod encendido | No (Yahoo sin claves) |
| **T3 · forward (≥1 trimestre tras recarga)** | recarga → 14 días de verificación R4/R5 → t0 → V2 + V3 | A2 presente en ≥90% de filas cron en 14 días; debate corre cuando A1/A2 flag; filas/día del cron ≥4.4 (sin regresión); a los 90 días: ≥100 clusters dedup, informe de no-inferioridad por ticker + régimen; 21 QQQ y 23 CMT contados como setups | Sí (≈44k tokens/día cron + uso manual) |

## 8. Lo que NO hacer

- Cablear F1/F2/F3/F4 como filtro de emisión en `operative.ts`/`build-signal.ts` (degradar a hold): destruye el rastro (cmt/scan descarta `sin_senal`, evaluate-trades filtra buy/sell) y la evidencia es 2 setups colineales con ticker (Fisher p≈0.5).
- 'Hold no vota' en compute.ts (H03 tal cual): empuja net a la banda muerta donde narrate.ts:183 libera al LLM; el sesgo real es narrativo (91/118) y la regla simétrica quita 22 hits positivos (n33).
- Reponderar pesos/K_FLOOR/G_MIN con estos datos: A3 domina el net por A2 ausente; aprendería el régimen.
- Cambiar `trend.ts` (2 swings) sin versionar: afecta a CMT, Estructura y al SSOT `directionOfA3` de calibración.
- Bajar `REACH_ATR_MULT` 5→2 como 'equivalente' de F2: convierte en hold y altera A4/signal_outcomes.
- Subir `DEFAULT_TIMEOUT_MS` global o narrar A2 inline en `/api/agents/run` (incidente 504; presupuesto 60s).
- Encender `A3_LONG_TREND_FOLLOW`, cablear `exhaustion.ts`, o leer 'solo compras +15.8R' (1 cluster BTC) como largo validado; tampoco llamar 'refutado' al corto (un régimen).
- Purgar phantom por corte de fecha (<2026-07-14): conserva 2 losses del mismo defecto y la GC=F se fabricó el 13-jul, después del fix.
- Tocar `HORIZON_WINDOW_DAYS`, `entry_type` end-to-end, la PK `(analysis_id, source)`, o mirar los outcomes de las 23 CMT / 21 QQQ pendientes para ajustar umbrales.
- Presentar cualquier tasa por fila sin su n por cluster y su tasa base.

## 9. Límites de este análisis

- Todo in-sample, un régimen, ~10 setups A3 / ~13 clusters CMT / ~6 eventos; no se puede distinguir 'regla mala' de 'mercado en contra' salvo para artefactos de medición (phantom, dedup, timeout), que son independientes del régimen.
- Definición de cluster (gap ≤3–4d, ±1%) elegida a posteriori; con 102 filas el n efectivo oscila entre ~6 y ~13 según la definición. Fijarla antes de aplicarla a datos nuevos.
- Umbral de hit reconstruido (max(2%, ATR%)) con fallback 2% cuando falta ATR; precio de referencia CMT reconstruido desde `rango_52s` (error ≤0.1%); ATR CMT ≈ |stop−nivel|.
- 'cron' identificado por hora UTC 21–22 (332 filas); el corte no es exacto si hubo runs manuales a esa hora.
- Coste del reintento SDK sobre timeout no verificable desde la BD; tokens_used no separa modelo.
- El comentario de H02 sobre `todayISODate()` y el fallback stale de macro.ts:257-263 se aceptan de la lente de código; no re-leído aquí.
- sma200 NULL en las 5 ganadas BTC-may: F1 las deja 'indeterminadas', no 'conservadas'.
- El universo CRASHED del harness no incluye deslistados a cero (requiere CRSP): el test del corto seguirá siendo optimista; declararlo en ADR-0006.
- Consultas ejecutadas para este informe: 4 SELECT (clase/fin de semana/Estructura/usuarios; tokens y latencia por fuente; frescura de crons y pendientes). No se modificó ningún fichero.

---

## Anexo A · Análisis de las operativas A3 (analista SQL, in-sample)

Análisis IN-SAMPLE de las 70 operativas A3 evaluadas (trade_outcomes.source='a3') + 21 pendientes (QQQ sell·posicional, 13-jul→3-ago, maduran a 120d) + 17 intradía no evaluables (AMZN 1, GC=F 16). Periodo may–ago 2026, UN solo régimen (oro, SPY y BTC al alza en agosto). Campos leídos de agents/shared/types.ts (A3Output.operativa.{signal,entrada,stop_loss,target,atr_actual,ratio_riesgo_beneficio,horizonte,entry_type}, tendencia.{primaria,secundaria,fuerza}, medias.{sma50,sma200}, osciladores.rsi14, rango_52s.posicion_pct, mtf.alignment) y de agents/a3/compute/operative.ts (stop = nivel ± 1·ATR en entradas limit; en market el stop es nivel±ATR con entrada al precio actual; horizonte por K=|target−entrada|/ATR, K² barras).

HALLAZGOS PRINCIPALES

1) n EFECTIVO. Las 70 filas son 17 grupos exactos (ticker, dirección, tipo de entrada, nivel, target) y solo ~10 setups independientes (GC=F comparte la resistencia 4248.83 en sus 4 variantes de target; SPY comparte el target 677.59 en sus 3 variantes; los 12 no_fill de BTC son el mismo nivel 69280.53 con 2 targets). Además el cron corre en días sin mercado y repite la vela: SPY 20 filas → 13 precios distintos, GC=F 22 → 20, AAPL 3 → 2 (una de ellas duplicada por dos usuarios el mismo día). Resultado por setup: 2 ganan (ambos BTC), 7 pierden, 1 no_fill. El "13.8% de acierto" real es 2 de 9 setups rellenados (anecdótico).

2) UN SOLO EVENTO DE MERCADO. 46 de las 50 pérdidas se resolvieron entre el 4 y el 7 de agosto de 2026 (SPY 20 el 04-ago; GC=F 22 el 06/07-ago; PA=F 07-ago; PL=F 04-ago; XRP-jul 06-ago). Las otras 4: AAPL 3 el 06-jul y XRP-may el 27-may. Las posiciones de oro se mantuvieron 36–44 días (≈−2.3% al stop) y las de SPY de finales de julio saltaron en 2–7 días. Es un shock de rally simultáneo en oro+metales+índices, no 50 decisiones independientes. Distinguir "regla mala" de "mercado en contra": el sesgo del sistema hacia cortos (101 sell vs 7 buy en 489 análisis; GC=F 0 buys en 102 filas; SPY/QQQ 0 buys) es lo que expuso a ese evento.

3) ¿Cortos contra la SMA200? Entre las 47 pérdidas con SMA200 disponible: 23 con precio > SMA200 (SPY 20 +6..+8.7%, AAPL 3 +4.5..+7.2%) y 24 con precio < SMA200 (GC=F 22 −7..−11%, PA=F, PL=F). No separa in-sample: los cortos "a favor" de la SMA200 (oro) perdieron igual que los "en contra" (SPY). Lo que sí es estructural: A3 etiqueta tendencia primaria "bajista" con precio por encima de la SMA200 en SPY 28/43 filas, QQQ 25/44 y AAPL 6/6 (retrocesos dentro de tendencia alcista leídos como tendencia bajista por HH/HL), y las 21 QQQ pendientes son todas cortos con precio +4.9..+12.6% sobre la SMA200, R/B 10, target −21%.

4) ¿Stops demasiado cerca? Por construcción, toda entrada limit tiene el stop a exactamente 1.00 ATR del nivel (40 de las 50 pérdidas y 3 de las 8 ganadas); las market van 1.39–2.20 ATR. Media: ganadas 1.60 ATR vs perdidas 1.11 ATR. Pero las pérdidas de oro tardaron 36–44 días en saltar y el precio siguió subiendo (signal_outcomes 30d de GC=F: 0/38 aciertos, +5.6% medio en contra), así que un stop más ancho solo habría perdido más R en $; no es un problema de anchura sino de dirección/régimen. Las ganadas BTC-mayo (market, stop 1.5–2.2 ATR) sí tenían más colchón, n=5, un setup.

5) Los 12 no_fill de BTC: un solo setup (limit sell en 69280.53, 4-9 jul, precio 2.35–3.34 ATR por debajo, 2 targets 62605/57911). El precio nunca subió hasta el nivel en la ventana de 30d; ese mismo nivel 69280.53 fue el TARGET del cluster comprador ganador de BTC (limit buy 62396.39, 20-26 jul, resuelto 18-ago). Los 3 buys de BTC ganaron con A4 positivo·media pero kappa=0 y actionable 11–13% (los valores más bajos de la muestra): la confianza accionable de A4 no discriminó.

6) Las 5 ganadas de BTC-mayo son de una versión anterior del compute (sin osciladores, sin SMA200/rango_52s, ventana corta, timeframes 1D+4H): la evidencia favorable proviene en parte de código que ya no está en producción.

7) Horizonte posicional: 0W/37L (4 setups: GC=F, SPY, AAPL, PA=F). Nace de targets a 7–10 ATR (R/B 8–10, target del oro a 3292 = −22%). Ningún swing tuvo target > 6.4 ATR. Pantallas in-sample con 0 ganadas: sell & precio>SMA200 (0/23), sell & RSI<45 (0/25, vender oro en sobreventa), sell & rango_52s>80% (0/19, cortos en máximos SPY), mtf null (0/23 = SPY+AAPL, confundido con ticker), fuerza≤2 (0/7), limit con distancia >2 ATR (0W/16L/12NF). Todas las pantallas coinciden con 1–2 setups: cualquier "regla" elegida aquí es p-hacking sobre 10 eventos hasta que se valide fuera de muestra (ADR-004/005). A2 null no separa (7/8 ganadas y 35/50 perdidas tenían A2 null).

Conclusión honesta: no hay una variable de A3 que separe ganadas de perdidas más allá de "era BTC" y "no se cerró en la semana del 4-7 de agosto". Las candidatas más defendibles como GATES de exposición (no como señal) son: contar n por setup y no por fila; no presentar como operativa un corto con precio > SMA200 y tendencia mayor alcista; y tratar "posicional" con target > ~6 ATR como no-operativo. Nada de esto se debe etiquetar como tradeable ni activar A3_LONG_TREND_FOLLOW.

## T1 · Resumen por dirección · horizonte · tipo de entrada (trade_outcomes, source=a3, n=70)

| dir | horizonte | entry | W | L | no_fill | ΣR |
|---|---|---|---|---|---|---|
| buy | swing | limit | 3 | 1 | 0 | +11.2 |
| buy | swing | market | 0 | 2 | 0 | −2.0 |
| sell | swing | market | 5 | 0 | 0 | +15.4 |
| sell | swing | limit | 0 | 10 | 12 | −10.0 |
| sell | posicional | limit | 0 | 29 | 0 | −29.0 |
| sell | posicional | market | 0 | 8 | 0 | −8.0 |
| **total** | | | **8** | **50** | **12** | **−22.5** |

## T2 · Clusters (mismo ticker·dirección·entry·nivel·target) — n efectivo

| ticker | dir | entry | nivel | target | filas | días | precios≠ | desde→hasta | W/L/NF | ΣR |
|---|---|---|---|---|---|---|---|---|---|---|
| AAPL | sell | limit | 302.81 | 266.07 | 3 | 2 | 2 | 06-30→07-01 | 0/3/0 | −3 |
| BTC | sell | market | — | 65682.23 | 5 | 4 | 5 | 05-21→05-26 | 5/0/0 | +15.4 |
| BTC | sell | limit | 69280.53 | 62605.52 | 8 | 5 | 8 | 07-04→07-09 | 0/0/8 | — |
| BTC | sell | limit | 69280.53 | 57911.84 | 4 | 2 | 4 | 07-08→07-09 | 0/0/4 | — |
| BTC | buy | limit | 62396.39 | 69280.53 | 3 | 3 | 3 | 07-20→07-26 | 3/0/0 | +12.2 |
| GC=F | sell | limit | 4248.83 | 4027.4 | 6 | 4 | 6 | 06-23→07-21 | 0/6/0 | −6 |
| GC=F | sell | limit | 4248.83 | 3284.72 | 1 | 1 | 1 | 06-24 | 0/1/0 | −1 |
| GC=F | sell | limit | 4248.83 | 3292.45 | 8 | 7 | 6 | 06-25→07-01 | 0/8/0 | −8 |
| GC=F | sell | limit | 4248.83 | 3962.9 | 7 | 6 | 7 | 07-13→07-20 | 0/7/0 | −7 |
| PA=F | sell | limit | 1357.95 | 1105.7 | 1 | 1 | 1 | 06-28 | 0/1/0 | −1 |
| PL=F | sell | limit | 1672.05 | 1529.5 | 1 | 1 | 1 | 07-09 | 0/1/0 | −1 |
| SPY | sell | limit | 758.54 | 677.59 | 8 | 8 | 5 | 06-22→07-08 | 0/8/0 | −8 |
| SPY | sell | market | — | 677.59 | 8 | 8 | 5 | 07-06→08-02 | 0/8/0 | −8 |
| SPY | sell | limit | 752.84 | 677.59 | 4 | 4 | 3 | 07-28→07-31 | 0/4/0 | −4 |
| XRP | buy | market | — | 1.46 | 1 | 1 | 1 | 05-23 | 0/1/0 | −1 |
| XRP | buy | limit | 1.06 | 1.18 | 1 | 1 | 1 | 07-11 | 0/1/0 | −1 |
| XRP | buy | market | — | 1.18 | 1 | 1 | 1 | 07-13 | 0/1/0 | −1 |

17 grupos exactos → **~10 setups independientes** (GC=F 1, SPY 1, BTC 3, AAPL 1, XRP 2, PA 1, PL 1). Por setup: **2 W / 7 L / 1 NF**.

## T3 · Ganadas vs perdidas vs no_fill — rasgos en el momento de la señal

| rasgo | win (n=8) | loss (n=50) | no_fill (n=12) |
|---|---|---|---|
| dist stop (ATR) media [min–max] | 1.60 [1.00–2.20] | 1.11 [0.98–2.12] | 1.00 |
| dist entrada−precio (ATR) media | 0.60 | 1.53 | 2.94 |
| dist target (ATR) media | 5.20 | 6.47 | 3.85 |
| sell con precio > SMA200 / < SMA200 / null | 0 / 0 / 5 | 23 / 24 / 0 | 0 / 12 / 0 |
| RSI14 medio (n con RSI) | 54.8 (3) | 45.1 (49) | 49.3 (12) |
| rango 52s medio (%) | 16.8 | 57.6 | 9.4 |
| fuerza media | 3.25 | 2.92 | 4.00 |
| confianza A3 media | 82.5 | 87.3 | 83.8 |
| mtf conf/neu/div/null | 1/6/1/0 | 11/10/6/23 | 3/6/3/0 |
| market / limit | 5 / 3 | 10 / 40 | 0 / 12 |
| A2 null | 7 | 35 | 3 |
| A4 confianza media | 7 | 33 | 11 |
| kappa media · actionable media | 0.00 · 12.3 | 0.26 · 22.3 | 0.38 · 27.2 |
| resolved_days media [min–max] | 16 [7–29] | 25.5 [2–44] | — |

## T4 · Fechas de resolución (todas las pérdidas ⇒ un evento)

| ticker | dir | outcome | n | resolución |
|---|---|---|---|---|
| SPY | sell | loss | 20 | 2026-08-04 |
| GC=F | sell | loss | 22 | 2026-08-06/07 |
| PA=F | sell | loss | 1 | 2026-08-07 |
| PL=F | sell | loss | 1 | 2026-08-04 |
| XRP (jul) | buy | loss | 2 | 2026-08-06 |
| AAPL | sell | loss | 3 | 2026-07-06 |
| XRP (may) | buy | loss | 1 | 2026-05-27 |
| BTC (may) | sell | win | 5 | 2026-06-02/03 |
| BTC (jul) | buy | win | 3 | 2026-08-18 |

## T5 · Pantallas in-sample (filas con outcome win/loss, n=58)

| pantalla | n | W | ΣR | setups afectados |
|---|---|---|---|---|
| sell & precio > SMA200 | 23 | 0 | −23 | SPY, AAPL |
| sell & precio < SMA200 | 24 | 0 | −24 | GC=F, PA, PL |
| sell & SMA200 null (compute antiguo) | 5 | 5 | +15.4 | BTC-may |
| sell & RSI<45 | 25 | 0 | −25 | GC=F, PA, PL, AAPL |
| sell & rango52s>80 | 19 | 0 | −19 | SPY |
| entry market | 15 | 5 | +5.4 | BTC-may, SPY, XRP |
| entry limit | 43 | 3 | −27.8 | resto |
| mtf null (sin intradía) | 23 | 0 | −23 | SPY, AAPL |
| mtf confirmed | 12 | 1 | −8.1 | GC=F, BTC |
| fuerza ≥4 | 12 | 2 | −3.1 | GC=F, BTC, XRP |
| fuerza ≤2 | 7 | 0 | −7 | SPY-jul |
| ticker = BTC | 8 | 8 | +27.5 | 2 setups |
| ticker ≠ BTC | 50 | 0 | −50 | 7 setups |

## T6 · Pendientes de madurar (sin fila en trade_outcomes)

| grupo | n | detalle |
|---|---|---|
| QQQ sell·posicional·limit 746.29 → 591.63 | 21 | 13-jul→03-ago, precio +4.9..+12.6% sobre SMA200, R/B 10.1–10.9, tendencia 'bajista' fuerza 1–3, A2 null 21/21; signal_outcomes 30d 0/21 hits (+3.3%) |
| GC=F sell·intradía·limit 4248.83 → 4027.4 | 16 | 07-jul→14-jul, no evaluable por diseño |
| AMZN buy·intradía·limit 223.37 | 1 | 24-jul, no evaluable |

## T7 · Sesgo direccional del compute (analyses_log, por ticker)

| ticker | filas | sells | buys | primaria bajista | primaria alcista | bajista & precio>SMA200 / con SMA200 |
|---|---|---|---|---|---|---|
| BTC | 134 | 17 | 3 | 81 | 34 | 0 / 86 |
| GC=F | 102 | 38 | 0 | 89 | 0 | 0 / 57 |
| QQQ | 79 | 21 | 0 | 29 | 28 | 25 / 44 |
| SPY | 73 | 20 | 0 | 32 | 27 | 28 / 43 |
| AAPL | 9 | 3 | 0 | 6 | 1 | 6 / 6 |

### Reglas candidatas derivadas de este análisis

- **Contar n por SETUP (ticker, dirección, nivel de entrada/target) y no por fila; excluir filas del cron generadas en días sin vela nueva (mismo initial_price que la fila anterior del ticker). Métrica de track record y calibración sobre setups deduplicados.**
  - Predicado: `-- fila representativa por setup: SELECT DISTINCT ON (a.ticker, t.direction, COALESCE(a.a3_output->'operativa'->>'entrada',''), a.a3_output->'operativa'->>'target') t.* FROM trade_outcomes t JOIN analyses_log a ON a.id=t.analysis_id WHERE t.source='a3' ORDER BY a.ticker, t.direction, 3, 4, a.created_at`
  - Efecto esperado: 70 filas → 17 grupos exactos (~10 setups). 8W/50L (13.8%) pasa a 2W/7L por setup. No cambia ningún resultado, cambia la honestidad del n. Sin riesgo de p-hacking: es de-duplicación, no selección.
- **No presentar como operativa (degradar a 'hold' informativo) un corto A3 cuando el precio está por encima de la SMA200 (tendencia mayor alcista), con independencia de la etiqueta 'bajista' del detector HH/HL. Gate de exposición, no señal.**
  - Predicado: `a3_output->'operativa'->>'signal'='sell' AND (a3_output->'medias'->>'sma200') IS NOT NULL AND initial_price > (a3_output->'medias'->>'sma200')::numeric`
  - Efecto esperado: In-sample: elimina 23 pérdidas (SPY 20, AAPL 3; −23R) y 0 ganadas; dejaría fuera también las 21 QQQ pendientes. NO toca las 24 pérdidas del oro (que iban a favor de la SMA200). Justificación a priori (no operar contra tendencia mayor), 2 setups de evidencia: requiere validación fuera de muestra (scripts/multiregime-backtest.test.ts) antes de cablear.
- **Tratar horizonte 'posicional' con target a más de ~6 ATR como plan no operativo (mostrar niveles pero sin R/B ni 'operativa'), manteniendo HORIZON_WINDOW_DAYS intacto para las filas ya evaluadas.**
  - Predicado: `a3_output->'operativa'->>'signal' IN ('buy','sell') AND abs((a3_output->'operativa'->>'target')::numeric - (a3_output->'operativa'->>'entrada')::numeric) / (a3_output->'operativa'->>'atr_actual')::numeric > 6.5`
  - Efecto esperado: In-sample: 0W/~35L eliminadas (4 setups: GC=F targets 3292/3284, SPY 677.59, AAPL, PA=F) y 0 ganadas (máx target ganado 6.4 ATR). Confundido con 'cortos en el rally de agosto'; el umbral 6.5 está elegido mirando la muestra → solo hipótesis pre-registrable.
- **Marcar como 'esperando' (no operativa activa) los planes limit cuya entrada está a más de 2 ATR del precio; re-evaluar solo cuando el precio se acerque (<1.5 ATR).**
  - Predicado: `a3_output->'operativa'->>'entry_type'='limit' AND abs((a3_output->'operativa'->>'entrada')::numeric - initial_price) / (a3_output->'operativa'->>'atr_actual')::numeric > 2`
  - Efecto esperado: In-sample: 0W / 16L / 12 no_fill afectadas (ganadas tenían distancia ≤1.70 ATR). Reduce no_fills fantasma y el ruido de señales repetidas mientras el nivel no se acerca; no crea edge. Verificar contra REACH_ATR_MULT en agents/a3/compute/operative.ts antes de proponer un cambio.
- **No emitir corto A3 con RSI14 < 45 (vender en sobreventa) — SOLO como hipótesis pre-registrada para validación fuera de muestra, no para producción.**
  - Predicado: `a3_output->'operativa'->>'signal'='sell' AND (a3_output->'osciladores'->>'rsi14')::numeric < 45`
  - Efecto esperado: In-sample 0W/25L (−25R), pero es esencialmente el setup del oro (GC=F 22 + PA + PL + AAPL 1). Un setup no es evidencia; incluirla en el gate multi-régimen y descartarla si no replica.

---

## Anexo B · Huecos detectados por el crítico de completitud

- Cifra 'A2 null en el 100% de las filas del cron' (contexto D) contradice el dato: cron (h 21-22 UTC) = 332 filas, 288 sin A2 (86.7%), 44 con A2 (hits de caché escritos por usuarios manuales el mismo día); el heurístico 21:25-21:59 de los hallazgos (82/99) infra-cuenta el cron porque el scan dura >35 min.
- Track record CMT 'honesto' aparece con tres cifras distintas: 6W/42L −23.4R (hallazgos, 12 phantom), 6W/44L −25.4R (H01, 11 phantom por corte de fecha), 13 filas NULL/limit→market en total; la definición de 'phantom' no está fijada (11/12/13) y el corte por fecha conserva 2 losses del mismo defecto.
- Contexto C dice 119 señales CMT / 102 evaluadas; la tabla real hoy es 125 señales (29 emitidas desde el 04-ago, 23 sin evaluar): el CMT sigue acumulando muestra fuera de muestra a ~1 señal/día sin crédito LLM, y nadie lo trata como el único OOS disponible.
- Todas las ganadas de cortos del sistema son no reproducibles con el código actual: 5 BTC-may A3 (compute sin osciladores/SMA200) + 9 BTC CMT phantom + 2 GC=F CMT phantom. Con el compute vigente y fills reales solo existe UN setup ganador (BTC compra límite 62396→69280, jul: 3 filas A3 + 4 CMT). Ninguna hipótesis lo dice explícitamente.
- Perfil por clase de activo (agents/a3/profiles.ts: proximity_pct, MIN_RB, level_tolerance) no aparece como palanca en ningún hallazgo; por clase: commodity 40 sells/0 buys (108 filas), index_etf 41/0 (152), crypto 17/6 (187), equity 3/1 (42); outcomes rellenados: crypto 8W/3L, commodity 0/24, index_etf 0/20 (+21 QQQ pendientes), equity 0/3. 'Ningún corto en index_etf/commodity' es el baseline trivial que cualquier gate (H04/H06) debe batir y no se calcula.
- Fin de semana: 151/489 filas (31%) nacen en sábado/domingo (95 del cron; 59 de ellas en tickers no-crypto con vela repetida). Skip de no-crypto en fin de semana en watchlist-scan y cmt/scan es una palanca de n/ruido/coste no considerada (solo se menciona como dedup ex post).
- Estructura: estructura_output NULL en 489/489 filas y trade_outcomes source='estructura' = 0 en todas las clases y usuarios: el 4º agente nunca ha persistido en producción; no hay hipótesis ni verificación de si el toggle opt-in está roto o simplemente sin uso.
- Recarga de crédito Anthropic: prerrequisito absoluto de H02/H03/H08 (0 filas en analyses_log desde 2026-08-03; a2_cache última escritura 2026-07-31) tratado como nota al pie. Coste medido: ~10.2k tokens/análisis (4.98M tokens en 489 filas), cron 4.4 filas/día ≈ 44k tokens/día; el fix del timeout convierte 2 intentos fallidos de Sonnet en 1 útil (coste del reintento no cuantificable desde la BD).
- 'HIPOTESIS QUE SOBREVIVEN' está vacío pero varias reformulaciones (purga phantom, dedup por cluster, tasa base por ticker, timeout A2 en cron, shadow tags) no tienen riesgo estadístico ni ADR: el pipeline confundió 'refutada tal cual' con 'nada que hacer'.
- Semántica de 'urgente' en CMT (build-signal.ts:96-107): equivale a 'venta a mercado con R/B≥2.5' y va 0/11 in-sample; ninguna hipótesis propone reparar la etiqueta (es un defecto de presentación, no de edge) aunque 7 urgente nuevas (SPY 4-8 sep, GC=F 10-sep) están pendientes y el radar las muestra como prioridad.
- Sesgo narrativo de A4: 91/118 negativos-con-hold tienen net_pct NULL o |net|<G_MIN, es decir, la dirección la puso Haiku (narrate.ts:181-183 deja libre al LLM en banda muerta), no compute.ts; el 'origen del sesgo' del mapa (directionOfA3) explica ≤27/118. Solo H03-fix lo señala; no está cuantificado para positivos ni en filas v2.
- Contradicción de mecanismo A2: mapa área 2 afirma que macro_as_of 'rota casi a diario' y que el pre-warm de las 11:00 caduca; H02 verifica que as_of = todayISODate() (macro.ts:100,125) y que el problema es que a2-reconcile apenas escribe (34 filas a las 11h en ~36 días, timeout 30s también insuficiente). El comentario 'P99 26-28s' de a2/narrate.ts:83 es falso: a 25s falla 257/260 (P50).
- n<20 sin etiquetar: positivo·media 70% (n20), positivo·baja 57.7% (n26), A2 presente & positivo 80% (n10), kappa≥0.6 40% (n5), solo compras CMT +15.8R (1 cluster): el contexto B los presenta al mismo nivel que celdas n>100.
- Riesgo ADR ignorado en el mapa: 'degradar a hold' (H04/H06) borra el rastro de datos (cmt/scan descarta sin_senal; evaluate-trades filtra buy/sell) → el gate se vuelve no auditable; solo los fixes de H04 lo corrigen (shadow tag). Y trend.ts (2 swings) alimenta Estructura y CMT: cambiarlo sin versionar rompe comparabilidad de signal_outcomes.
- Horizonte 'intradia': 17 operativas A3 (GC=F 16, AMZN 1) nunca evaluadas por diseño, pero se muestran como operativas con R/B en la card; no hay hipótesis sobre ocultarlas o evaluarlas con 4H.
- 21 QQQ sell·posicional pendientes maduran a 120d entre el 10-nov y el 1-dic-2026 y son 1 setup (nivel 746.29, target 591.63): ninguna hipótesis fija por escrito que se contarán como n=1 antes de ver el resultado.

## Anexo C · Preguntas abiertas para el owner

- Fecha de recarga del credito Anthropic: sin ella no hay T3 y el holdout no puede empezar (0 filas LLM desde 2026-08-03).
- Estructura: el toggle opt-in nunca ha persistido (0/489). Esta roto el path run-provider -> consolidateAndPersistA4 o nadie lo activa? Decide si se mantiene su leg en evaluate-trades.
- Definicion unica de cluster/setup (gap 3 o 4 dias, tolerancia ±1%) que fijara el owner antes de aplicarla a datos nuevos y documentar en ADR-003.
- Migracion de higiene R2: delete+reinsert de las 13 filas phantom o columna eval_version? Requiere aprobacion del owner (skill supabase-migration) y regeneracion de tipos.
- Debe el cron dejar de correr en fin de semana para no-crypto (F5/R13) o basta la dedup ex post? Afecta a filas/dia y al coste.
- Postura de producto mientras no haya validacion OOS: seguir mostrando operativas sell con R/B en la card/radar (educativo con disclaimer) o etiquetar 'sin validar' en la UI? Decision del owner (ADR-005), no estadistica.
- Coste real del reintento SDK sobre timeout de Sonnet (se factura el intento abortado?): no verificable desde la BD; comprobar en la consola de Anthropic.
- Lista mecanica de 'techos colapsados' para el universo corto del harness (regla de drawdown documentada) y aceptacion explicita de que sin CRSP el test del corto sigue siendo optimista.

## Anexo D · Listas de una línea

### Descartar
- Track record CMT +7.9R (17W/44L, n63): 11-13 fills fantasma sin toque real del nivel; honesto 6W/44L -25.4R (n52), 2 clusters ganadores.
- kappa y actionable_pct como filtro de emision: kappa>=0.3 -> 18.4% (n103) < base 34.0%; no discriminan in-sample.
- Filtros CMT 'R/B>=2' (4W/42L -26.7R) y 'solo market' (2W/10L): empeoran y eliminan las unicas ventas ganadoras honestas.
- 'urgente' como senal de calidad: es venta a mercado en SPY con R/B>=2.5, 0W/11L (2 clusters, 1 evento).
- Reponderar A4 / K_FLOOR / G_MIN con estos datos: A3 domina el net por A2 ausente (342/489); aprenderia 'no ir corto en 2026'.
- Mover a2-reconcile a 20:45 como fix: macro_as_of = todayISODate(), no rota intradia; el fallo es narrar a 30s (34 filas warm en ~36 dias).
- Pre-warm A2 dentro del lambda de watchlist-scan: ya a ~255s de 300s sin presupuesto de tiempo.
- Las 5 ganadas BTC-mayo como evidencia del corto: compute retirado (sin osciladores/SMA200); con el codigo actual solo hay 1 setup ganador (BTC compra jul).
- Tasas por fila (70 A3 / 102 CMT / 482 A4) sin n por cluster ni tasa base: ~7-8x infladas.

### Filtrar (solo como shadow tag hasta validación fuera de muestra)
- F1 shadow tag 'veto_regimen' (sell & precio > SMA200): in-sample veta 0W/23L = 2 setups (SPY, AAPL), no toca 0/24 del oro; solo marca persistida, filtro de presentacion detras de flag OFF; debe batir 'ningun corto en index_etf'.
- F1' espejo obligatorio (buy & precio < SMA200): in-sample mataria BTC buy 3/3 y CMT 4/4; si el espejo destruye el largo OOS, la justificacion 'tendencia mayor' queda falsada.
- F2 limite a >2 ATR = 'esperando' (campo nullable+optional en ambos schemas, signal se mantiene): excl 0W/16L/12NF A3 y 0W/17L/26NF CMT; efecto R esperado 0, objetivo fill-rate; umbral solo conserva 8/8 ganadas en [1.71,2.12] ATR -> pre-registrar sensibilidad 1.5/2/3.
- F3 coherencia target<->ventana CMT con K > sqrt(30)=5.48 (constante del codigo, no elegida): 26/26 senales R/B>=10 son no_fill; A3 posicional K>sqrt(120) no afecta hoy a nadie.
- F4 no 'negativo' con A2 risk_on (53 filas, 3.8% acierto; global 34.0 -> 37.8% n429): A2 nunca emitio risk_off, equivale a 'no ir contra el macro en mercado alcista'; solo hipotesis pre-registrable.
- F5 skip de tickers no-crypto en sab/dom en watchlist-scan y cmt/scan: 59 filas cron con vela repetida (de 95 en fin de semana), ~13k tokens/dia; no cambia decisiones.
- Comparador honesto de todo gate: 'ningun corto en commodity/index_etf' elimina in-sample 0W/44L (+21 QQQ pendientes).

### Reparar
- lib/backtest/signal-plan.ts:57: entry_type NULL nunca degrada a 'market' -> plan null -> not_evaluable.
- Migracion aprobada: eval_version o delete+reinsert de las 13 filas signal_trade_outcomes con o.entry_type='market' AND s.entry_type IS DISTINCT FROM 'market'; re-evaluar con fill por toque (evaluate-signal-trades:70-78 hoy nunca reevalua).
- app/api/cmt/scan/route.ts:73-97: dedup por (user_id, ticker, direccion, entry±1%, target) mientras exista senal sin outcome <30d; no tocar GET /api/signals, ack ni .in() del radar.
- agents/pipeline.ts:225 + lib/pipeline-runner.ts:100: a2TimeoutMs (45_000) solo para narrateA2 en el cron; DEFAULT_TIMEOUT_MS y /run intactos.
- app/api/cron/a2-reconcile/route.ts:103,158: 30_000 -> 45_000 y persistir warmed/backfilled; corregir comentario 'P99 26-28s' de agents/a2/narrate.ts:83 (a 25s falla 257/260).
- app/api/cron/watchlist-scan/route.ts:102-121: TIME_BUDGET_MS ~240s + log de corte.
- agents/a4/narrate.ts:181-183: mandar neutral cuando |net|<G_MIN o loguear direccion_narrada vs mandada (91/118 negativos-hold son narrativos); versionar schema_version=3.
- agents/a4/narrate.ts:164-173: persistir confianza_derivada = levelFromScore(actionable_pct) junto a la narrada, sin sustituir.
- app/api/metrics/calibration/route.ts + components/signals/helpers.ts + app/api/signals/route.ts: tasa base por ticker (max(2%, ATR%)) y n por cluster junto al hit; documentar horizonte [h,h+1) en evaluate-signals:48-58.
- agents/cmt/build-signal.ts:96-107: nivel por tipo de entrada/alcanzabilidad, no como prioridad de calidad.
- agents/a3/compute/operative.ts:53-79 + compute.ts:95,135-147: pasar sma200 y emitir operativa.veto_regimen nullable+optional en agents/a3/schema.ts Y agents/shared/types.ts (merge por codigo, nunca al prompt).
- Verificar por que estructura_output es NULL en 489/489 (run-provider -> /api/agents/a4 consolidateAndPersistA4) antes de invertir en su leg.
- vercel.json / watchlist-scan / cmt/scan: no correr tickers no-crypto en sab/dom (151/489 filas en fin de semana).
- Recargar credito Anthropic (0 filas LLM desde 03-ago; a2_cache ultima escritura 31-jul); presupuesto medido ~10.2k tokens/analisis, cron ~44k tokens/dia.

### Validar
- ADR-0006 escrito y commiteado con hash de umbrales ANTES de correr; declarar F1/F2/F3 como hipotesis post-hoc cuya primera prueba OOS es el harness; muestra live may-ago 2026 vetada como test.
- Extender scripts/multiregime-backtest.test.ts a sell (post-filtros en scripts/, sin tocar operative.ts; K_TARGET no existe), dos pasadas (sell con A3_LONG_TREND_FOLLOW OFF, buy con stub), corregir truncacion H2=63 < WIN posicional 120.
- Metricas del harness: R por plan emitido y por rellenado, exceso vs buy&hold(-corto) y vs SPY, doble-null, N efectivo ticker x trimestre, IC bootstrap por bloque temporal x ticker, JSON versionado en scripts/out/.
- Sanity previo: reproducir +0.077R gross / +0.031R neto@10/40 (±0.01) en buy antes de leer sell.
- Un test primario (neto@20/80 de F1 U F3 en des-sesgado, IC excluye 0); resto exploratorio con Holm; conservar como candidato solo si no empeora bull/bear/lateral por debajo de -0.05R y supera 'ningun corto' y 'ningun corto en index_etf'; aprobar != tradeable (paper-trading forward).
- Forward holdout tras R4/R5 + recarga: test unico de no-inferioridad hit@30d por cluster vs constante del ticker fijada ahora; potencia declarada (~120 clusters/trimestre detecta Delta>=18pt); regimen etiquetado por fila; A2 presente/ausente solo dentro de filas cron; dedup por calendario bursatil por asset_type.
- OOS en curso sin mirar: 23 senales CMT pendientes (7 urgente) y 21 QQQ sell·posicional (maduran 10-nov -> 1-dic-2026), contadas como 1 setup cada grupo.
