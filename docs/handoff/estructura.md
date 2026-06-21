# Handoff · Agente de Estructura (`/estructura`)

> Tokens/chrome compartidos en [README](./README.md). Aquí, lo específico de la pantalla.

## Overview
Pantalla de un solo agente: el usuario teclea un activo (nomenclatura de futuros) y recibe un **plan de price action multi-temporal** — contexto Weekly→H1, zona de "rompe y apoya", confluencia (redondos + muro vanilla pendiente) y gestión (entrada/SL/TP, R/B≥1.5). Determinista. Endpoint `POST /api/agents/estructura { ticker }`. Auth-gated.

## Layout
`min-h-screen bg-void pb-20`, `mx-auto max-w-md` → `md:max-w-3xl`. Stack: Header → `AssetInput` → cross-link `/analysis` (mono 11px, `text-accent`) → banner error (cond.) → `OnboardingCard` (solo idle) → SectionLabel "plan de estructura" → `EstructuraCard` (`px-4`) → footer disclaimer. Una sola columna en todos los breakpoints.

## Componentes
| Componente | Props clave | Notas |
|---|---|---|
| `EstructuraCard` | `status`, `data`, `ticker` | Vía `AgentCardShell` accent `slate`, badge `EST`. Summary + Body. |
| `AssetInput` | `onSubmit`, `disabled` | Foco → borde `accent` + glow `rgba(91,138,240,.18)`. Abre `AssetPicker`. |
| `TfCell` (local) | `lectura`, `fallback` | Celda por timeframe; opacidad 50% + "sin datos" si `null`. |

## Estados e interacciones
| Estado (`status` / `setup.estado`) | UI |
|---|---|
| `idle` | `IdleState "esperando activo…"` (no colapsable) |
| `scanning` | `ScanSteps` (7 pasos: contexto→extremos→rango→correlación→confluencia→gatillo→gestión); StatusDot `animate-blink` |
| `error` | texto `rose` + `failureMessage` |
| `done` (estado≠listo) | card colapsable cerrada; Summary = DirectionBadge + ESTADO_LABEL + ConfidenceChip |
| `anomaly` (estado=`listo`) | card colapsable **auto-abierta** (`defaultOpen`) |
| Banner estado | `ESTADO_LABEL`: SETUP LISTO / ESPERANDO GATILLO / ESPERANDO ZONA / SIN SETUP / SIN ESTRUCTURA (+ `timeframe_zona`/`entrada`) |
| Plan (con `gestion`) | grid 4 cajas: ENTRADA `white` (+" LÍMITE" si `entry_type='limit'`), ▼STOP `rose`, ▲OBJETIVO `emerald`, R/B |
| Plan (sin `gestion`) | caja única "esperando retroceso a la zona" / "sin plan ejecutable aún" |
| Confluencia | barra de score 0-100 (`bg-white/70`, width 500ms); vanilla → "pendiente · sin datos de opciones" |

## Responsive
| BP | Cambio |
|---|---|
| `<360px` | Contexto MTF en **2 col** (`grid-cols-2`) |
| `≥360px` | Contexto MTF en **4 col** (`min-[360px]:grid-cols-4`) |
| `≥768px` | Contenedor `max-w-3xl`; onboarding 3 col |
Plan operativo: siempre `grid-cols-2`.

## Edge cases
- **Sin datos** (símbolo inválido) → endpoint `422 no_market_data` → banner error.
- **Intradía fino** (Yahoo 5d horarias) → `h4`/`h1` = `null` → TfCell "sin datos". Degradación, no error.
- **Muro vanilla (Fase 1)** → `null`, `vanilla_disponible=false`, score techo 70.
- **Narrative vacío** (fallo LLM) → permitido; fallback determinista arranca con la nomenclatura del usuario (`XAUUSD:`), no el símbolo de datos (`GC=F`).
- **Daily lateral** → `esperando_zona`, sin plan.
- **Nomenclatura**: `XAUUSD/NAS100/US500…` → `GC=F/NQ=F/ES=F`; salida muestra lo tecleado + `data_symbol`.

## Animación
DirectionBadge/StatusDot (blink), chevron toggle (rotate 200ms), barras de score/confluencia (width 500ms), borde de card scanning (border-color 300ms). Todo cortado con `prefers-reduced-motion`.

## A11y
- Toggle de card `<button aria-expanded>` `min-h-[44px]`.
- Foco de input → borde `accent` (+ `:focus-visible` global).
- `DirectionBadge role="img" aria-label`; `ConfidenceChip title`.
- Orden de foco: Header(UserMenu) → input → Analizar → ⊞ Catálogo → cross-link → toggle card → controles internos.
