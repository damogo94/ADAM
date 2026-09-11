# ADR-006 — Gates de exposición para cortos (F1/F2/F3): pre-registro del test multi-régimen

Fecha: 2026-09-11 · Estado: Aceptado (pre-registro; **escrito y commiteado ANTES de correr el harness**)
· Depende de: ADR-004 (barra de validación), ADR-005 (aprobar ≠ tradeable) · Origen: `docs/ADAM_PLAN_PRECISION_2026-09.md` §4 (FILTRAR), §6 (V1), §8 (NO hacer)

## Contexto

El plan de precisión del 2026-09-11 (tanda T2) pide validar **fuera de muestra** tres gates de exposición para el
lado corto de A3 que nacieron mirando la muestra live may–ago 2026 (`trade_outcomes`, 70 filas ≈ 10 setups, un
solo régimen, 46/50 pérdidas resueltas en el rally del 4–7 de agosto). Ese origen es el punto central de este ADR:

- **F1, F2 y F3 son hipótesis POST-HOC.** Sus predicados y umbrales se eligieron viendo qué separaba ganadas de
  perdidas en ~10 setups colineales con ticker (SPY/AAPL vs GC=F vs BTC). In-sample "funcionan" por construcción.
- **La muestra live may–ago 2026 queda VETADA como test.** No se usará ni para confirmar ni para calibrar; su
  única función fue generar las hipótesis. Cualquier cifra de esa muestra que aparezca en un informe de validación
  es un error metodológico.
- **Esta corrida del harness es el PRIMER test de F1/F2/F3, no una confirmación.** Se pre-registra aquí todo lo
  que podría tunearse: predicados, umbrales, universo, métrica primaria, criterio de paso, corrección múltiple y el
  sanity previo. El bloque de umbrales lleva un hash sha256 (abajo) para que la corrida sea auditable contra este
  documento.

El harness existente (`scripts/multiregime-backtest.test.ts`, ADR-004) solo evalúa la rama **buy** con el stub
experimental `A3_LONG_TREND_FOLLOW=true`; el lado corto (el que produce el 101/7 sell/buy en prod) nunca se ha
medido multi-régimen. Además tiene dos defectos de medición que este ADR corrige **antes** de leer cifras sell:

1. **Truncación de ventana** (`H2 = 63` en el bucle, l.~63/72): un plan `posicional` (ventana 120d) cerca del final
   de la serie se evaluaba con ≤63 velas forward y `windowElapsed: true`, y `evaluateTrade` (trade-eval.ts:113)
   cierra el timeout al último close → se contaban como **resueltos** planes con ventana incompleta.
2. **Rama sell inexistente** → la conclusión de ADR-004 sobre el corto se apoyaba en el "−7.6% @30d" de la etiqueta
   'bajista' (un régimen) y no en la expectativa path-dependent del plan.

## Hipótesis (predicados fijos; implementados como POST-FILTROS en `scripts/`, nunca en `agents/`)

Todas operan sobre la salida de `computeTechnical()` (`out.operativa`, `out.medias.sma200`, precio = último close
de la ventana). **Ningún gate se cablea en `operative.ts`/`build-signal.ts` ni convierte una señal en tradeable**
(plan §8). Un gate "veta" = el plan se excluye del conjunto retenido; el plan sigue existiendo y se reporta.

| Gate | Predicado (veta si…) | Indeterminado | Sensibilidad pre-fijada |
|---|---|---|---|
| **F1** veto de régimen | `signal='sell' AND precio > sma200` | `sma200 == null` → no veta, se reporta como indeterminado | ninguna (umbral = la propia SMA200) |
| **F1'** espejo obligatorio | `signal='buy' AND precio < sma200` | idem | Si el espejo destruye el largo, la justificación "no operar contra la tendencia mayor" queda falsada (plan §4) |
| **F2** límite lejano = 'esperando' | `entry_type='limit' AND |entrada − precio| / ATR > 2` | `atr == null` o `atr ≤ 0` → no veta | umbral central **2**; se reportan también **1.5** y **3**. Efecto R esperado ≈ 0 (los no_fill ya valen 0R); el objetivo es fill-rate |
| **F3** target incoherente con la ventana | `K = |target − entrada| / ATR > √WIN[horizonte]` con `WIN = {intradia: 30, swing: 30, posicional: 120}` | `atr == null` → no veta | ninguna: la constante deriva del modelo K² barras de `horizonteFromTarget` y de `HORIZON_WINDOW_DAYS`, no se elige |

