# ADAM_INICIO_NARRATIVA.md

> **Qué es:** spec de narrativa, copy y lenguaje visual para el landing `/inicio`.
> Hereda la *esencia* del homepage de aetherlabs.es (scroll-narrativa de
> transformación + voz en dos tiempos + sobriedad) recontextualizada a un
> **producto** de análisis financiero multi-agente, no a un estudio de servicios.
>
> **Estado:** **Fase 0.5 APROBADA** por el owner (2026-06-25). Voz fijada:
> **educativo (B2C)**. Fase 0 read-only ejecutada contra el repo; las 7
> correcciones de hechos del draft original ya están aplicadas (ver §Correcciones).
>
> **Compone con:** los tokens ya viven en `tailwind.config.ts` + `app/globals.css`
> (no existe `ADAM_INICIO_ELEVACION.md`; la migración de tokens ya está hecha —
> este doc los **consume**, no los redefine).
>
> **No reabre** invariantes cerrados (firewall semántico, A3 aislado, honestidad).

---

## Decisiones cerradas (gate Fase 0.5)

- **Registro de voz: educativo (B2C).** Una sola columna; no mezclar con prosumer.
  Coherente con `/watchlist` (glosario siempre accesible) y con que un landing es
  primer contacto que debe onboardear. La precisión técnica (ejes net/κ/accionable,
  calibración) queda disponible **al clic**, nunca en el titular.
- **Estructura: sección dedicada "Además · futuros".** Es opt-in y solo aplica a
  futuros (MTF), así que NO entra como 4ª lente del roster del hero; vive en su
  propia sección (como ya hace el landing).
- **Tipo: Inter + IBM Plex Mono.** No hay Orbitron en el proyecto → el "retiro de
  Orbitron" del draft NO aplica. Cambiar el tipo sería una decisión nueva, no un retiro.
- **Arco de 5 capítulos + mantra:** aprobados (abajo).

---

## Invariantes que viajan a Fase 1 (verificados en repo · Fase 0 audit)

- **Tokens SSOT:** `void #0B0B0D` · `surface #161618` (+`surface-2 #1E1E21`,
  `surface-3 #27272B`) · `ink #F5F5F7` · `accent #5B8AF0` — `tailwind.config.ts:26-38`,
  `globals.css:11-18`.
- **Firewall semántico (regla DURA para el builder):** `emerald`/`rose`/`amber`
  **solo** para señales de mercado (verdicts, signals). **Prohibido** como branding,
  ambiente o decoración. Decláralo literal en el prompt de Fase 1 o el builder los
  meterá "de vibe". (Comentario real en el repo: *"JAMÁS en chrome, navegación, badges"*.)
- **A3 aislado en cualquier diagrama del pipeline:** solo OHLCV; ni noticias, ni
  macro, ni sentiment. Es el rasgo más importante de cualquier ilustración del flujo.
- **Honestidad — cero progreso fantasma:** si el hero R3F anima un "análisis", debe
  ser demo etiquetada o ejecución real. El elemento va de **difuso/ruido →
  estructurado/resuelto** a lo largo del arco, re-tonado **fuera de hues por agente**.
- **Diferenciación tipográfica-no-cromática:** agentes y secciones se distinguen por
  tratamiento tipográfico (peso, tamaño, etiqueta), no por color.

---

## Arco del hero — 5 capítulos (educativo, fiel al pipeline real)

Waypoints (indicador de capítulo activo): **El ruido · Los datos · Los agentes ·
La confluencia · El veredicto**

| # | Capítulo | Titular | Giro |
|---|---|---|---|
| 1 | El ruido | "Un ticker. Mil opiniones." | "Ninguna es, todavía, análisis." |
| 2 | Los datos | "Primero, los hechos." | "Precio, fundamentales y macro. Sin relato encima." |
| 3 | Los agentes | "Tres miradas, cada una a lo suyo." | "Y la técnica **solo** ve el precio —ni noticias ni opiniones— para no contaminarse." |
| 4 | La confluencia | "No te promediamos las lecturas." | "Las contrastamos entre sí; si chocan, se nota en la confianza." |
| 5 | El veredicto | "Una lectura clara, con su confianza." | "Sin fingir certezas que no existen." |

- Beat 3 son **tres** lentes de análisis (A1 micro · A2 macro · A3 técnico-aislado).
  El giro codifica el **aislamiento de A3** como feature.
- Beat 4 referencia el **módulo de debate** (contraste A1×A2, condicional) — sin
  promedios — y lo ata a la confianza del beat 5. **Sin mencionar Opus** (no existe).
