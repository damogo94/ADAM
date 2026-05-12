# A.D.A.M. — Prompts de diseño UI/UX premium mundial

Colección de prompts copy-paste-ready para generar y refinar el diseño de A.D.A.M. en herramientas como **GPT-5 / Claude Opus 4.7 / v0.dev / Figma AI / Midjourney**. Pensados para alcanzar nivel de aplicación financiera premium global (referencia: Bloomberg Terminal moderno × NASA Mission Control × iPhone Apple Pay).

---

## Cómo usar este documento

1. **Empieza siempre por el prompt 0 (sistema de diseño)** — pega ese contexto al principio de cada sesión nueva con la IA. Todo lo demás depende de esa base.
2. **Pegar uno solo a la vez** y dejar que la IA itere antes de pasar al siguiente.
3. **Adjunta `_reference/adam_demo.html`** (o screenshots de la app actual) cuando sea posible — la IA ancla mejor cuando ve estilo existente.
4. **Pide siempre `Tailwind + shadcn/ui + framer-motion`** como stack si vas a generar código.

---

## Prompt 0 — Sistema de diseño (PEGA ESTE PRIMERO)

```
Vas a diseñar y refinar la interfaz de A.D.A.M. — Anomaly Detection & Analysis Module.

CONTEXTO PRODUCTO
A.D.A.M. es un copiloto de análisis financiero NO-broker (no ejecuta órdenes). Sistema multi-agente con 4 agentes IA + módulo CMT autónomo. Audiencia: traders profesionales, hedge fund analysts, family offices. Usuarios sofisticados que vienen de Bloomberg Terminal, TradingView Premium y Capital IQ.

DIRECCIÓN ESTÉTICA — "Deep Space Terminal"
Mission Control de NASA × Bloomberg Terminal × glassmorphism iOS 18. Menos-es-más radical. Cero gradientes purpúreos cliché. Cero emojis aleatorios. Cero stock illustrations. Densidad informativa alta pero sin ruido visual.

PALETA (innegociable)
- Background: void absoluto #020610 o carbón #07091a
- Texto principal: white / off-white #ffffff con 90-95% opacidad
- Texto secundario: slate-l #94a3b8 y slate #475569
- Bordes: blanco al 5-10% opacidad (whisper borders)
- Acentos por agente:
  · A1 (activos): azul eléctrico #3b82f6
  · A2 (macro): cyan brillante #22d3ee
  · A3 (técnico): ámbar #f59e0b
  · A4 (sistema): violeta #a78bfa
- Confianza: rojo coral #f43f5e (baja) → ámbar (media) → mint #10b981 (alta)

TIPOGRAFÍA
- Marca / títulos / números grandes: Orbitron (700-900, tracking expandido 0.1-0.2em)
- Cuerpo: Inter (300-500)
- Datos técnicos / KPIs / tickers: IBM Plex Mono o JetBrains Mono (400-500)
- JERARQUÍA: 8px (uppercase tracking labels) → 9-10px (mono data) → 12-14px (body) → 20-30px (números hero) → 40-60px (display)

INTERACCIONES
- Animación scanline 2-3s mientras el agente piensa (gradient sweep top-to-bottom)
- Dots LIVE pulsando a 1.6s
- Números cuenta-arriba al cambiar (count-up easing easeOut 400ms)
- Hover: borde + glow del color del agente, NUNCA scale
- Microinteracciones: 200-400ms, ease-out, sin spring melindroso

COMPONENTES BASE
- Cards: bg surface-2 #0b0e21, border-radius 15px, border whisper, padding 10-14px
- Botones primarios: acento sólido del color del agente correspondiente, font Orbitron 11px tracking
- Inputs: bg black/40, border white/10, focus: borde acento + glow sutil

LO QUE EVITAR
- Skeuomorfismo o "iconos finance" típicos (toros, gráficos genéricos)
- Gradientes cyberpunk neón
- Lenguaje hype: "AI-powered", "revolutionary", "next-gen"
- Iconos decorativos. Los únicos símbolos: ▶ ◎ ⚡ ◈ ⬡ ▾ ▸ ↑ ↓ ⟡
- Más de 2 colores acento por pantalla

VOZ COPY (español)
- Técnica y seca: "anomalía detectada", "confluencia alta", "factor de invalidación"
- Lowercase para labels secundarios: "agentes paralelos", "indicador de confluencia"
- UPPERCASE para signal states: URGENTE / ATENCIÓN / MONITOREAR
- Cero exclamaciones. Cero emojis. Cero "✨".

Cuando te pida diseñar una pantalla, devuélvelo en este orden:
1. Wireframe ASCII de alto nivel (máx 30 líneas)
2. Justificación de cada decisión que diverja del estado actual
3. Código JSX/TSX con Tailwind, listo para integrar en Next.js 14 App Router
4. Lista de las 3 microinteracciones críticas y cómo implementarlas con framer-motion
```