`√30 ≈ 5.48`, `√120 ≈ 10.95`. `WIN.intradia = 30` replica la convención del harness de ADR-004 (en prod intradía no
se evalúa); un plan intradía tiene por construcción K² < 7 → F3 nunca lo veta.

## Universo

- **WINNERS (17)** y **CRASHED (21)** de ADR-004, sin cambios (38 tickers).
- **COLLAPSED — techos colapsados, regla mecánica:** drawdown close-a-close **≥ 80 %** con pico y valle entre
  **2016-01-01 y 2024-12-31**, ticker **aún cotizado en Yahoo** el 2026-09-11 y ≥ 368 velas diarias. La lista
  candidata se fija abajo (en el bloque hasheado); **el harness verifica la regla sobre los datos descargados** y
  excluye (y reporta por nombre) cualquier candidato que no la cumpla. No se añaden nombres después de ver
  resultados.
- **Universo des-sesgado = WINNERS ∪ CRASHED ∪ COLLAPSED(verificados).** Es el universo del test primario.
- **Aceptación explícita del sesgo restante:** sin una base tipo CRSP no hay deslistados-a-cero. Los "techos
  colapsados" son nombres que cayeron ≥80 % **y siguen vivos**. Para el lado corto eso es un sesgo **optimista**
  (faltan precisamente los cortos que habrían ido a cero, pero también los que fueron opados/absorbidos con prima).
  Cualquier resultado positivo del corto se lee como **cota superior**, no como estimación insesgada.

## Sanity previo OBLIGATORIO (antes de leer cifras sell)

Reproducir la rama **buy** de ADR-004 (stub `A3_LONG_TREND_FOLLOW=true`, bucle legacy `i < len − 63 − 1`, ventana
truncada, universo WINNERS ∪ CRASHED, ventana de datos que termina el 2026-07-12) y obtener
**gross +0.077R y neto@10/40 +0.031R, tolerancia ±0.01R** en el universo des-sesgado de ADR-004 (N≈719).
Detalle honesto: la rejilla `i = 300, 321, …` depende de la primera vela de la ventana de 10 años y Yahoo puede
desplazarla una vela respecto a la corrida original (hora del día, vela parcial de cripto) → se prueban los
**offsets de rejilla 0 y 1** y se reportan ambos; el sanity pasa si alguno queda dentro de la tolerancia. Si
ninguno pasa, la corrida sell **se ejecuta igualmente** (los umbrales ya están fijados aquí y no se pueden tunear)
pero el JSON se marca `sanity.pass=false` y el informe no puede citar cifras sell como validación.

## Test PRIMARIO (uno, pre-fijado)

- **Conjunto:** planes **sell** de la rama con `A3_LONG_TREND_FOLLOW=OFF` (compute idéntico a prod), universo
  des-sesgado, bucle corregido (`i < len − WIN[horizonte] − 1`, ventana completa), **retenidos** tras aplicar
  **F1 ∪ F3** (se veta si F1 o F3 disparan).
- **Métrica:** media de **R neto por plan RELLENADO** con costes de estrés **20 bps (equity) / 80 bps (cripto)**
  round-trip, coste en R = `bps/1e4 · entrada / riesgo`. `no_fill` y `not_evaluable` se excluyen del denominador
  (se reportan aparte, y también la variante "por plan EMITIDO" con `no_fill = 0R`, que es descriptiva).
- **Incertidumbre:** bootstrap por **bloques ticker × trimestre** (cluster = `${ticker}:${año}Q${trimestre}` de la
  vela de emisión), **B = 2000**, semilla **20260911** (PRNG determinista), IC percentil **95 %**.
- **Pasa si:** el **límite inferior del IC 95 % es > 0**.
- **N efectivo** = número de clusters ticker×trimestre con ≥1 plan retenido. Se reporta siempre junto a N.

## Criterio de conservación (para ser "candidato a paper-trading", además del primario)