- Beat 5 codifica **honestidad + calibración** (umbrales reales `≥67 alta / ≥34
  media / <34 baja`; el producto ya muestra accionable + κ).

---

## Secciones tras el hero

### 1 · "Quién mira y quién decide" (roster · voz educativa · tipográfica-no-cromática)

- **A1 · Fundamental** — "Los números de la empresa. Sin el relato de moda."
- **A2 · Macro** — "El contexto que mueve al mercado. No el ruido macro."
- **A3 · Técnico (aislado)** — "Solo el precio. Ni noticias ni opiniones. A propósito."
- **A4 · Consenso** — "No un agente más: junta las tres lecturas en un veredicto.
  Cuando discrepan, lo resuelve a la vista."
- **CMT · Vigía** — "Vigila tu watchlist y te avisa. Sin gastar ni un token."

### 2 · "El motor: Claude. La cuenta: código."

> "Los agentes usan Claude (Haiku y Sonnet) para una sola cosa: poner en palabras
> lo que ven. Los números —indicadores, niveles, confluencia, confianza— los calcula
> **código determinista**, no el modelo. Así el veredicto no depende de la inspiración
> del día. Datos en crudo: Finnhub y Yahoo (precio + fundamentales), FRED (macro)."

Convierte la corrección (no hay Opus; el LLM solo narra) en **argumento de venta**:
determinista = fiable.

### 3 · "Además · para futuros · Agente de Estructura"

La sección dedicada que ya existe en el landing (opt-in, MTF, CTA a `/estructura`).
Sin elevarla al roster del hero.

### 4 · "Analiza un ticker"

Entrada **real** al producto (no teaser simulado). Un único punto de conversión:
CTA a `/analysis`. Consume el pipeline real (Finnhub/Yahoo → agentes → Supabase/Redis).

### 5 · "Qué NO ofrece" + cierre

Disclaimer (4 puntos, ya existe) + mantra de cierre.

---

## Mantra de cierre

> "Del ruido, los hechos. De los hechos, un consenso. Del consenso, tu decisión."

Cadencia de tres tiempos (análoga a "Hacemos real lo etéreo…"). Sin el "cinco
miradas" del draft, que chocaba con el roster real.

---

## Stack real (para Fase 1)

Next.js 14 App Router · TS strict · Tailwind (**sin shadcn/ui**; componentes custom
+ `clsx`/`tailwind-merge` para `cn`) · Framer Motion (scroll-driven reveals, ya en
stack) · React Three Fiber (hero, lazy `dynamic(ssr:false)` — three/R3F viven solo
en `/inicio`). Fuentes: Inter + IBM Plex Mono.

## Modelos (para que el copy sea honesto)

A1 Haiku · A2 Sonnet · A3 Haiku · A4 Haiku · Debate Sonnet · Estructura Haiku ·
CMT código (sin LLM). **No se usa Opus.** Tesis: *el LLM narra, el código calcula*.

---

## Correcciones aplicadas vs draft original (Fase 0 read-only)

1. **Opus eliminado.** A4 = Haiku, Debate = Sonnet (downgrade Opus→Sonnet por el
   lambda de 60s del plan Hobby). El concepto "debaten, no promedian" SÍ es real.
2. **Modelos:** "Sonnet en agentes" → realidad mixta Haiku/Sonnet; tesis honesta =
   "el LLM narra, el código calcula".
3. **Roster:** incluye **Estructura** (7 agentes reales: A1·A2·A3·A4·Debate·CMT·EST).
   "Cuatro/cinco miradas" mezclaba niveles → 3 lentes + consolidación + vigía;
   Estructura en sección aparte.
4. **shadcn/ui:** no se usa → quitado del stack.
5. **Orbitron:** no existe → el gate de "retiro" se disuelve.
6. **`ADAM_INICIO_ELEVACION.md`:** no existe; los tokens ya están en el SSOT.
7. **Umbrales:** `≥67 / ≥34` (34/67), en `compute.ts` (no `types.ts`). El draft
   decía "33/66".

---

## DECISIÓN PENDIENTE (gate antes de Fase 1)

- [ ] **Gate de Fase 1 (layout):** pendiente de OK del owner. Fase 1 = implementar
  esta narrativa en el componente `components/inicio/*` (arco scroll, roster,
  motor, entrada real), respetando los invariantes de arriba. Requiere su propio
  plan + aprobación antes de tocar código de layout.
