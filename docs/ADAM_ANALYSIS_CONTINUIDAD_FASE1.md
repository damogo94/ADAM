# ADAM · Continuidad del pipeline (/analysis) — Fase 1

> Spec viva del trabajo de "continuidad": que el pipeline no desaparezca al
> resolver (A) y que /analysis deje de verse sin contexto respecto al scanner (B).
> Origen: prompt de dos fases (recon → GATE → implementación), 2026-06-27.

## Fase 0 — Recon (read-only, verificado contra `main` vivo)

| # | Hipótesis | Veredicto | Prueba clave |
|---|---|---|---|
| H1 | Hero se desmonta en `done` + `resolved` hardcoded `false` → rama resuelta muerta | **CONFIRMED** | `page.tsx:571` gate `a4Status !== 'done'`; `page.tsx:574` `resolved={false}` |
| H2 | End-state resuelto del hero completo pero no invocado | **CONFIRMED** | `confluence-hero.tsx:188-192` (displayPct/sublabel/numberClass/verdict), `:215` header |
| H3 | Veredicto en hasta 3 sitios en `done` | **PARCIAL** | Vivo = 2 (VerdictBar + A4Card); el hero resuelto está deshabilitado |
| H4 | Rutas hermanas sin shell persistente; scanner ausente de /analysis | **CONFIRMED** | Solo `app/layout.tsx` + `BottomNav`; cero Provider/context (grep 0); RadarRow solo en /watchlist |
| H5 | Scan = cron/server, no loop de cliente | **CONFIRMED** | `vercel.json` cron `/api/cron/watchlist-scan @ 30 21 * * *`; radar lee `get_watchlist_radar` RPC + quote live |
| H6 | Running ya es híbrido honesto (NDJSON real + asintótica capada) | **CONFIRMED** | `/api/agents/run` NDJSON (`agent`/`debate`/`final`/`fatal`); `useAsymptoticProgress` cap 0.92 inline `hero:92-117` |

**Hallazgos nuevos:**
- **Doble cifra:** VerdictBar usa `actionable_pct`, A4Card recibía `confluence?.total_pct` (`page.tsx:670`) → dos "confluencias" distintas en pantalla. Dirección y `accion_sugerida` ya se duplicaban VerdictBar↔A4Card.
- **Doc gap:** la honestidad del hero no estaba documentada (CLAUDE.md/CONTEXT.md). `CONTEXT.md` está obsoleto (2026-05-14, estética B&W superseded) y contradice el firewall (sin amber). → honestidad del hero documentada en `CLAUDE.md` (Fase 1A).

## GATE — decisiones del owner

- **D1 = A2 reinterpretada.** El hero **persiste y resuelve en sitio**, pero el núcleo
  presenta una **síntesis/conclusión clara y GENERAL** (no desglose por-agente)
  derivada de A1·A2·A3(·AE). VerdictBar se mantiene (glance sticky); el **desglose**
  vive en A4. Toque de A1: el núcleo **ancla** la conclusión. **Cifra unificada.**
- **D2 = B3 + B1.** B3 (framing: breadcrumb "desde el radar" + mini-radar de anomalías
  relacionadas) **ahora** como puente; B1 (shell persistente con máquina de estado)
  como track arquitectónico **después**.
- **D3 = C1 + C2.** CTAs de acción post-resolve (fijar alerta CMT · sumar Estructura ·
  re-analizar) **y** puente al radar ("N anomalías relacionadas → ver"). Dato real,
  post-resolve, sin asesoramiento.

## Fase 1A — Persistencia + resolución con síntesis (HECHO)

Rama `feat/analysis-continuidad-fase1a`. Solo capa visual; pipeline/stream/A3 intactos.

1. `page.tsx`: el hero deja de excluirse en `done`; `resolved={state.a4Status === 'done'}`
   (deriva real). El cerebro y los agentes ya no desaparecen — resuelven en sitio.
2. `confluence-hero.tsx`: el end-state resuelto añade una **línea de síntesis** = la
   conclusión consolidada de A4 (`accion_sugerida`), general y no por-agente. Solo con
   `resolved` (evento real). Transición running→resuelto reutiliza lo existente
   (`useAsymptoticProgress`, `litRegions`, `chipState`); `prefers-reduced-motion` cubierto.
3. **Cifra unificada:** A4Card pasa a `actionable_pct ?? total_pct` (`page.tsx:670`) →
   VerdictBar, hero y A4 muestran el MISMO número accionable.
4. `CLAUDE.md`: documentada la honestidad del hero (cierra el gap del recon).

**Checklist de cierre Fase 1A:**
- [x] Honestidad: `resolved` solo deriva de `a4Status==='done'`; regiones/chips/A3 intactos.
- [x] A3/EST aislados (sin cambios de datos ni topología).
- [x] Firewall de color: número resuelto usa `TONE_NUM` (dato); síntesis en `ink/70` (chrome).
- [x] Veredicto sin redundancia de CIFRA (unificada); roles distintos (hero síntesis · VerdictBar glance · A4 desglose).
- [x] `prefers-reduced-motion` cubierto (heredado del hero).
- [x] Blast radius acotado a /analysis.

## Fase 1B — Integración inter-página (PENDIENTE)

- **B3 (puente, primero):** en /analysis, breadcrumb de origen cuando se llega vía
  `?ticker` desde el radar + tira mini-radar con anomalías relacionadas (dato real de
  `/api/watchlist/radar` / `get_watchlist_radar`). Si 0, decirlo explícito. Rutas intactas.
- **B1 (después, track aparte):** `AnalysisState = idle | running{progress,perAgent} |
  resolved{verdict}` consumida por un shell persistente; radar ambiental (no se desmonta);
  origen del progreso (NDJSON / asintótica) detrás de la interfaz con las garantías de
  honestidad. A3/EST aislados también en el shell. Blast alto (hoy no hay shell ni context).

## Fase 1C — Recomendación post-veredicto (PENDIENTE)

- **C1:** CTAs post-resolve — fijar alerta CMT · sumar Estructura · re-analizar. Acción de
  producto, nunca directiva compra/vende.
- **C2:** puente al radar — N anomalías relacionadas (dato real del scan persistido); si 0,
  explícito. Refuerza B.
