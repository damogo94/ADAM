# Handoff · Señales (`/signals`)

> Tokens/chrome compartidos en [README](./README.md). Pantalla del escáner CMT determinista.

## Overview
Lista del historial de **señales CMT** (escáner determinista sin LLM sobre la watchlist) con su **track-record real** (hit-rate de señales resueltas), selección de activos a escanear (máx 5), lanzamiento de scan, filtros y agrupación por estado de seguimiento. Color **semántico** por nivel de urgencia.

## Layout
`min-h-screen bg-void pb-20`, `mx-auto max-w-md` → `md:max-w-2xl` → `lg:max-w-3xl`. Orden: Header → SectionLabel "resumen" → 3 CountBox → SectionLabel "rendimiento" → `TrackRecordPanel` → (si hay watchlist) selección de activos + botón "limpiar" → botón **EJECUTAR SCAN** (full-width) → banner error → SectionLabel "filtros" → filtros (nivel + ticker + ack) → SectionLabel "historial · N" → lista agrupada (en seguimiento / resueltas / no seguidas) → footer.

## Componentes
| Componente | Notas |
|---|---|
| `CountBox` | urgente/atención/monitorear. Color semántico (rose/amber/emerald); **dim** si count=0; urgente con `animate-urg-pulse` si >0. |
| `TrackRecordPanel` | Hit-rate grande (`text-[28px]`) o "—" si sin resueltas; chips win/loss/timeout/no-fill (colores semánticos) + R medio. **Estado vacío honesto** (nunca 0% fantasma). |
| Selección de activos | chips por ticker (máx 5): activo `bg-white text-black`, disponible `border-white/15`, disabled `text-white/25`. `aria-pressed`. Touch ~36px (post-polish). |
| Filtros nivel | `todas/urgente/atención/monitorear` — activo toma color del nivel; inactivo B&W dim. Touch `py-3` (~40px). |
| Filtros ack | input ticker + `todas/no leídas/leídas`. |
| `SignalCard` | Colapsable. Banda lateral de color por nivel; ticker + nivel + timeframe + setup (line-clamp) + %confianza + hora + OutcomeBadge. Expandida: resultado (±R, %, días), grid entrada/stop/target, R/B, indicadores, "Invalida si" (`rose`), acciones copiar/marcar-leído. |
| `OutcomeBadge` | win→emerald / loss→rose / timeout→amber / no_fill·n.e.→neutro, con ±R. |
| `GroupSection` | encabezado con label + count + línea-gradiente; grupo "no seguidas" con `opacity-75`. |

## Estados e interacciones
| Elemento | Estado | Comportamiento |
|---|---|---|
| Scan | sin selección | POST `/api/cmt/scan` body vacío → escanea toda la watchlist. |
| Scan | con selección | body `{tickers:[...]}` (máx 5). Botón "ESCANEANDO…". |
| Selección | cap 5 | 6.º chip → `disabled`, `title="Máximo 5 activos"`. |
| Ack | optimista | marca leída al instante; rollback + error si POST falla. Card leída → `opacity-60`. |
| Copiar reporte | click | `navigator.clipboard` con resumen del setup. |
| 401 | redirect | `/login?next=/signals`. |
| Status header | derivado | running (loading) / error (urgentes>0) / ok. |

## Responsive
Contenedor `max-w-md`→`md:max-w-2xl`→`lg:max-w-3xl`. CountBox siempre `grid-cols-3`. Filtros de nivel `flex` (4 botones `flex-1`). Sin reflows mayores por breakpoint.

## Edge cases
- **Sin señales** → estado vacío `border-dashed` "sin señales · añade activos y ejecuta un scan".
- **Filtros sin match** → "ninguna señal cumple los filtros".
- **Sin resueltas** → TrackRecord "—" + explicación del cron nocturno.
- **No evaluable** (geometría degenerada) → grupo "no seguidas".
- **Sin watchlist** → bloque de selección oculto (scan corre sobre toda la watchlist).

## Animación
CountBox urgente `animate-urg-pulse` (2.6s); SignalCard urgente sin ack pulsa; chevron expand. Reducido con `prefers-reduced-motion`.

## A11y
- Selección `aria-pressed` + `title` en disabled.
- Áreas táctiles de filtros/chips subidas (~36–44px, post-polish).
- Color semántico **acompañado** de label textual (URGENTE/WIN/…).
- Foco `accent` en input de ticker.
- Orden: CountBox → TrackRecord → selección → scan → filtros → cards (toggle) → acciones.
