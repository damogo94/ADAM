# ADAM — Handoff de diseño

Documentación de handoff **pantalla por pantalla** de A.D.A.M. (Next.js 14 + Tailwind, mobile-first). Generada desde el código fuente (no Figma). Cada ficha cubre: layout, tokens, componentes, estados/interacciones, responsive, edge cases, animación y accesibilidad.

> **Stack:** Next.js 14 (App Router) · Tailwind · Supabase (auth) · framer-motion (solo `/inicio`). Color de mercado **reservado** a datos; el chrome se diferencia por **intensidad + tipografía**, no por hue.

## Índice de pantallas
| Pantalla | Ruta | Ficha |
|---|---|---|
| Inicio (landing) | `/inicio` | [inicio.md](./inicio.md) |
| Análisis (pipeline) | `/analysis` | [analysis.md](./analysis.md) |
| Agente de Estructura | `/estructura` | [estructura.md](./estructura.md) |
| Señales (CMT) | `/signals` | [signals.md](./signals.md) |
| Watchlist (radar) | `/watchlist` | [watchlist.md](./watchlist.md) |
| Sistema (panel) | `/system` | [system.md](./system.md) |
| Auth (login/signup) | `/login` · `/signup` | [auth.md](./auth.md) |

---

## Sistema de diseño compartido

### Tokens de color (`tailwind.config.ts` = SSOT; `app/globals.css :root` lo refleja)
| Token | Hex | Uso |
|---|---|---|
| `void` | `#0B0B0D` | Fondo de página |
| `surface` / `surface-2` / `surface-3` | `#161618` / `#1E1E21` / `#27272B` | Cards / elevación / hover |
| `ink` | `#F5F5F7` | Texto primario (jerarquía por opacidad: `white/66` secundario, `white/45` metadata) |
| `accent` | `#5B8AF0` | Marca: foco, links, pestaña/estado activo, wordmark. **Uso moderado, nunca relleno decorativo.** |
| `emerald` / `rose` / `amber` | `#34D399` / `#FB7185` / `#FBBF24` | **Semántica de mercado INTOCABLE**: alza / baja / atención. Solo en datos, niveles, dirección, estado de señal. |
| `slate` / `slate-l` | `#525252` / `#a3a3a3` | Neutral / disabled / dirección plana. No en texto legible (contraste insuficiente). |

> Nota de deuda: muchos componentes usan `text-white/X` en vez de `text-ink/X` (visualmente idéntico). El SSOT es `ink`.

### Tipografía
| Familia | Stack | Uso | Suelo |
|---|---|---|---|
| `font-orbitron` | Orbitron | **Solo** wordmark "A.D.A.M." | — |
| `font-sans` | Inter | Labels bold (errores, onboarding, badges de estado) | — |
| `font-mono` | IBM Plex Mono | Datos, tickers, números, casi todo el cuerpo | **10px mínimo** (post-polish a11y); cuerpo informativo ≥12px @ `white/66` (~8.4:1, AA ✓) |

Fuentes cargadas en `app/layout.tsx` (Google Fonts: Orbitron 400/700/900, Inter 300–800, IBM Plex Mono 300/400/500).

### Animación (`tailwind.config.ts`)
| Token | Efecto | Duración | Uso |
|---|---|---|---|
| `animate-blink` | opacity 1→.5→1 | 2.4s loop | StatusDot scanning |
| `animate-blink-slow` | idem | 2.8s loop | StatusDot live/error, header running/error, dots en espera |
| `animate-urg-pulse` | halo box-shadow rose | 2.6s loop | **Señal de mercado urgente** (dato, no chrome) |
| `animate-fade-slide-in` | opacity+translateY 6px | 380ms | Entrada del carrusel de scan |

`prefers-reduced-motion: reduce` → todas las animaciones/transiciones cortadas a 0.01ms globalmente (`globals.css`), y framer-motion/hero 3D lo respetan por su cuenta.

