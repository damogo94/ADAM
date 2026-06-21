# Handoff · Inicio / landing (`/inicio`)

> Tokens/chrome compartidos en [README](./README.md). **Ruta pública** (sin auth gate). Única pantalla con framer-motion + hero 3D.

## Overview
Landing/explainer público: cuenta qué es ADAM en una frase ("escribe un ticker → cruza fundamental+macro+técnico → veredicto de confluencia con su porqué") mediante un **ejemplo ilustrativo** (cifras de muestra, etiquetado como tal). Server component (`page.tsx`) que monta el island cliente `InicioContent`; el bundle de three/R3F vive solo aquí (`dynamic(ssr:false)`). Estática por defecto (LCP).

## Layout (scroll-driven, secciones)
`AuroraBackground` (fondo evolutivo) detrás de `main` `min-h-screen pb-28`. Secciones centradas (`max-w-5xl`/`max-w-3xl`/`max-w-4xl`, `px-5`):
1. **Hero** — `grid md:grid-cols-2`: izquierda copy (eyebrow mono · wordmark Orbitron 5xl/6xl · subtítulo · CTA "Abrir análisis" botón blanco), derecha caja 3D `h-[280px] md:h-[420px]` (Hero3D o `HeroFallback` si reduced-motion).
2. **¿Qué es ADAM?** — "Cinco especialistas miran el mismo activo…".
3. **Ejemplo ilustrativo** (`#ejemplo`) — input→ticker, 3 lecturas (micro/macro/técnico, la técnica con borde `dashed` + badge "aislado"), veredicto (caja `border-emerald/40`, dirección + %confluencia + nivel + acción + riesgo). Tag "Ejemplo ilustrativo" `amber`.
4. **Agente de Estructura** — sección añadida con copy + CTA outline "Abrir Estructura →" (`/estructura`).
5. **¿Qué ofrece?** — grid 2×2 de beneficios.
6. **¿Qué NO ofrece?** — caja `border-white/20` con límites (no es broker, no ejecuta, no garantiza) + disclaimer.
7. **CTA final** — "¿Listo para verlo con tu ticker?" + botón "Abrir análisis".

## Componentes
| Componente | Notas |
|---|---|
| `AuroraBackground` | Fondo animado; estático con reduced-motion. |
| `Hero3D` (dynamic, ssr:false) | Canvas R3F (motivo confluencia). Fallback `HeroFallback`. |
| `Reveal` | Wrapper on-scroll (framer-motion `whileInView`, `once`, `y:24→0`, 550ms). Con reduced-motion → estático. |
| `SectionHeading` / `Badge` / `IllustrativeTag` | Primitivos de la landing. |
| CTAs | Primario = botón blanco (`bg-white text-black`); secundario (Estructura) = outline `border-white/25`. |

## Estados e interacciones
- Sin estado de datos (contenido estático/ilustrativo). 
- CTAs → `next/link` a `/analysis` y `/estructura`.
- Reveals disparan al entrar en viewport (margin -80px, once).
- Hero: hover/auto-rotación del 3D (si motion permitido).

## Responsive
| BP | Cambio |
|---|---|
| `<768px` | Hero apilado (copy arriba, 3D abajo `h-[280px]`); ofrece en 1 col |
| `≥768px` (`md`) | Hero 2 col; 3D `h-[420px]`; ofrece 2 col; ejemplo 3 col |
| Tipografía hero | `text-5xl` → `md:text-6xl` |

## Edge cases
- **`prefers-reduced-motion`** → aurora estática, sin reveals, sin canvas (HeroFallback). Camino de render completo y accesible.
- **WebGL no disponible** → HeroFallback.
- Ejemplo siempre etiquetado "Ejemplo ilustrativo · cifras de muestra" (cumplimiento: no confundir con datos reales).

## Animación
| Elemento | Trigger | Animación | Duración |
|---|---|---|---|
| `Reveal` | scroll into view | fade + slide y 24px | 550ms ease-out |
| Aurora | continuo | gradientes en movimiento | — |
| Hero3D | continuo/hover | rotación canvas | — |
Todo suprimido con reduced-motion.

## A11y
- Ruta pública, sin gate.
- Reveals degradan a estático (contenido siempre presente para lectores).
- CTAs son links semánticos con texto claro.
- Disclaimer literal presente (cumplimiento).
- Contraste: copy hero `white/85`, secundario `white/66`.
