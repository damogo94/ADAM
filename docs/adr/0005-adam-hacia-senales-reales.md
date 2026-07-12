# ADR-005 — ADAM evoluciona de copiloto educativo a (también) generador de señales para operar en real

Fecha: 2026-07-12 · Estado: Aceptado (dirección; implementación GRADUAL) · Supersede parcialmente la premisa
"educational only / not a broker" de CLAUDE.md

## Contexto

Hasta hoy ADAM es un **copiloto de análisis educativo**: produce JSON educativo, no ejecuta trades, no da consejo
de inversión (ver el `DISCLAIMER_LITERAL` y el framing "not a broker"). La dirección del dueño es **mutar ADAM para
que TAMBIÉN sea un sistema de generación de señales accionables para operar en real** — sin renunciar a la capa
educativa, sino añadiendo una capa de señales tradeables por encima.

Esta decisión llega **inmediatamente después** de una investigación (ADR-004) que probó, con datos multi-régimen +
costes + survivorship, que **las señales ACTUALES de A3 no tienen un edge desplegable robusto** (largo ni corto).
Por tanto este ADR no es "encender lo que hay": es abrir un **programa** cuyo objetivo es *encontrar y validar* edge
real, con la disciplina metodológica ya establecida, antes de que nada llegue a un usuario como "operable".

## Decisión

ADAM adopta un **segundo modo de salida**: además del análisis educativo, un **flujo de señales tradeables**. Pero
con una **barra de admisión dura**: ninguna señal se presenta como accionable/operable en real hasta **superar el
protocolo de validación del ADR-004** (out-of-sample multi-régimen, exceso Y absoluto, cost-aware, corregido por
survivorship, umbrales pre-registrados, doble-null vs buy&hold). **Hoy, cero señales superan esa barra.**

## Invariantes (no romper)

- **Ninguna señal se marca "operable/real" sin clearar la barra ADR-004.** El backtester multi-régimen
  (`scripts/multiregime-backtest.test.ts`) es el **gate**, no un adorno. Un backtest sobre un solo régimen, un
  puñado de tickers, sin costes o sin corrección de survivorship **no cuenta**.
- **Prohibido p-hacking para "llenar" el modo señales:** no bajar umbrales hasta que algo dispare (ADR-004),
  no re-tunear sobre el mismo test, no vender beta como alpha, no confundir "no encontrar edge" con "hay edge".
- **Separación de capas y de responsabilidad:** la capa educativa y sus disclaimers **se mantienen** mientras la
  capa de señales no esté validada. El cambio de posicionamiento (de "educativo, no bróker" a "servicio de señales")
  tiene implicaciones **regulatorias/de responsabilidad** (asesoramiento financiero, disclaimers, idoneidad,
  jurisdicción) que son una decisión CONSCIENTE del dueño, no un efecto colateral de un flag. Documentar antes de
  exponer señales operables a usuarios reales.
- **A3 sigue aislado** (OHLCV-only). Si la búsqueda de edge exige información relativa (fuerza relativa / ranking
  transversal / benchmark), eso vive FUERA de A3 (nueva capa), no colado dentro del motor aislado — es un cambio de
  arquitectura, no un parche (ver ADR-004 pt. de ceguera al benchmark).
- **Nada se opera con dinero real sin pasar por paper-trading forward** (out-of-sample verdadero, en vivo) primero.

## Pilares del programa (roadmap, orden lógico — implementación gradual)

1. **R&D de edge** con el backtester multi-régimen: buscar señales (nuevas o combinadas) que superen la barra
   ADR-004. Sin edge validado, el resto es prematuro. Incluye: fuerza relativa / ranking transversal (rompe la
   ceguera al benchmark), régimen como filtro (no como alpha), y el test dirigido del agotamiento sobre techos
   colapsados.
2. **Gestión de riesgo y sizing:** position sizing, límites de exposición/correlación, drawdown control. Un edge
   fino (+0.03R) solo es operable con gestión de riesgo estricta — o no lo es.
3. **Ejecución y realismo:** modelo de costes/slippage por clase (ya prototipado), tipos de orden, y **paper-trading
   forward** antes de real.
4. **Cambio de posicionamiento y compliance:** disclaimers, términos, jurisdicción — la parte no-técnica que
   condiciona exponer señales operables.
5. **Monitorización live:** validación en vivo continua (el edge se degrada; hay que medirlo), con los mismos
   crons de outcome ya existentes (`evaluate-trades`, `evaluate-signal-trades`) endurecidos.

## Consecuencias

- Es un cambio de **concepto y de posicionamiento**, no un feature. Se ejecuta gradualmente; cada pieza pasa por la
  disciplina ADR-004.
- El estado honesto de partida: **hoy no hay señal operable**. El valor del programa está en *construir* hacia una,
  no en re-etiquetar la actual como tradeable.
- Coherencia con ADR-004: aquel cerró "el edge actual no es desplegable"; éste abre "vamos a *construir* uno,
  con la misma vara". No hay contradicción: uno es el diagnóstico, el otro el programa.
