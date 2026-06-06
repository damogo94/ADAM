# ADR-002 · Operativa de A3 como "plan de trade" (multi-timeframe, por perfil)

- **Estado:** aceptada · implementación por fases
- **Fecha:** 2026-06
- **Contexto previo:** ADR-001 (routing de modelos, inline en `agents/a3/narrate.ts` y `agents/debate/prompt.ts`).

## Contexto

En producción, A3 emite `signal: 'hold'` el **94%** de las veces (99 de 105 análisis; solo 6 operativas accionables, todas swing, 0 intradía). El diagnóstico con datos reales (`analyses_log`) descarta que el cuello sea el R/B:

- **≈82% de los holds NO tienen niveles** (`detectLevels` devuelve soporte y/o resistencia vacíos). `computeOperativa` exige **ambos** lados presentes → hold inmediato, sin llegar a evaluar R/B.
  - Causa: clustering de pivots con `tolerancePct: 0.5%` + `minTouches: 2` hardcodeados — demasiado estricto para activos con volatilidad (cripto, equity). Agravado en tendencias, donde un lado es estructuralmente escaso (bajista → sin soporte abajo; alcista → resistencia en máximos nuevos).
- **Causa secundaria:** cuando sí hay niveles, el precio está a **8–17%** del nivel, muy por encima del gate de proximidad (3%).

Además, A3 solo conoce **un setup**: "pullback a un nivel en tendencia, entrada a mercado si el precio ya está pegado al nivel **ahora**". Ese acoplamiento al instante del análisis es la raíz de la escasez.

## Decisión

Reencuadrar la operativa de A3 de **"operar AHORA a mercado"** a **"plan de trade con disparador"** (a mercado **o** límite en el nivel). La entrada-límite es la bisagra que unifica las mejoras:

### Componentes
1. **Niveles por perfil de activo** — mover `tolerancePct`/`minTouches` de `detectLevels` a `agents/a3/profiles.ts` (que ya parametriza proximity/atr/rb/decimals por clase). Tolerancia ancha en cripto/equity, fina en forex/bonos.
2. **Plan con entrada market/limit** *(bisagra)* — la operativa define un plan (pullback como **límite** en el nivel; market si el precio ya está ahí). `entrada` pasa a ser el nivel disparador; nuevo `entry_type: 'market' | 'limit'`. Se elimina el gate duro del 3%: el plan vale si el nivel es **alcanzable** dentro del horizonte (≤ k·ATR), no "el precio debe estar ahí ya". R/B ≥ 1.5 se mantiene.
3. **Operativa multi-timeframe** — calcular el plan en **diario** (swing/posicional) **y 4H** (intradía) y emitir el mejor accionable, etiquetado con `horizonte` + `timeframe_operativa`. El 4H reutiliza los datos intradía que A3 ya agrega para `mtf`, con parámetros de perfil propios.
4. **Repertorio de setups** — sobre el modelo de plan, añadir `setup_type`: pullback (base), breakout (rotura con volumen), rango (lateral con S/R). Fasificado.

### Transversal — calidad + honestidad (lección HERMES)
Aflojar gates da **más** trades, no necesariamente **mejores**. Por eso el **eval path-dependent forward-looking** (win/loss/timeout sobre las velas, con baseline analítico `1/(1+RB)` para random-walk) es parte del plan, no opcional: validará **cada `setup_type` por separado** y nos dirá qué tiene edge. `confidence` debe reflejar la calidad del setup (toques del nivel, R/B, alineación MTF).

## Plan por fases (cada fase enviable y testeable)

| Fase | Qué | Notas |
|---|---|---|
| **1** | Componente 1 — niveles por perfil | desbloquea daily **y** 4H; pura, testeable. **No** es el gran salto por sí sola. |
| **2** | Componente 2 — plan + entrada límite | la bisagra: mayor salto en nº de trades. Cambia el significado de `entrada`. |
| **3** | Eval path-dependent forward-looking | empezar a medir desde ya; misma mecánica que la entrada límite. |
| **4** | Componente 3 — 4H multi-timeframe | añade intradía sobre base sólida; perfiles 4H. |
| **5** | Componente 4 — breakout/rango | amplía repertorio, fasificado. |

## Consecuencias

- **A favor:** ADAM pasa de casi-siempre-hold a ofrecer la mejor posición del momento (incl. intradía), de forma medible.
- **Riesgos / a vigilar:**
  - `entrada` puede ser un límite lejos del precio → la UI debe comunicarlo (*"entrada límite 197 · esperar retroceso"*).
  - Más trades = más ruido → la Fase 3 (eval) es la red de seguridad.
  - Calibración de perfiles (tolerancia, alcanzabilidad) es estimada; se recalibra con outcomes (priority #5 del owner).
- **Esquema A3:** campos nuevos `entry_type`, `timeframe_operativa`, `setup_type` — aditivos, nullable, derivados solo de OHLCV → no rompen el aislamiento de A3 (regla #1).
- **No se toca** el aislamiento de A3 ni el prompt; todo vive en el compute layer.