---

## Prompt 1 — Pantalla de Login premium

```
Diseña la pantalla /login de A.D.A.M. con el sistema de diseño dado.

REQUISITOS FUNCIONALES
- Email + password (Supabase Auth)
- Link a /signup
- Mensaje de error inline
- Disclaimer al pie ("Análisis educativo · no constituye asesoramiento financiero regulado")

OBJETIVO EMOCIONAL
El primer instante debe transmitir: "esta herramienta es seria, no es otra fintech con gradientes". Premium sin ostentación. Sentir el peso institucional.

REFERENCIAS PROHIBIDAS  
NO Stripe, NO Linear (demasiado SaaS-genérico), NO Robinhood/eToro (demasiado retail).

REFERENCIAS DESEADAS
Página de login de Bloomberg Anywhere, panel de admin de un satélite NASA, dashboards de Palantir Foundry. Quietud densa.

PIDE ESPECÍFICAMENTE
- Cómo balancear el vacío del fondo con el peso visual del logo A.D.A.M.
- Si introducir un elemento "monitor activo en background" (sutil ticker tape o constellation chart pulsando bajo la card) — argumenta a favor o en contra
- Manejo del estado "autenticando..." sin spinner genérico
```

---

## Prompt 2 — Pantalla Análisis (la joya de la corona)

```
Refina la pantalla /analysis de A.D.A.M., que es la principal del producto.

ESTADO ACTUAL
- Header sticky con logo + status badge + user menu
- Input de activo (caja prominente para ticker) + botón ▶
- Grid 2×1 con cards A1 (azul, activos) y A2 (cyan, macro) trabajando en paralelo
- Card A3 (ámbar, técnico) — siempre visible con badge LIVE
- Card de Debate (aparece sólo si A1 o A2 detectan anomalía)
- Indicador de CONFLUENCIA: 3 filas (A3 solo / A1+A2 / Alineados) con 5 puntos cada una + barra de progreso + score % gigante
- Card A4 (violeta, sistema) — output ensamblado final
- Disclaimer pie

LO QUE FUNCIONA
- Estructura de información, jerarquía visual, identidad por agente
- Animación sweep durante scan, dot LIVE en A3

LO QUE QUIERO MEJORAR (en orden de prioridad)
1. El "wow moment" del primer scan — cuando el usuario pulsa ▶, debería sentir que está mirando un sistema de telemetría, no esperando un loader
2. El indicador de confluencia — actualmente es estático cuando llega el dato. Pídeme cómo darle vida con un "convergence reveal" cuando los tres agentes terminan
3. La card A4 (ensamblado final) — actualmente compite por atención con las demás. Debería sentirse como "la conclusión del briefing", visualmente diferenciada
4. La densidad — quiero que un trader pro pueda escanear el resultado completo en 3 segundos sin scrollear

PIDE ESPECÍFICAMENTE
- 3 variantes alternativas del indicador de confluencia (manten los 3 niveles, juega con la representación)
- Una propuesta de mini-chart embebido en la card A3 (lightweight chart de 60px alto, últimas 100 velas, soporte y resistencia anotados)
- Tratamiento de overflow cuando A1 detecta múltiples noticias relevantes
- Estado "datos sparse" (Alpha Vantage devolvió poco) — cómo comunicarlo sin que parezca un fallo del sistema
```

---

## Prompt 3 — Watchlist (lista de activos)