1. **No empeora ningún régimen** más de −0.05R: para cada régimen SPY ∈ {bull, bear, lateral},
   `mean_net(retenidos, régimen) − mean_net(sin gate, régimen) ≥ −0.05`.
2. **Supera "ningún corto"**: `mean_net(retenidos) > 0` (el comparador vale 0R por definición).
3. **Supera "ningún corto en index_etf/commodity"**: `mean_net(retenidos F1∪F3) > mean_net(cortos sin gate excluyendo
   clase index_etf y commodity)`, clase por `classOf(ticker)` (`agents/a3/profiles.ts`). Es el comparador trivial
   que el plan §4 exige batir: si un gate "inteligente" no supera al gate tonto por clase, no aporta.
4. **Se reportan los cortos ganadores vetados** (N, ΣR) y no solo las pérdidas evitadas.

Si falla el primario o cualquiera de 1–3 → **descartado** como candidato (se conserva como shadow tag informativo,
sin flag de presentación).

## Exploratorio (todo lo demás; corrección Holm-Bonferroni, α = 0.05)

Tests exploratorios pre-listados (p-valor one-sided por bootstrap, `(#{boot ≤ 0} + 1)/(B + 1)`), corregidos en
familia por Holm: F1 solo, F3 solo, F1' espejo en la rama buy (stub), F2@1.5, F2@2, F2@3 (métrica: Δ de R neto por
plan EMITIDO y fill-rate), F1 ∪ F2 ∪ F3, y Δ = mean_net(retenidos F1∪F3) − mean_net(sin gate) (doble-null vs la
etiqueta cruda). Desgloses descriptivos sin test: por régimen, por clase, por horizonte, por `entry_type`, y exceso
vs benchmark. Nada exploratorio puede promover un gate a candidato; solo genera hipótesis para un ADR posterior.

## Métricas reportadas (todas, por rama y por gate)

- R gross y neto @10/40 y @20/80, **por plan emitido** (`no_fill = 0R`, coste 0) y **por plan rellenado**.
- Win / loss / timeout / no_fill / not_evaluable.
- **Exceso vs buy&hold(−corto) del propio nombre**: `return_pct − dir·BH_pct(nombre, ventana)` con `dir = −1` para
  sell; y **vs SPY** (`dir·BH_pct(SPY, mismas fechas)`). Ambos calculados FUERA de A3 (en el harness; no rompe el
  aislamiento). Descriptivos.
- **N efectivo** (clusters ticker×trimestre) y N crudo; IC bootstrap por bloque.
- Régimen SPY (close vs SMA200, pendiente) en la fecha de emisión; clase de activo; horizonte.
- Sanity buy legacy (ambos offsets) con pass/fail.

## Salida versionada

`scripts/out/multiregime-2026-09-11.json` (+ `.md` resumen) con: fecha, semilla, bloque de umbrales completo y su
hash, universo, tickers usables, verificación COLLAPSED, sanity, tablas por rama, primario, conservación,
exploratorios con Holm, y una **decisión mecánica por gate** (`candidato_paper_trading` | `descartado`) derivada
solo de los criterios de arriba. Gate en CI: sigue detrás de `RUN_BACKTEST=1` (red a Yahoo, sin claves).

## Frase vinculante

**Aprobar ≠ tradeable.** Un gate que pase el primario y la conservación es *candidato a paper-trading forward*
(ADR-005, pilar 3); no enciende ningún flag de producción, no cambia la emisión de operativas, no toca
`operative.ts`, y la muestra live sigue siendo educativa con su disclaimer. **Después: paper-trading forward
(ADR-005).**

## Bloque de umbrales pre-registrado

sha256 (sobre la línea JSON compacta exacta de abajo, UTF-8, sin salto final):
`cf0876191230d3ce69180d8d05deb16c0a8049e0d264d620b16fb8fa0a8cc8d9`

