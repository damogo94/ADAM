# ADR-004 — El edge probado de A3 es corto/absoluto; el lado largo/salida está NO-VALIDADO (no refutado)

Fecha: 2026-07-12 · Estado: Aceptado

## Contexto

Investigación de julio 2026 sobre el rendimiento y el edge de A3 (el motor técnico
determinista, aislado, **solo OHLCV, single-ticker**). El hilo, encadenado:

1. **Win rate aparente de A3 (~55%)** era un espejismo: los ganadores eran esencialmente
   una apuesta de BTC en corto contada varias veces (concentración de régimen + activo).
2. **Bug CMT** (`entry_type` límite evaluado como market) inflaba 9 de 11 wins fantasma →
   corregido (migración 0019, ver commit `fix(cmt)`).
3. **Barrido de parámetros**: no se podía tunear nada — todo el edge era BTC.
4. **Sesgo monodireccional/monoactivo** diagnosticado: A3 casi solo shortea (59 sell / 1 buy
   de 375) porque su única entrada es el retroceso a contra-tendencia + gate de alcanzabilidad
   `5×ATR`; en alcista, el nivel de entrada queda lejos y no hay resistencia-target en máximos.
5. **Prototipo LONG a favor de tendencia** (`computeLongTrendFollow`, detrás de flag
   `A3_LONG_TREND_FOLLOW`, **OFF**): desbloquea las compras (genera 43 longs/74 vs 1) —
   **mecanismo validado**— pero su **rentabilidad quedó INCONCLUSA** (backtest sesgado por
   resolución prematura del stop; horizonte posicional inobservable; muestra bear-only).
6. **¿Hacer el clasificador informativo en largo?** Un panel cuant + estrés adversarial
   concluyó una **cota estructural**: el "exceso vs benchmark" en largo **no es alcanzable con
   OHLCV-only single-ticker** — A3 es *ciego al benchmark* (el exceso es relativo; para un ETF
   índice, un largo a favor de tendencia ≈ *ser* el índice → exceso ≡ 0 por construcción).
7. **Palanca #1 (detector de agotamiento/blow-off como fade)**: implementada y backtesteada →
   **dispara 0 veces en 373 análisis** porque la muestra (un solo régimen bajista, mediana
   close−SMA20 = −0.8 ATR) **no contiene techos de blow-off**. Recalibrar para forzar disparos
   sería **p-hacking** (fabricar señal donde el fenómeno no existe).

### Evidencia (medida, plan-agnóstica)

- **Etiqueta 'bajista' @30d**: −7.6% de retorno absoluto, **76-80% caen**; exceso vs índice
  −1.4pp, 94% con exceso ≤0 → **edge de corto REAL**.
- **Etiqueta 'alcista' @30d**: retorno absoluto ~plano (mediana −1.1%), **exceso mediano 0.0pp**
  → **BETA, no señal**. Ningún corte OHLCV (SMA200, RSI, fuerza, golden cross) lo separó.
- **Potencia**: N≈47-373, dominado por ~5 tickers (BTC/GC=F/QQQ/SPY/XRP), **un solo régimen**,
  horizonte >50d **inobservable** (N=0). "Nada funciona en largo" = *estos datos no pueden
  revelar qué funciona*, **NO** prueba de imposibilidad empírica (la cota del punto 6 sí es
  estructural e independiente de la muestra).

## Decisión

**El único edge probado de A3 es el LADO CORTO / retorno absoluto.** Se consolida ahí. El lado
largo/salida se declara **NO-VALIDADO (no refutado): límite de datos, no fracaso de la señal.**
Se **congela** todo trabajo largo/salida como hipótesis pendiente de datos multi-régimen, sin
gastar más grados de libertad sobre la muestra actual.

## Invariantes (no romper)

- **NO encender `A3_LONG_TREND_FOLLOW` en producción.** El flag OFF da el 100% de la protección;
  el prototipo largo no tiene rentabilidad validada.
- **NO recalibrar** el detector de agotamiento (ni ninguna señal larga) sobre los ~373 análisis
  actuales — es p-hacking sobre una muestra sin el fenómeno y con 76-80% de caídas (casi cualquier
  subconjunto "cae más").
- **NO cablear `detectExhaustion` como veto/señal viva.** Es código DORMIDO y NO VALIDADO
  (`agents/a3/compute/exhaustion.ts`); presentarlo como "protección" es cargo-cult (0 disparos =
  0 evidencia de que discrimina). `exhaustion.test.ts` solo prueba que la LÓGICA dispara sobre un
  blow-off sintético (el 0 es del dato, no del código).
- **NO seguir probando palancas nuevas sobre los mismos 373 análisis** (multiple-testing sin
  corrección infla falsos positivos; la muestra está agotada).
- **NO documentar el largo como "refutado".** Es no-validado por falta de datos — cosa distinta.
- **NO colar una serie de benchmark / ranking transversal dentro de A3** para fabricar exceso-largo:
  rompe el invariante de aislamiento y es una decisión de arquitectura del dueño, no un parche.

## Reactivación (condiciones para retomar el lado largo)

1. **Datos OUT-OF-SAMPLE multi-régimen** (bull completo + bear + lateral) con **muchos tickers
   descorrelacionados** — romper el dominio BTC/QQQ/SPY. Con SMA200 ya poblada al 100% desde julio.
2. **Horizonte observable** (dejar madurar 30d y 90d; hoy N=0 más allá de ~50d).
3. **Umbrales PRE-REGISTRADOS** (los de `exhaustion.ts` / literatura), testeados en un holdout de
   **régimen distinto** al de calibración. Prohibido grid-search sobre el test.
4. **Benchmark calculado FUERA de A3** (en el backtester, no viola aislamiento); reportar
   **absoluto y exceso por separado**; **doble-null** (batir buy&hold Y la etiqueta cruda).
5. Si tras eso el detector discrimina de verdad → cablearlo detrás de flag y re-backtestear el
   efecto end-to-end. Si solo un brazo de **fuerza relativa** genera exceso → queda probado que
   OHLCV-only no basta para exceso-largo, y es una decisión de arquitectura, no de indicador.

## Consecuencias

- El resultado negativo pre-registrado **es** un hallazgo válido: acota el espacio de búsqueda y
  evita quemar esfuerzo (y grados de libertad) contra un muro de datos.
- Se preserva la opcionalidad (spec congelado + test de fixture) sin reclamar protección inexistente.
- El foco de valor de A3 queda en su capacidad probada: señal de **corto/absoluto**.
