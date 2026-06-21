# Handoff · Auth — Login / Signup (`/login`, `/signup`)

> Tokens/chrome compartidos en [README](./README.md). Layout propio (`app/(auth)/layout.tsx`): centrado, **sin BottomNav ni Header**.

## Overview
Acceso a ADAM. `/login` (email+password) y `/signup` (nombre opcional + email + password ≥6). Auth vía Supabase (cliente browser). Copy de marca con carácter ("Detect the unseen" / "Access is earned." / "Built to detect what others ignore.").

## Layout
`AuthLayout`: `min-h-screen bg-void flex items-center justify-center px-4`. Tarjeta `w-full max-w-sm`:
- Cabecera centrada: `Monogram` (`h-12 w-12`) + wordmark Orbitron `text-2xl` + tagline "Detect the unseen" + sub "Anomaly Detection & Analysis Module".
- Caja `rounded-[15px] border-white/10 bg-surface-2 p-5`: título (`ACCESO` / `CREAR CUENTA`) + frase + form (`Field` label mono uppercase `white/66` + input) + botón submit (blanco, full-width) + link a la otra ruta (`text-accent`).
- Footer disclaimer `white/45`.

## Componentes
| Componente | Notas |
|---|---|
| `Field` | label mono 12px uppercase `white/66` + children (input). |
| Inputs | `bg-black/40 border-white/10`, foco → `border-accent` (post-polish; antes `a1`/blanco). Placeholder `white/45` (post-polish; antes `slate`/`white/25`, contraste insuficiente). |
| Botón submit | `bg-white text-black` full-width; "ENTRAR ▶"/"CREAR CUENTA"; loading "AUTENTICANDO…". |
| Link cruzado | `text-accent hover:opacity-80` ("¿Primera vez? · crear cuenta →" / "← volver a entrar"). |

## Estados e interacciones
| Elemento | Estado | Comportamiento |
|---|---|---|
| Submit | loading | botón `disabled opacity-40`, texto de progreso. |
| Error | auth fallida | caja `border-white/30 bg-white/[0.05]` con `animate-blink-slow` + mensaje de Supabase. |
| Éxito login | — | `router.push(next)` + `refresh()`. `next` validado contra open-redirect (`safeNext`: solo paths internos `/foo`). |
| Usuario ya logueado | middleware | `/login`·`/signup` redirigen a `/analysis`. |
| Signup | password | `minLength=6` nativo. |

## Responsive
Tarjeta `max-w-sm` centrada; `px-4` en móvil. Sin cambios mayores por breakpoint (formulario de una columna).

## Edge cases
- **`next` malicioso** (`//evil`, `http://…`, `/\…`) → fallback `/analysis` (`safeNext`).
- **Credenciales inválidas** → mensaje de error (parpadeo lento).
- **Sin JS** → formularios nativos (`required`, `type=email`, `minLength`).

## Animación
Error con `animate-blink-slow`; transiciones de foco/hover. `prefers-reduced-motion` corta.

## A11y
- Inputs con `autoComplete` correcto (`email`/`current-password`/`new-password`/`name`), `type` semántico, `required`.
- `Field` asocia label↔input vía `<label>` envolvente.
- Foco `accent` (`:focus-visible` global + borde).
- Placeholders subidos a `white/45` (contraste).
- **Pendiente menor:** unificar copy "Module" (ya corregido el typo "Modular" en login).