```json
{"adr":"0006","version":1,"registered_at":"2026-09-11","F1":{"veto_sell_if_price_above_sma200":true,"mirror_veto_buy_if_price_below_sma200":true,"sma200_null":"indeterminado: no veta, se reporta aparte"},"F2":{"limit_max_dist_atr":2,"sensitivity_atr":[1.5,2,3],"applies_to":"entry_type=limit","atr_null":"indeterminado: no veta, se reporta aparte"},"F3":{"rule":"K = |target - entrada| / ATR > sqrt(WIN[horizonte])","window_days":{"intradia":30,"swing":30,"posicional":120}},"costs_bps_roundtrip":{"central":{"equity":10,"crypto":40},"stress":{"equity":20,"crypto":80}},"harness":{"lookback":300,"step":21,"range":"10y","legacy_h2":63,"min_candles":368,"regime_source":"SPY close vs SMA200 (bull/bear/lateral)"},"universe":{"winners":["SPY","QQQ","AAPL","MSFT","NVDA","XOM","JPM","JNJ","WMT","CAT","TLT","GLD","USO","EEM","EFA","BTC-USD","ETH-USD"],"crashed":["META","NFLX","TSLA","AMD","INTC","BABA","DIS","BA","GE","F","BAC","C","T","PFE","OXY","ARKK","MMM","SOL-USD","ADA-USD","DOGE-USD","XRP-USD"],"collapsed_rule":{"drawdown_min":0.8,"peak_and_trough_between":["2016-01-01","2024-12-31"],"still_listed_on_yahoo":true,"min_candles":368,"verified_by_harness":true},"collapsed":["PTON","ZM","TDOC","RIVN","LCID","COIN","HOOD","AMC","GME","PLUG","CVNA","OPEN","AFRM","SNAP","ROKU","BYND","UPST","NIO","PYPL","DOCU","TWLO","RUN","SEDG","CHPT","MRNA","LUMN","LUNC-USD","ICP-USD","FIL-USD","AXS-USD","SAND-USD","EOS-USD"]},"primary":{"gate":"F1 OR F3","branch":"sell (A3_LONG_TREND_FOLLOW=OFF, compute identico a prod)","universe":"des-sesgado = winners + crashed + collapsed(verificados)","metric":"media de R neto por plan RELLENADO @20/80 bps (no_fill y not_evaluable excluidos)","ci":{"method":"block bootstrap por cluster ticker x trimestre","B":2000,"seed":20260911,"level":0.95},"pass":"limite inferior del IC 95% > 0"},"conservation":{"regime_delta_min_r":-0.05,"regime_delta_def":"mean_net(gated, regimen) - mean_net(ungated, regimen) por bull/bear/lateral","must_beat":["no_shorts (0R)","no_shorts_in_index_etf_commodity (mean net de los cortos restantes)"],"report_vetoed_winners":true},"exploratory":{"correction":"Holm-Bonferroni","alpha":0.05,"p_value":"one-sided bootstrap: (#{boot <= 0} + 1) / (B + 1)","tests":["F1","F3","F1_mirror_buy","F2@1.5","F2@2","F2@3","F1 OR F2 OR F3","delta gated - ungated (F1 OR F3)"]},"sanity_buy_legacy":{"gross":0.077,"net_10_40":0.031,"tol":0.01,"window_end":"2026-07-12","grid_offsets_tried":[0,1]}}
```

Verificación: `node -e "const {createHash}=require('node:crypto');const s=require('fs').readFileSync(0,'utf8').trim();console.log(createHash('sha256').update(s,'utf8').digest('hex'))" < bloque.json`.
El mismo objeto vive en `scripts/lib/gates.ts` (`GATE_THRESHOLDS`) y su test unitario asegura que el hash coincide
con este ADR — si alguien cambia un umbral, el test rompe y el cambio exige un ADR nuevo.

## Invariantes (no romper)

- No tocar `agents/a3/compute/operative.ts` ni nada bajo `agents/` para "implementar" F1/F2/F3: son post-filtros de
  investigación (plan §8: cablearlos como filtro de emisión destruye el rastro y la evidencia es de 2 setups).
- `A3_LONG_TREND_FOLLOW` sigue OFF en prod; en el harness solo se enciende para la rama buy de sanity/exploración.
- `HORIZON_WINDOW_DAYS`, `entry_type` end-to-end, `exhaustion.ts` dormido: intactos.
- No re-correr con umbrales distintos sobre el mismo test; una segunda versión de umbrales = ADR-007 con holdout
  de régimen distinto.
- No leer los 23 CMT / 21 QQQ pendientes para ajustar nada.
