# ADR-003 · Radar accionable (fusión Señales+Watchlist) + diferenciación A3/Estructura con temporalidad

- **Estado:** aceptada · implementación por fases
- **Fecha:** 2026-07
- **Contexto previo:** ADR-002 (operativa de A3 como plan de trade, `horizonte` + `entry_type`).

## Contexto

Dos problemas de producto, diagnosticados leyendo el código real:

1. **Señales y Watchlist son la misma pantalla dos veces.** Ambas listan activos por ticker con dictamen/señal/sparkline/frescura. `app/signals/page.tsx` incluso re-hace `fetch('/api/watchlist')` (línea 141) que el radar ya tiene cargado en `RadarProvider`. Duplicación de UI y de fuente de verdad por ticker.
2. **Los trades no distinguen fuente ni plazo.** En el historial no se diferencia un trade de **A3 (Gráfico)** de uno de **Estructura (MTF)**, y no se marca la temporalidad. La temporalidad *ya existe a medias*: A3 tiene el enum `TradingHorizon` (`intradia`/`swing`/`posicional`) en `agents/shared/types.ts:84` propagado vía `extractTradeSummary`, pero:
   - `estructura_output` es opt-in/nullable y **ni entra en el SELECT** de la lista (`GET /api/analyses`), así que Estructura no aparece como trade.
   - `horizonteFromCandles` (`agents/a3/compute/operative.ts:214`) está sesgado: con ~300 velas diarias en prod clava casi todo en `posicional`. La temporalidad de **Estructura sí discrimina** (derivada de `timeframe_entrada`).
   - La ventana "posicional" del backtest es **120 días** (`app/api/cron/evaluate-trades/route.ts:34`), no 1 mes.

## Decisión

### Asunto 1 — Un solo radar accionable
Absorber Señales dentro de Watchlist (una fuente de verdad por ticker):
- **A. Señal en el radar = panel expandible por fila + filtro-vista "solo con señal activa".** La señal vive en la fila (contexto de mercado siempre visible) y el filtro cubre el caso "qué urge hoy".
- **B. Scan por defecto = todo el radar** (body vacío = comportamiento del server); la selección explícita máx-5 se conserva como modo avanzado plegado.
- Se **elimina** la tab/página SEÑALES (redirect 308 `/signals → /watchlist`) y el `loadWatchlist()` duplicado. Se **conserva** `GET /api/signals` (track-record real + sub-vista "ver histórico"), el `ack` y `POST /api/cmt/scan`.
- El outcome se adjunta al radar con un **segundo query best-effort** en `/api/watchlist/radar` (patrón anti-fuga `.in()` ya usado en `/api/signals`), **sin** tocar el RPC `get_watchlist_radar`.

### Asunto 2 — Fuente + temporalidad, dos ejes ortogonales
- **Eje fuente** (`source: 'a3' | 'estructura'`): badge `GRÁFICO · A3` vs `ESTRUCTURA · MTF`.
- **Eje plazo:** enum interno `{intradia, swing, posicional}` como SSOT + capa de presentación única en `lib/analyses/horizon.ts`.

| Interno | Etiqueta usuario | Ventana backtest real |
|---|---|---|
| `intradia` | 1 día · intradía | (velas intradía) |
| `swing` | 1 semana · swing | trade 30d / direccional 7d |
| `posicional` | **posición · ≈1 mes+** | trade **120d** |

- **C. Etiqueta honesta "posición · ≈1 mes+", NO se toca la ventana 120d.** Poner "1 mes" literal obligaría a bajar `HORIZON_WINDOW_DAYS.posicional` a 30d y recalibraría/rompería los `trade_outcomes` ya evaluados.
- **D. Se backtestea el trade de Estructura** (no solo diferenciación visual): migración `trade_outcomes.source` + PK compuesta `(analysis_id, source)` y adaptación del cron `evaluate-trades`, para que Estructura se mida con su propia ventana según `horizonteFromEstructuraTimeframe`.

### Invariantes (no romper)
- **NO renombrar el enum `swing`/`posicional`.** Sus literales están hardcodeados en el filtro jsonb del backtest (`evaluate-trades/route.ts:116-117`) y en las keys de `HORIZON_WINDOW_DAYS` (`:32-35`). El cambio de nombre rompe el scoring en silencio. La traducción a etiqueta legible vive solo en la capa de presentación.
- **NO tocar la ventana de 120d** (Decisión C).
- **NO tocar el aislamiento de A3.** La consolidación opcional de schema (F8) debe mantener verdes los tests de aislamiento.

## Plan por fases

| Fase | Qué | DB |
|---|---|---|
| **F0** | Extraer de `signals/page.tsx` a `components/signals/` (TrackRecordPanel, OutcomeBadge, helpers) | no |
| **F1** | `lib/analyses/horizon.ts` (SSOT etiquetas + `horizonteFromEstructuraTimeframe`); corregir los 3 consumidores de `trade.horizonte` en `historial/page.tsx` | no |
| **F2** | `outcome` nullable en `RadarSignal`; 2º query best-effort en `/api/watchlist/radar`; ack optimista desde el radar | no |
| **F3** | `source` en `TradeSummary`; `extractEstructuraTradeSummary`; `estructura_output` al SELECT de `GET /api/analyses`; badges + banner Estructura cuando A3=hold | no |
| **F4** | RadarRow panel expandible (outcome/ack/copiar) + barra global (contadores, track-record, scan, filtro "solo con señal") | no |
| **F5** | Navegación/limpieza: quitar tab SEÑALES, redirect 308 en `next.config.mjs`, borrar `app/signals/page.tsx`, `middleware.ts`, `?from=signal` | no |
| **F6** | Verificación: `typecheck + lint + test` + manual | no |
| **F7** | **Backtest Estructura**: migración `trade_outcomes.source` + PK compuesta (skill `supabase-migration`); adaptar `evaluate-trades` | **sí** |
| **F8** | (Higiene, opcional) consolidar doble `operativa` schema; arreglar sesgo de `horizonteFromCandles` | no |

## Consecuencias

- **A favor:** una sola pantalla accionable por ticker; el usuario ve fuente y plazo del trade; Estructura pasa de invisible a medible.
- **Riesgos / a vigilar:**
  - **Fuga cross-user** en los outcomes del radar → replicar exactamente el `.in()` sobre ids ya filtrados por RLS; test explícito.
  - **Asimetría de outcome** hasta F7: los trades de Estructura se rotulan "no evaluado automáticamente".
  - **Semántica de urgencia y de "N con trade"** cambia de "por señal" a "por ticker/por fuente" — documentar el nuevo criterio.
  - `horizonteFromCandles` seguirá clavando A3 en `posicional` hasta F8; el eje Estructura aporta la discriminación temporal entretanto.
  - Redirect 308 load-bearing: sin él se rompen `?from=signal` y `router.push('/login?next=/signals')`.
