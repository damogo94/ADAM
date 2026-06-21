# Handoff · Sistema (`/system`)

> Tokens/chrome compartidos en [README](./README.md). Panel interno (doble gate: middleware + layout server-side `is_system_authorized`).

## Overview
Panel de observabilidad del sistema: métricas agregadas, consola de usuarios, coste por agente, calibración (hit-rate de backtesting), inventario de agentes, pipeline determinista, diagrama de arquitectura, actividad reciente y checklist de seguridad. Solo visible para usuarios autorizados (la tab `/system` se oculta en la nav si no).

## Layout
`min-h-screen bg-void pb-20`, `mx-auto max-w-md` → `md:max-w-2xl` → `lg:max-w-3xl`. Secciones (SectionLabel + contenido): cabecera de marca → "métricas" (grid 2 col de `Stat`) → "usuarios" (`UsersConsole`) → "coste por agente" (`AgentCostBreakdown`) → "calibración" → "agentes" (lista) → "pipeline determinístico" → "arquitectura" (`ArchitectureDiagram`) → "actividad reciente" → "seguridad" → footer.

## Componentes
| Componente | Notas |
|---|---|
| `Stat` | número grande (`text-[20px]`) + label + sub-línea opcional. `emphasis` (urgentes>0) → borde/bg más intensos. |
| `UsersConsole` | Lista expandible de usuarios (email, alta, nº análisis/señales, último). Estados carga/vacío `white/66`. L1 actividad, L2 detalle. |
| `AgentCostBreakdown` | Por agente: $coste, % del total, modelos, runs, cache-hit, tokens, mini-barras input/output/cache. |
| Calibración | hit-rate global + por horizonte/dirección/confianza/confluence (KV rows). Estado vacío explica el cron 22:00 UTC. |
| Lista de agentes | A1·A2·A3·A4·DEBATE·CMT·**EST** con modelo y badge `hybrid` (compute). Dot `animate-blink-slow` + "ONLINE". |
| `ArchitectureDiagram` | Diagrama por zonas (Input→Datos→Narrate→Debate→Confluencia→Output→Persiste) + subsistemas independientes (CMT scanner, **Agente de Estructura**). Nodos por tipo (io/data/compute/agent/agentIsolated/debate/persist); A3 aislado = borde blanco `dashed`. Micro-texto **10px** (post-polish, antes 7–8px). |
| Pipeline / Seguridad | KV rows (`text-emerald` para checks ✓), incl. "A3 aislado", "Estructura aislado", schemas Zod, RLS, rate-limit, CSRF. |

## Estados e interacciones
| Elemento | Estado | Comportamiento |
|---|---|---|
| Carga | `loading` | header status "running"; secciones con datos a 0/—. |
| Fetch | doble | `/api/system` + `/api/metrics/calibration` en paralelo. |
| 401 | redirect | `/login?next=/system`. |
| No autorizado | server | layout redirige a `/analysis` (no revela que /system existe). |
| UsersConsole | expandir | fila → actividad → detalle (fetch perezoso). |

## Responsive
Contenedor `max-w-md`→`md:max-w-2xl`→`lg:max-w-3xl`. Métricas `grid-cols-2`. El `ArchitectureDiagram` apila por zonas en móvil (`flex-col` → `sm:flex-row`), divisor de aislamiento oculto al apilar.

## Edge cases
- **Sin runs** → AgentCostBreakdown y métricas con texto explicativo (se pueblan con el primer análisis).
- **Sin outcomes** → calibración "sin outcomes evaluados aún" + detalle del cron.
- **Diagrama denso** → texto a 10px (suelo de legibilidad); nodos crecen en vertical, sin recorte.
- **Datos de usuarios** → solo visibles al autorizado (gate server-side real).

## Animación
Dots de agentes `animate-blink-slow`; transiciones de borde en `Stat`/expansión de usuarios. `prefers-reduced-motion` corta todo.

## A11y
- Doble gate de auth (no solo UI).
- `Stat`/KV con buen contraste (`white`/`emerald`); footer corregido a `white/66`.
- UsersConsole filas `<button aria-expanded>`.
- Micro-labels ≥10px (post-polish).