```
Diseña /watchlist con el sistema de diseño dado.

ESTADO ACTUAL
- Header con título "watchlist · Mi Watchlist"
- 2 stat blocks: ACTIVOS (count) · SEÑALES (count + "próximamente")
- Form: input ticker + select asset_type + botón "+"
- Lista de items: ticker + asset_type | precio actual + change % 24h | botón ▶ para analizar | × para borrar
- Mensaje vacío cuando no hay items

LO QUE FUNCIONA
- Tap en item → /analysis?ticker=X con auto-run

LO QUE QUIERO MEJORAR
1. Sparkline 7D inline por item (SVG ligero, sin Recharts) — color emerald si pos, rose si neg
2. Indicador de "última señal CMT" activa por item (banda lateral del color del nivel — urgente=rose, atención=amber, monitorear=emerald)
3. Drag-to-reorder de items (HTML5 native drag, persiste position en DB)
4. Vista alternativa "grid de tiles" para usuarios con 10+ activos — tap para alternar
5. Group by asset_type opcional (equity/crypto/forex separados con dividers)

REQUISITO DE DENSIDAD
En mobile (375px width) deben caber 6-7 items por pantalla sin scroll. En desktop (3xl breakpoint) layout 2 columnas.

PIDE ESPECÍFICAMENTE
- Cómo manejar la transición a la grid view sin layout jank
- El sparkline ideal: 60×20px, datos cada hora del último día o un punto por día de los últimos 7
- Tratamiento del item cuando no hay quote (rate limit AV) — placeholder elegante, no "no quote" en gris triste
```

---

## Prompt 4 — Pantalla SEÑALES (CMT alerts)

```
Diseña /signals — el centro de comando de alertas CMT.

ESTADO ACTUAL
- Header
- 3 stat boxes: URGENTES (rose) · ATENCIÓN (amber) · MONITOREAR (emerald)
- Botón gigante "EJECUTAR SCAN CMT ▶" que ataca /api/cmt/scan
- Lista de signals con banda lateral del color del nivel, expansión inline al tap (entrada/stop/target/R/B/indicadores/factor invalidación)
- Acciones por signal: copiar reporte · marcar leído

LO QUE QUIERO MEJORAR (orden)
1. La sensación de "centro de comando radar" cuando hay señales urgentes — la pantalla debería SENTIRSE distinta cuando hay urgentes vs cuando está vacía. Animación pulsante del fondo? Cambio del status del header? Tonalidad del void?
2. Mini-chart embebido en la signal cuando se expande, con anotaciones del nivel de entrada, stop y target dibujados (lightweight-charts con priceLine)
3. Filtros: por nivel · por ticker · por timeframe — sticky bar bajo el resumen
4. Notificación visual de signal nueva mientras la pantalla está abierta (push del realtime supabase) — toast inferior con sound opcional
5. Vista "trade journal": archivar signal con outcome (win/loss/partial/skipped) para análisis de precisión retrospectivo

REQUISITO CRÍTICO
Las urgentes deben atraer el ojo en menos de 1 segundo aún en una lista de 50 señales. Pero sin estridencia — un trader pro odia los rojos pulsando descontroladamente. Resuelve la tensión: visibles pero respetuosas.

PIDE ESPECÍFICAMENTE
- 3 variantes de la stat box "URGENTES" cuando vale 0 vs cuando vale 3+ — la transición debe sentirse significativa
- Diseño del estado "scan en curso" — no un spinner, sino una visualización del progreso por ticker
- Cómo encajar el botón "executar scan" cuando se llene de filtros — colapsar en FAB? Sticky bottom?
```

---

## Prompt 5 — Pantalla SISTEMA (telemetría)

```
Diseña /system — pantalla de telemetría del sistema A.D.A.M., audiencia: el operador.

ESTADO ACTUAL
- Card hero con logo grande + tagline + estado operativo
- Grid 2×3 de stat blocks (análisis ejecutados, señales generadas, urgentes, watchlist, confluencia media, latencia media)
- Lista de los 6 agentes con su modelo (A1/A2/A3 Sonnet, A4/Debate Opus, CMT Haiku) y dot ONLINE
- Sección "actividad reciente" con último análisis, modelo principal, data provider, cache status
- Sección "seguridad" — checks de RLS, A3 aislado, rate-limit, disclaimer

REFERENCIA EXPLÍCITA
Quiero que se sienta como el cockpit de un piloto comercial — todo visible, ningún elemento decorativo, jerarquía absoluta entre lo crítico y lo informativo.

LO QUE QUIERO MEJORAR
1. Visualización de la salud del sistema en un solo glance — un "heartbeat strip" superior con histograma simple de latencias del A4 en las últimas 24h
2. Mini-arquitectura visual del flujo: A1+A2 paralelo → (Debate?) → A4 ensambla · A3 aislado en su carril propio. Mostrar la regla del A3 aislado visualmente (línea punteada que NO conecta con A1/A2/A4 inputs)
3. Token usage tracker: $ estimado del mes, distribución por agente, % consumido del budget
4. Estado de las dependencias externas con timestamp de última verificación: Anthropic API · Alpha Vantage · Supabase · Upstash. Verde si responde en <500ms, amber si >500ms o si hay error reciente

REQUISITO
Densidad alta pero NO abrumadora. El usuario debe poder darle un vistazo de 5 segundos al despertarse y saber si tiene algo que mirar.
```