### Breakpoints
Tailwind estándar `sm`(640) · `md`(768) · `lg`(1024) · `xl`(1280), más custom `min-[360px]` y `min-[400px]`. Contenedor base mobile-first: `max-w-md mx-auto` que crece por pantalla (`md:max-w-2xl/3xl`, `lg:max-w-3xl/6xl`).

### Chrome compartido
- **Header** (`components/header.tsx`): sticky `top-0 z-30`, `bg-void/95 backdrop-blur-xl`, borde inferior `white/5`. Izquierda: wordmark Orbitron + tagline mono `white/66`. Derecha: badge de estado (`offline`/`running`/`ok`/`error` por intensidad+animación) + `UserMenu`.
- **BottomNav** (`components/bottom-nav.tsx`): `fixed bottom-0 z-50 h-16`, `bg-void/95 backdrop-blur-xl`, borde superior `white/5`. 5 tabs (INICIO·ANÁLISIS·WATCHLIST·SEÑALES·SISTEMA) con icono SVG (`components/symbols.tsx`) `h-4 w-4` + label mono 12px. **Activa** = `text-accent` + subrayo `w-3 h-px bg-accent`; inactiva `text-white/66 opacity-40`. `/system` solo aparece si `/api/system/access` autoriza (gate UX; la barrera real es server-side). Detección activa por `pathname.startsWith(href)`. Las pantallas reservan `pb-20` para no quedar tapadas. **A11y:** falta `aria-current="page"` (mejora pendiente).
- **UserMenu** (`components/user-menu.tsx`): botón con iniciales (`text-a1`) + `▾`; dropdown `w-56` con cabecera "Sesión" + email y botón logout (`text-rose`). `aria-label="User menu"`.
- **SectionLabel** (`components/section-label.tsx`): `px-4 pt-3.5 pb-1`, mono 11px uppercase `tracking-[0.12em] text-white/70` + línea-gradiente a la derecha. **FlowArrow**: `↓` centrado mono 11px `white/66`.
- **AgentCardShell** (`components/agent-card-shell.tsx`): contenedor de card de agente. Dos modos — *legacy* (header fijo + cuerpo siempre visible, para idle/scanning/error) y *colapsable* (cuando se pasa `summary`: el header es un `<button aria-expanded>` de `min-h-[44px]`, cuerpo solo al expandir, chevron `›` rota 90°/200ms). Accents: blue/cyan/amber/violet (mapean a `ink`) + `slate`. Helpers: `StatusDot` (idle/scanning/done/anomaly/error/live → intensidad+animación), `IdleState`, `ScanSteps` (lista ✓/—).
- **DirectionBadge / ConfidenceChip** (`components/agent-primitives.tsx`): normalizan los 4 vocabularios de dirección a ▲(emerald)/▼(rose)/■(slate); confianza 0-33 slate · 34-66 amber · 67-100 emerald, con dot+label y barra opcional. `role="img"`/`title`.
- **AssetPicker** (`components/asset-picker.tsx`): modal catálogo. Móvil = bottom-sheet (`rounded-t-[20px]`, pull-handle), desktop = diálogo centrado (`md:rounded-[20px]`, `md:max-w-2xl/3xl`). `role="dialog" aria-modal`, input autoFocus (foco `accent`), tabs de categoría, grid de tiles 2→3 cols, favoritos (★) ligados a `/api/watchlist`. Cierra con Escape / backdrop.
- **Glossed** (`components/lens/glossed.tsx`): lente educativa — envuelve un término; si está en el glosario, lo subraya `dashed` y abre un popover (portal en `body`) al tocar. `aria-expanded`+`aria-describedby`+`sr-only` permanente. Usado sobre todo en `/watchlist`.

### Accesibilidad global
- `:focus-visible` → `outline 2px solid accent, offset 2px` en toda la app.
- Iconografía nunca depende solo del color (símbolo ▲▼■ + label; StatusDot por animación+intensidad).
- `prefers-reduced-motion` respetado globalmente.
- Áreas táctiles: objetivo ≥44px en controles primarios (post-polish); algunos secundarios ~36px.
- Scrollbars ocultas (`::-webkit-scrollbar width:0`).
