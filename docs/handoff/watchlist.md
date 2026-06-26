# Handoff · Watchlist / radar (`/watchlist`)

> Tokens/chrome compartidos en [README](./README.md). Panel de favoritos + radar de atención.

## Overview
Radar de los activos favoritos del usuario (RLS por usuario): cada fila muestra dictamen A4, sparkline de tendencia, frescura, distancia a la acción y señal CMT activa. Cabecera "3 cosas que mirar hoy" (digest). Pinneados arriba. Términos técnicos explicables al tocarlos (`Glossed`).

## Layout
`min-h-screen bg-void pb-20`, `mx-auto max-w-md` → `md:max-w-2xl` → `lg:max-w-3xl`. Orden: Header → hint "ⓘ términos subrayados se explican al tocarlos" → `DigestHeader` → form de alta (⊞ catálogo + input + select tipo + `+`) → banner error → toggle rango sparkline (7d/30d) + "activos en radar · N" → lista (`RadarRow[]`) o `SkeletonRow×3` (carga) o estado vacío → modal de borrado (cond.) → footer.

## Componentes
| Componente | Notas |
|---|---|
| `DigestHeader` | "3 cosas que mirar hoy" + `timeAgo(generatedAt)`. Hasta 3 entradas (botón si hay `onSelect`): dot+ticker por severidad (high→rose / medium→amber / low→emerald) + razón + fuente (CMT/Δ). Estado vacío "radar limpio". |
| `RadarRow` | Fila rica: cabecera (◆ si pinned, ticker, asset_type, `DictamenSparkline`, precio+Δ24h, ▶ analizar, `PinButton`) · headline+`AnomalyBadge` · grid 3 (Dictamen/Delta/Frescura) · distancia a la acción (entrada/stop/target/RB) · señal CMT activa · `DivergenceBlock` (A1↔A2 vs A3 aislado). Hover → botón borrar (rose). `highlighted` (desde digest) → borde brillante. `is_stale` → `opacity-90`. |
| `DictamenSparkline` | SVG polyline coloreado por **dictamen A4** (positivo→emerald / negativo→rose / neutral→white/60), no por la pendiente. <2 valores → placeholder "sin histórico". |
| `PinButton` | ◆/◇, `h-7 w-7`, `aria-pressed`. |
| `AnomalyBadge` | oportunidad ▲emerald / vulnerabilidad ▼rose / fallback ◆amber. |
| `SkeletonRow` | placeholder con misma altura (sin layout shift), `motion-safe:animate-pulse`. |
| Form alta | ⊞ catálogo `h-11 w-11` (post-polish) + input (`py-2.5`) + `<select>` nativo de tipo + botón `+`. |
| Toggle 7d/30d | segmented `role="radiogroup"`/`radio` `aria-checked`; activo `bg-white text-black`. |

## Estados e interacciones
| Elemento | Estado | Comportamiento |
|---|---|---|
| Alta | submit/picker | POST `/api/watchlist`; refetch radar. |
| Borrar | confirm | modal `role="dialog" aria-modal`; **optimista** (quita la fila) + rollback si falla. |
| Pin | toggle | optimista (reordena: pinned desc, pinned_at desc, position asc) + refetch para confirmar. |
| Sparkline | rango/tickers | refetch `/api/market/sparklines` con `AbortController` (evita stale); degradación silenciosa si falla. |
| Digest select | click | scroll suave a la fila + `highlight` 3.5s (sin navegar). |
| Analizar (▶) | click | `router.push('/analysis?ticker=…')`. |
| 401 | redirect | `/login?next=/watchlist`. |

## Responsive
Contenedor `max-w-md`→`md:max-w-2xl`→`lg:max-w-3xl`. Form de alta en una fila (⊞ + input flex + select + `+`) — **apretado en móvil estrecho** (mejora pendiente: apilar el select). RadarRow grid interno `grid-cols-3` estable.

## Edge cases
- **Sin activos** → estado vacío `border-dashed` "sin activos en radar" + CTA (⊞ o teclear ticker).
- **Sin análisis previo** (fila) → "sin análisis previo · ejecuta uno con ▶".
- **Sin quote** → "no quote" (`white/66`).
- **Stale** → frescura en `amber/80` + fila `opacity-90`.
- **Respuesta radar inválida** (Zod) → error legible (no `[object Object]`).
- **Divergencia A1↔A2 / A3** → `DivergenceBlock` con dos ejes separados.

## Animación
`SkeletonRow` pulse (motion-safe); highlight de fila al seleccionar del digest; dot "radar limpio" `animate-blink-slow`; transiciones de borde/hover. Reducido con `prefers-reduced-motion`.

## A11y
- Hint de "subrayados" telegrafía el affordance de `Glossed` (popover con `aria-describedby`+`sr-only`).
- Toggle rango `radiogroup`/`aria-checked`; PinButton `aria-pressed`; modal `aria-modal`.
- `<select>` nativo (accesible por teclado).
- Catálogo `h-11` (44px). Foco `accent`.
- Color semántico siempre con glifo/label.
