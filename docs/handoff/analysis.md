# Handoff · Análisis (`/analysis`)

> Tokens/chrome compartidos en [README](./README.md). Pantalla buque insignia.

## Overview
El usuario escribe un ticker → ADAM corre el pipeline (A1 micro · A2 macro · A3 técnico aislado · Debate condicional · A4 consolidado) y muestra un **veredicto verdict-first** con confluencia. Entrada también vía deep-link `?ticker=X` (desde watchlist) — auto-dispara el análisis. Ruta principal y home (`/` redirige aquí).

## Layout
`min-h-screen bg-void pb-20`, `mx-auto max-w-md` → `md:max-w-3xl` → `lg:max-w-6xl` → `xl:max-w-7xl`. Orden: Header → `AssetInput` → cross-link `/estructura` → **VerdictBar** (cuando A4 listo) → banners (error / parcial) → `OnboardingCard` (idle) → **grid 12 col** (`lg`): columna agentes (8) + rail síntesis (4, `sticky top-3`). En móvil todo apila.

- **Columna agentes (lg:col-span-8):** SectionLabel "agentes paralelos" → grid A1+A2 (`grid-cols-1 min-[400px]:grid-cols-2`) → Debate (condicional, con FlowArrow) → SectionLabel "motor técnico autónomo" → A3.
- **Rail (lg:col-span-4):** SectionLabel "indicador de confluencia" → `ConfluenceIndicator` → (cuando A4) FlowArrow + SectionLabel "sistema · A4" → A4Card.

## Componentes
| Componente | Notas |
|---|---|
| `VerdictBar` | Sticky `top-0 z-20`, `bg-surface-2/90 backdrop-blur`. Label "VEREDICTO" + DirectionBadge + dirección coloreada (`positivo→emerald`/`negativo→rose`/`neutral→white/70`) + (en `sm:`) %confluencia + ConfidenceChip + badge `A3 ✓` si `aligned`. Acción sugerida truncada. |
| `A1Card`/`A2Card`/`A3Card`/`A4Card` | Vía `AgentCardShell`. A1 accent blue, A2 cyan, A3 amber (badge LIVE), A4 violet. Colapsables: `defaultOpen` solo si hay señal (`anomaly_detected`/`opportunity_detected`); A3 default abierto si listo. |
| `DebateCard` | Solo si A1 anomalía o A2 oportunidad. |
| `ConfluenceIndicator` | Panel: 3 filas (A1/A2/A3) × 5 dots por quintil (`transitionDelay i*80ms`), barra de progreso (width+opacity 700ms, opacidad por nivel), score grande `text-[30px]` con caja por nivel (alta/media/baja/null). |
| `ScanCarousel` | Dentro de cada card en `scanning`: 3 líneas visibles, rota `1100ms`, fade-slide, máscaras de gradiente top/bottom. `aria-live="polite"`. |

## Estados e interacciones
| Elemento | Estado | Comportamiento |
|---|---|---|
| Fetch | dual | `/api/agents/run` (A1+A3+Debate+A4) **+ paralelo** `/api/agents/a2` (warming cache); request anterior abortada con `AbortController`. |
| A2 | primera vez (cache fría) | llega `null` en `/run`; cuando resuelve el fetch paralelo → actualiza A2 card + re-narra A4 (`/api/agents/a4`, best-effort). |
| Status header | derivado | error / ok (A4 done) / running (scanning) / offline (idle). |
| Cards | colapsadas por defecto | salvo señal → reduce densidad en móvil. Toggle `min-h-[44px]`. |
| 401 | redirect | `/login?next=/analysis`. |
| Banner parcial | `partial` | "ANÁLISIS PARCIAL · N agentes con fallo (…)". |

## Responsive
| BP | Cambio |
|---|---|
| `<400px` | A1+A2 en 1 col |
| `≥400px` | A1+A2 en 2 col (`min-[400px]:grid-cols-2`) |
| `<640px` | %confluencia oculto en VerdictBar |
| `≥640px` (`sm`) | %confluencia visible |
| `≥1024px` (`lg`) | grid 2 columnas (agentes 8 / rail sticky 4); ancho hasta `xl:max-w-7xl` |

## Edge cases
- **Idle** (sin análisis, sin error): `OnboardingCard` "cómo funciona" en 3 pasos.
- **Todos los agentes fallan** → 503 `all_agents_failed` → banner error fatal.
- **Fallo parcial** → A4 con confluencia degradada + banner parcial.
- **Errores** por tono (`auth`/`transient`/`rate_limit`/`partial`/`fatal`) → intensidad de blanco creciente; `fatal` parpadea.

## Animación
VerdictBar/cards sticky; dots de confluencia staggered (80ms); barra de confluencia (700ms ease-out); StatusDot blink; carrusel fade-slide 380ms. `prefers-reduced-motion` corta todo.

## A11y
Toggles `aria-expanded` `min-h-[44px]`; carrusel `aria-live`; DirectionBadge `role=img`; errores como texto (no solo color); foco `accent`. Orden: input → Analizar → ⊞ → cross-link → VerdictBar → cards (toggle) → rail.