---

## Prompt 6 — Indicador de confluencia (componente único, deep dive)

```
Diseña el componente "Indicador de Confluencia" de A.D.A.M. — el más distintivo del producto.

CONCEPTO
El sistema emite 3 niveles de score:
  · A3 solo (técnico aislado) — confianza base BAJA (rojo coral)
  · A1 + A2 convergentes — confianza intermedia MEDIA (ámbar)
  · A1 + A2 + A3 alineados — confianza ALTA (verde mint)

Score total % = combinación ponderada. Niveles: 0-33% baja · 34-66% media · 67-100% alta.

ESTADO ACTUAL
Tres filas de 5 dots cada una con la fila correspondiente. Barra de progreso debajo. Score % gigante (Orbitron 30px black) con label "confianza alta/media/baja".

PIDE
1. Tres variantes radicalmente distintas — una "radar plot triangular", una "barras verticales tipo equalizer", una "constelación de orbits concéntricas". Argumenta pros/contras de cada una.
2. Animación "convergence reveal" cuando llega el dato — los dots no aparecen estáticos, sino que se "encienden" en secuencia con stagger de 80-120ms desde el centro hacia fuera.
3. Estado intermedio cuando A3 ya terminó pero A1/A2 siguen scanneando — la fila A3 solo se ilumina mientras las demás laten en espera.
4. Versión mobile XS (<375px width) que no sacrifique legibilidad
5. Versión print-friendly (PDF export del análisis) — sin color saturado, basado en texturas y peso

DEVUELVE
- 3 mockups en JSX comentado
- 1 implementación elegida con framer-motion
- Justificación de cuál escogerías para A.D.A.M. (el target es trader pro)
```

---

## Prompt 7 — Microinteracciones y motion language

```
Define el motion language completo de A.D.A.M. — el conjunto de microinteracciones que dan personalidad al producto.

PRINCIPIOS PROPUESTOS (refinar)
1. Movimiento orgánico pero CONTENIDO. Nada de springs efusivos.
2. Cualquier animación >400ms necesita justificación explícita.
3. Reducir motion en `prefers-reduced-motion: reduce`.
4. Ningún elemento decorativo se mueve — sólo se mueve lo que comunica estado.

PIDE
Diseña y especifica (con duración, easing, propiedades):

A. **Carga de agente** — desde estado idle a scanning
B. **Convergencia** — cuando los 3 agentes terminan y se calcula la confluencia
C. **Anomalía detectada en A1 o A2** — qué le pasa a la card cuando flippea de scanning a anomaly
D. **Signal URGENTE entrando** — la signal aparece desde abajo o flota desde el header? Sound?
E. **Hover en watchlist item** — qué cambia exactamente
F. **Logout** — la transición de salida (deja al usuario en /login, debe sentirse limpia)
G. **404 / Error 500** — la pantalla de error es parte del producto, no un afterthought

DEVUELVE
- Tabla con todas las microinteracciones, duración, easing, propiedades, archivo donde implementar
- Código de la 2 más críticas (B y D) con framer-motion
- Recomendación sobre si introducir Lottie animations (para qué casos) o no usar nunca
```

---

## Prompt 8 — Iteración A/B (cuando ya tienes una versión y quieres pulir)

```
Tengo esta versión actual de [pantalla X] de A.D.A.M.: [pega screenshot o código].

CRÍTICA HONESTA en formato:
1. **3 cosas que están bien** (no mientas — si todo es mediocre, dilo)
2. **3 cosas que romperían en un user test con un trader profesional de 15+ años de experiencia**
3. **Comparación brutalmente honesta con [Bloomberg / TradingView / Capital IQ]** — ¿en qué dimensiones específicas estamos por debajo?

Luego, propón **2 variantes B y C** que ataquen los 3 problemas del punto 2. NO la variante "más estilizada" — la variante que reduce fricción para el caso de uso real.

No me digas "esto está bien". Si lo está, dilo y para. Si no, dispárame.
```

---

