# Multi-régimen v2 · ADR-0006 · 2026-09-12

- Umbrales sha256: `cf0876191230d3ce69180d8d05deb16c0a8049e0d264d620b16fb8fa0a8cc8d9` (coincide con ADR: true)
- Tickers usables: 70 · colapsados verificados 32/32
- Planes censurados por ventana incompleta (no evaluados): {"sell_prod_and_buy_prod":26,"buy_stub":14}

## Sanity · rama buy legacy (ADR-004: +0.077R gross / +0.031R neto@10/40 ±0.01) → **PASS**

| offset | N | gross | net@10/40 | pass |
|---|---|---|---|---|
| 0 | 714 | 0.105 | 0.06 | false |
| 1 | 713 | 0.069 | 0.026 | true |

## Ramas (R por plan; rellenado y emitido)

| set | N | filled | n_eff | W/L/T/NF | fill | gross | net@10/40 | net@20/80 | IC95 net@20/80 | emit net@20/80 | exc. vs BH nombre (pp) | exc. vs BH SPY (pp) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sell_prod | 718 | 425 | 390 | 54/315/56/291 | 0.592 | -0.24 | -0.288 | -0.337 | [-0.487, -0.167] | -0.199 | 9.15 | 2.31 |
| sell_prod:F1∪F3 | 403 | 197 | 187 | 26/143/28/205 | 0.489 | -0.21 | -0.261 | -0.313 | [-0.527, -0.085] | -0.153 | 9.98 | 2.67 |
| sell_prod:F1 | 407 | 199 | 189 | 26/145/28/207 | 0.489 | -0.218 | -0.27 | -0.321 | [-0.529, -0.07] | -0.157 | 9.95 | 2.67 |
| sell_prod:F3 | 696 | 408 | 374 | 54/298/56/286 | 0.586 | -0.209 | -0.256 | -0.303 | [-0.464, -0.137] | -0.178 | 9.15 | 2.27 |
| sell_prod:F1∪F2∪F3 | 139 | 93 | 91 | 17/61/15/45 | 0.669 | -0.187 | -0.228 | -0.269 | [-0.532, 0.007] | -0.18 | 4.79 | 2.26 |
| sell_prod:no_shorts_index_etf_commodity | 675 | 398 | 363 | 53/292/53/275 | 0.59 | -0.217 | -0.264 | -0.311 | [-0.467, -0.137] | -0.183 | 9.36 | 2.18 |
| buy_prod | 671 | 369 | 332 | 63/258/48/301 | 0.55 | 0.007 | -0.034 | -0.076 | [-0.263, 0.122] | -0.042 | 4.96 | -0.49 |
| buy_stub | 1427 | 1142 | 915 | 322/720/100/284 | 0.8 | 0.046 | 0.01 | -0.027 | [-0.114, 0.064] | -0.021 | -0.7 | -0.64 |
| buy_stub:F1_mirror | 1047 | 861 | 680 | 268/527/66/186 | 0.822 | 0.074 | 0.038 | 0.003 | [-0.089, 0.1] | 0.002 | -2.01 | -0.66 |
| buy_stub:winners+crashed | 920 | 725 | 577 | 203/463/59/195 | 0.788 | 0.047 | 0.003 | -0.042 | [-0.152, 0.073] | -0.033 | -1.01 | -0.38 |

## Test primario · F1 OR F3 (sell, des-sesgado, neto@20/80 rellenado) → **FALLA**

N=403 · rellenados=197 · n_eff=187 · media=-0.313R · IC95=[-0.527, -0.085] · p=0.9965

## Conservación

| régimen | N gated | N ungated | mean gated | mean ungated | Δ | ok (≥ −0.05) |
|---|---|---|---|---|---|---|
| bull | 140 | 327 | -0.219 | -0.36 | 0.142 | true |
| bear | 32 | 43 | -0.514 | -0.342 | -0.172 | false |
| lateral | 25 | 55 | -0.583 | -0.191 | -0.392 | false |

- Supera 'ningún corto' (0R): false
- Supera 'ningún corto en index_etf/commodity' (-0.311R): false
- Vetados por F1∪F3: 315 · ganadores vetados 28 (ΣR 91.91) · perdedores vetados 172 (ΣR -172)

## Exploratorio (Holm, α=0.05)

| test | métrica | N | filled | n_eff | stat | IC95 | p | p Holm | rechaza H0 |
|---|---|---|---|---|---|---|---|---|---|
| F1 | mean net@20/80 rellenado > 0 | 407 | 199 | 189 | -0.321 | [-0.529, -0.07] | 0.9945 | 1 | false |
| F3 | mean net@20/80 rellenado > 0 | 696 | 408 | 374 | -0.303 | [-0.464, -0.137] | 1 | 1 | false |
| F1_mirror_buy | Δ mean net@20/80 rellenado (buy stub retenido − sin gate) | 1047 | 861 | 680 | 0.03 | [-0.025, 0.087] | 0.1329 | 1 | false |
| F2@1.5 | Δ mean net@20/80 por plan EMITIDO (no_fill=0R) | 233 | 197 | 221 | -0.067 | [-0.205, 0.068] | 0.8426 | 1 | false |
| F2@2 | Δ mean net@20/80 por plan EMITIDO (no_fill=0R) | 320 | 249 | 297 | -0.011 | [-0.112, 0.087] | 0.5732 | 1 | false |
| F2@3 | Δ mean net@20/80 por plan EMITIDO (no_fill=0R) | 520 | 342 | 464 | 0.031 | [-0.025, 0.081] | 0.1324 | 1 | false |
| F1∪F2∪F3 | mean net@20/80 rellenado > 0 | 139 | 93 | 91 | -0.269 | [-0.532, 0.007] | 0.972 | 1 | false |
| delta gated - ungated (F1∪F3) | Δ mean net@20/80 rellenado (doble-null vs etiqueta cruda) | 403 | 197 | 187 | 0.024 | [-0.149, 0.196] | 0.3948 | 1 | false |

## Decisión mecánica · F1∪F3 → **descartado**

- primario FALLA (IC95 lo=-0.527)
- régimen bull: Δ=0.142 ok
- régimen bear: Δ=-0.172 FALLA
- régimen lateral: Δ=-0.392 FALLA
- supera 'ningún corto': false
- supera 'ningún corto en index_etf/commodity' (-0.311R): false
- sanity buy legacy: PASS

> aprobar ≠ tradeable: después, paper-trading forward (ADR-005). Cota superior: sin CRSP faltan deslistados a cero.