## Prompt 9 — Generación de assets visuales (Midjourney / DALL-E)

```
Genera una imagen de marca para A.D.A.M. (no logo — atmósfera de marketing landing page).

PROMPT MIDJOURNEY V6:
"deep space mission control room at night, single trader silhouette in front of a wall of dim screens showing financial telemetry data in cyan, amber, blue and violet glowing UI elements, NASA aesthetic, brutalist minimal interior, photorealistic, depth of field, shot on Sony A7R IV 35mm f/1.4, dramatic ambient lighting, cinematic --ar 16:9 --style raw --stylize 150"

VARIANTES A PROBAR (cambiar 1 cosa por iteración):
- "single trader silhouette" → "no humans, empty control room"
- "deep space mission control" → "Bloomberg terminal trading floor 3am"  
- "cinematic" → "brutalist architecture interior"
- Aspect ratio 16:9 → 21:9 (ultrawide hero) → 4:5 (mobile hero)

NEGATIVAS (anti-cliché)
"--no neon, no cyberpunk, no purple gradients, no holograms, no AI matrix code, no candlestick chart screens, no laptop screens, no smartphone, no logo, no text, no emojis"

LANDING PAGE HERO USAGE
Imagen como fondo a 100vh con overlay degradado del void (#020610) de 70% opacidad bottom-to-top. Encima: logo A.D.A.M. Orbitron 80px + tagline + CTA "ACCEDER ▶".
```

---

## Prompt 10 — Diseño del landing page (cuando estés listo para lanzar)

```
Diseña una landing page para A.D.A.M. dirigida a hedge fund managers, family offices y traders profesionales con >€500k de capital.

NO REPETIR el patrón fintech típico:
- Sin hero "All your finances, one place"
- Sin testimonials de personas-stock-photo
- Sin "Trusted by 10,000+ users"
- Sin GIFs animados de la app dando vueltas

EN SU LUGAR
1. Hero: una sola pantalla, una afirmación, una imagen que comunique seriedad
2. "Cómo funciona" — explicación visual del sistema multi-agente en 4 cards (A1/A2/A3/A4) con la regla del A3 aislado destacada como diferenciador técnico
3. "Por qué A.D.A.M." — 3 argumentos: agentes paralelos · A3 aislado verificado por 65 tests · análisis educativo sin ejecución (no broker = sin conflicto de interés)
4. "El equipo / la metodología" — texto técnico, sin fotos sonrientes
5. CTA único al final: "Solicitar acceso" (no "Sign up free")

STRUCTURE GIVEN BY DESIGN SYSTEM PROMPT 0
Misma paleta. Misma tipografía. Pero PUEDE ser más generoso en espaciado (en landing el aire vende).

PIDE
- Wireframe ASCII de 7-8 secciones máximo
- 3 variantes del hero (texto distinto, mismo layout)
- Una sección "demo en vivo" que muestre un análisis real corriendo de AAPL — embebido con datos reales del producto
- Footer con disclaimer educativo + sección de privacidad
```

---

## Quick reference — combos típicos

| Quiero... | Combo de prompts |
|---|---|
| Empezar diseño de una nueva screen | 0 → 1/2/3/4/5 (la que toque) |
| Pulir lo existente | 0 → 8 (con screenshot) |
| Trabajar solo un componente | 0 → 6 |
| Definir el motion del producto | 0 → 7 |
| Generar marketing assets | 0 → 9 → 10 |

---

## Templates de feedback que dar a la IA después

```
La variante A del [componente] está bien pero el problema es [X]. 
Mantén [Y, Z] que sí funcionan y refactoriza [W]. 
Devuélveme una variante D que ataque [X] sin tocar [Y, Z].
```

```
Demasiado [adjetivo]. Quiero que sea [adjetivo opuesto]. 
Mantén la estructura pero baja la intensidad de [propiedad] al 40% de lo actual.
```

```
El usuario que va a usar esto NO es [perfil que estás suponiendo]. 
Es [perfil real: trader profesional 15+ años, viene de Bloomberg, lee FT, opera 6+ horas/día]. 
Reescribe el copy y los affordances con eso en mente.
```

---

**Disclaimer interno**: estos prompts asumen que la IA tiene acceso a un buen contexto visual. Si trabajas con texto-puro, adjunta siempre screenshots del estado actual o del `_reference/adam_demo.html`. El "premium mundial" se construye iterando con referencias concretas, no con adjetivos.
