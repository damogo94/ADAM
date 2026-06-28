# ADAM · PANTALLAS · AUDITORÍA FASE 0

**Alcance:** auditoría read-only del working tree vivo (main @ ef50a71). Ningún archivo modificado. Evidencia citada con `file:line`. Hallazgos de seguridad / honestidad / destructivos pasaron verificación adversarial.

**Veredicto global:** la app está fundamentalmente sana en sus invariantes duros. El aislamiento A3/EST se cumple en datos y en visual (3 capas). La defensa en profundidad de `/system` es ejemplar (barrera real en servidor, default-deny en cada capa, sin cache de auth). El firewall de color es ejemplar en `/inicio` (firewall-by-construction). La honestidad de empty states es correcta en casi toda superficie. Los problemas reales son: (1) un hueco de rate-limit en un endpoint autenticado caro; (2) tres endpoints de mercado Edge sin auth/throttle; (3) varias fugas localizadas de market-color a chrome; (4) una race de concurrencia en el toggle de Estructura; (5) deuda de docs/comentarios obsoletos. Ningún hallazgo es blocker de producción.

---

## 0.2 · MATRIZ DE PANTALLAS

| Pantalla | Propósito | Utilidad real / alcanzable | Solapamiento | Gaps de consistencia | Veredicto | Prioridad |
|---|---|---|---|---|---|---|
| **RAÍZ `/`** (`app/page.tsx`) | Redirect server-side inmediato a `/analysis`. Sin UI propia. | Funciona; alcanzable. Destino cuestionable: anónimo rebota `/`→`/analysis`→`/login`, nunca ve `/inicio`. | Ninguno funcional; conceptualmente compite con `/inicio` como primera impresión. | Comentario stale `(app)`/Sprint 2 (H8); decisión de destino no documentada. | mejorar | baja |
| **`/inicio`** (landing pública) | Explicar A.D.A.M., enseñar confianza `\|net\|·f(κ)` por manipulación directa (Instrument), convertir. | Alta como pieza pedagógica/marca; pública sin gate. Fuera del shell (correcto para landing estática). | Controlado y consciente: Instrument solo en hero; HowToRead reusa SCENARIOS sin duplicar widget. | Wordmark difiere SiteHeader (0.1em/0.95rem) vs Header app (0.2em/lg); badge "Ejemplo" oculto en móvil (hon-2). Firewall y tipografía ejemplares. | mantener | media |
| **`/analysis`** (workspace) | Análisis multiagente: input + pipeline en vivo + veredicto A4 + confluencia/κ + radar; Estructura opt-in como 4ª pata. | Alta; gated; shell persistente (RunProvider/RadarProvider) sobrevive soft-nav. CTAs post-resolve cierran loop con CMT. | VerdictBar+ConfluenceHero+A4Card = misma cifra en 3 piezas, intencional y coordinado. | Divergencia transitoria A4-sin-A2 (hon-3); rail sin marca provisional (hon-2); fetch del toggle EST sin AbortSignal (rob-3). | mantener | alta |
| **`/watchlist`** (workspace) | Radar de favoritos: estado consolidado por activo + CRUD optimista + digest. | Alta; vista principal del shell; comparte RadarProvider (1 fetch/sesión). | Solapa con `/signals` en capa de señal CMT activa — complementario, no dañino (radar=estado vigente, signals=histórico). | Firewall roto: rose como chrome destructivo (modal/×); `bg-white` sólido como estado activo; `text-white/X` (deuda SSOT). | mantener | alta |
| **`/signals`** (FUERA de workspace) | Única superficie del scanner CMT: historial + track-record real + scan manual ≤5. | Alcanzable, dueño claro (operador CMT). NO en shell: refetch propio en cada soft-nav. | Bajo-medio: solapa solo en señal-activa como dato; el panel de scan re-fetchea `/api/watchlist` que el shell ya tiene. | Fuera de (workspace) pese a gated; timestamp HH:MM sin fecha (multi-día); 713 líneas monolíticas. | mejorar | media |
| **`/estructura`** (FUERA de workspace) | Deep-dive dedicado del Agente de Estructura (price-action MTF), standalone sin A4. | Alcanzable con público real, pero invisible: NO en bottom-nav; solo link de texto desde `/analysis`. | Solapa con toggle "Sumar Estructura": MISMO endpoint, MISMO componente, MISMO agente. Divergen en confluencia/A4. | Fuera de shell (pierde persistencia); rose/emerald en etiquetas STOP/OBJETIVO; tagline override; disclaimer duplicado. | mejorar | media |
| **`/system`** (FUERA de workspace) | Consola interna admin: métricas/coste por agente, calibración, consola usuarios, inventario. | Alcanzable solo por allowlist `system_access` (default-deny en 3 capas). Para owner/operador. | Parcial con `/signals` y métrica de confluencia, pero a nivel agregado/cross-user — no redundante. | Firewall roto (emerald/rose/amber como chrome de estado); stats sin skeleton (ceros transitorios); cifras hardcodeadas (692 tests, 13 policies). | mejorar | media |
| **auth `/login` `/signup`** | Entrada a la app gated; Supabase Auth client-side con redirect validado. | Alcanzable, necesaria; único camino a rutas gated. Fuera de shell (correcto, pre-sesión). | login/signup duplican ~90% markup sin componente compartido. | Typo `Modular`/`Module`; botón blanco sólido + `text-white/X` (contradice neutral-premium+accent); taglines en inglés sobre UI en español; comentario falso "sin bottom-nav". | mejorar | media |

---

## 0.3 · REGISTROS

### A · ESTRUCTURAL (shell, navegación, redundancia)

**Shell (workspace) — corrección confirmada.** La extracción `page.tsx → run-provider.tsx + radar-provider.tsx + lib/run/{types,apply-event}` quedó **limpia** (H8 refutada a nivel de código): `page.tsx` importa solo lo que usa, ningún estado del run quedó duplicado/huérfano, el reductor `applyRunEvent` es puro y no fabrica `done` (rob-6, rob-8 confirmados positivos). AbortController preservado en el camino principal del run (chequeo `aborted` tras cada await). Único residuo: comentario en futuro en `lib/run/types.ts:16` (deuda-8, nit).

**Posicionamiento de rutas gated fuera del shell (H1 parcial, asimétrico):**
- **`/signals` → candidato fuerte a entrar en (workspace).** Refetch `/api/watchlist` (signals/page.tsx:140) del mismo dominio que RadarProvider ya persiste (radar-provider.tsx:83-88, el doble-fetch que el shell fue creado para matar); pierde sus señales en cada soft-nav (est-1, est-2, sig-h1-1). No necesita RunProvider pero el shell lo provee sin coste en idle. **Decisión de posicionamiento del owner**, no fix mecánico.
- **`/estructura` → debe QUEDARSE fuera.** Estado puramente local, sin dominio compartido con el radar, vista de un agente aislado OHLCV-only; meterla bajo RunProvider contradiría su aislamiento by-design (est-3). La asimetría con /signals es correcta.

**Navegación — dos incoherencias reales de chrome:**
- **`/estructura` huérfana de bottom-nav** (est-4, util-2): gated de 1ª clase, solo alcanzable por link de texto en analysis/page.tsx:129-134. Raíz del solapamiento con el toggle.
- **BottomNav montado en ROOT layout** (`app/layout.tsx:35`) se renderiza sobre `/inicio` y `/login`/`/signup`; el comentario de `app/(auth)/layout.tsx:5` "Reemplaza el layout raíz: sin bottom-nav" es **falso** (un route-group layout se anida, no reemplaza). est-5, deuda-4, hon-2(auth) confirmados.

**Dos sistemas de cabecera — coherente por diseño** (est-6, falso-positivo): Header (5 gated) vs SiteHeader (/inicio) vs auth-sin-header es separación legítima de contextos. SiteHeader es el ejemplar correcto (`text-ink/58`, cero `text-white`); Header arrastra la deuda `text-white/X`. Única divergencia de identidad real: el wordmark salta de tracking/tamaño al cruzar landing→workspace (estr-1).

**Redundancia (H6 parcial):**
- **(a) `/estructura` dedicada vs toggle de Estructura = MISMA capacidad** (red-1, red-relacionados confirmados). Mismo endpoint `/api/agents/estructura`, mismo body `{ticker}`, mismo `<EstructuraCard>`, mismo schema. La dedicada NO aporta capacidad técnica extra salvo (1) deep-link compartible `/estructura?ticker=X` y (2) lienzo aislado. El toggle, en cambio, suma la pata a confluencia y re-narra A4 — algo que la dedicada NO hace. **Acción: mantener ambas, deduplicar el fetch, adelgazar la dedicada a wrapper.** El camino destructivo (quitar la pantalla, red-2) requiere aprobación del owner y rompe el deep-link.
- **(b) `/signals` vs radar de `/watchlist` = NO redundantes, se complementan** (red-3, sig-h6-1 confirmados). El radar surface SOLO `latest_unacked_signal` (RadarSignal nullable); `/signals` es el libro histórico + track-record (win/loss/timeout, hit-rate, R medio, ack, scan). Quitar cualquiera pierde capacidad. **Mantener ambas; clarificar copy.** Único solape colapsable: la fuente de la lista de activos del scan (si /signals entrara al shell).
- **Triggers de scan distintos** (red-4): "Fijar alerta CMT" (/analysis, solo añade al radar) vs "EJECUTAR SCAN" (/signals, escanea ya). No fusionar; reforzar wording.

**Duplicación de fetch del agente Estructura** (est-4-estructura confirmado, nit): `estructura/page.tsx:55-60` ≈ `run-provider.tsx:38-43` (sobre de request idéntico). El remedio propuesto en el hallazgo ("extraer `agents/estructura/client.ts` como otros agentes") está **mal dirigido**: los `client.ts` de A3/debate son clientes server-side del SDK Anthropic, no wrappers de fetch del browser. Si se quisiera DRY, un helper en `lib/` (`postEstructura(ticker, signal)`) dejando el manejo de error/abort en cada caller.

### B · VISUAL / VOZ

**B.1 · Agnóstico de posicionamiento (accionable ya — el fork prosumer/educativo está RESUELTO, modo eliminado, glosa permanente, H7):**

| ID | Hallazgo | Evidencia | Sev |
|---|---|---|---|
| vis-1 (system) | Firewall roto: `text-emerald` como verde genérico de OK/activo/éxito en chrome admin (checklist seguridad, pipeline, badge hybrid, hit-rate global, coste USD). | `app/system/page.tsx:352-359, 318-319, 305, 333, 166, 143` | media |
| vis-2 (system) | `text-amber` en "confluencia media" + `text-rose` en "urgentes" sobre KPIs agregados, no dirección de mercado en vivo. El autor SÍ conoce la regla (page:391-392 quitó rose del stat enfático). | `app/system/page.tsx:129,133` | baja |
| vis-2 (H7) | Firewall roto: `text-rose` en "cerrar sesión" (chrome de cuenta). Avatar usa `text-a1`/`border-a1/40` (indirección muerta, a1==ink). | `components/user-menu.tsx:58` | media |
| vis-3 (H7) | Firewall roto: `emerald` para etiquetar nodos "compute · sin LLM" en diagrama de arquitectura (decoración de sistema, no dato de mercado). | `components/architecture-diagram.tsx:38,62,220` | media |
| vis-4 (H7) | Firewall borderline: `text-rose` para error de sistema en users-console (interno, baja exposición). | `components/system/users-console.tsx:159` | baja |
| vis-1 (watchlist) | Firewall roto: `rose` como chrome destructivo en modal de borrado + × de fila. | `app/(workspace)/watchlist/page.tsx:357,360,374-377`; `radar-row.tsx:281` | media |
| est-3 (estructura) | `text-rose`/`text-emerald` sobre etiquetas ▼STOP/▲OBJETIVO; STOP siempre rose y OBJETIVO siempre emerald sea cual sea la dirección del setup. | `components/agents/estructura-card.tsx:131-132` | baja |
| vis-2 (watchlist) | `bg-white` sólido como estado-activo/CTA (botón +, toggle rango) en vez de accent. | `app/(workspace)/watchlist/page.tsx:256,297` | baja |
| vis-1 (auth) | Botón blanco sólido + `text-white/X` (contradice neutral-premium+accent; B&W superseded). | `app/(auth)/login/page.tsx:101-107` | baja |
| vis-1 (global-error) | `global-error.tsx` usa paleta ANTIGUA: void azulado `#020610`, blue-500 `#3b82f6`, slate `#94a3b8` — no la SSOT (`#0B0B0D`/`#5B8AF0`/`#F5F5F7`). Estilos inline (sobrevive a fallo de build) → fix manual. | `app/global-error.tsx:28-29,49,57-58` | media |
| vis-5 (H7) | Deuda `text-white/X` (253×, 24 componentes) vs ink SSOT, mezclada con ink en el MISMO archivo (verdict-bar). | `components/verdict-bar.tsx:51,54,59,63,73`; `header.tsx` | baja |
| vis-6 (H7) | Tokens per-agente a1..a4 = indirección muerta (todos == ink), aún referenciados en chrome (9 usos, 3 archivos). | `tailwind.config.ts:43-46` | nit |
| vis-7 (H7) | Comentario stale en glosario: referencia el "modo educativo" ya eliminado. | `lib/lens/glossary.ts:10-11` | nit |
| vis-2 (auth) | Taglines en inglés sobre UI en español ("Detect the unseen", "Access is earned."). | `app/(auth)/login/page.tsx:60,69`; `signup:61` | nit |

**B.2 · Bloqueado por posicionamiento (decisión del owner):**

| ID | Hallazgo | Evidencia | blocked_by |
|---|---|---|---|
| vis-8 (H7) | Cobertura del glosario lens: términos de alta fricción (κ, accionable, confluencia, FLIP) podrían no estar envueltos en `<Glossed>` en las gated. Passthrough silencioso. | `lib/lens/glossary.ts:20-111` | posicionamiento (cuánto glosar) |
| util-1 (inicio) | CTA primario apunta a `/analysis` (gated) → anónimo rebota a /login; no hay "Crear cuenta" como acción primaria. | `components/inicio/hero.tsx:93` | posicionamiento (conversión) |
| est-7 (estructura) | El plan SL/BE/TP se muestra crudo sin la capa confluencia/κ de A4 → menos fricción que /analysis. | `app/estructura/page.tsx:130-132` | posicionamiento |

**Confirmado SANO (vis-9, descargas del eje):** tokens void/surface/ink/accent coinciden EXACTAMENTE entre `tailwind.config.ts:26-38` y `globals.css:11-18` (divergencia azulado-vs-neutro cerrada); Orbitron retirado del código (solo en docs/_reference); wordmark Inter font-extrabold; `components/inicio/lib/tone.ts` es firewall-by-construction modelo (emerald/rose/amber derivados de VERDICT_TONE, hex==SSOT, glyphs ▲▼◆ + palabra); decoración (Grain/Graticule/SignalTrace) es chrome puro accent/ink con degradación reduced-motion (vis-1/2/3 inicio); mini-candle-chart usa hex de lightweight-charts (no Tailwind) respetando semántica up/down (nit cosmético).

### C · VULNERABILIDADES POR CLASE

**Honestidad (invariante #1 — esencialmente sano, H5 confirmada):**
- **NO existen phantom signals en superficie de usuario.** `change_pct_7d` es nullable por timestamp → UI pinta "n/d" (a1-card.tsx:92), prompt A1 prohíbe inferir consolidación de null. Núcleo del hero capado en 0.92, nunca muestra %accionable/veredicto/κ hasta `resolved` (confluence-hero.tsx:112,188,192). Empty states honestos en watchlist (hon-1), signals (sig-pos-1), estructura (est-6). Reductor puro no fabrica `done` (rob-6).
- **hon-1 (eje-honestidad, baja):** `change_pct_7d: 0` hardcodeado en stubs de A2 (`a2/route.ts:66`, `a2-reconcile/route.ts:65`) contradice el contrato nullable. **Inofensivo HOY** (narrateA2 solo lee macro_snapshot), riesgo de regresión latente. Fix trivial: usar null.
- **hon-2 (eje-honestidad, baja):** `changePct24h = q?.change_pct_24h ?? 0` (`snapshot.ts:114`, auto-confesado L111-113). A diferencia de 7d, 24h NO es nullable y la UI lo pinta SIEMPRE emerald/rose sin guard "n/d" (a1-card.tsx:83,89). En el borde (quote caído + exactamente 1 vela, o quote sin 24h) se ve "0.00% verde" como consolidación real. Ventana estrecha, blast radius = una card A1. **Corrección de ruta:** el archivo vivo es `components/agents/a1-card.tsx`, no `components/analysis/`.
- **hon-3 (/analysis, media):** `reconsolidateA4` best-effort silencioso (run-provider.tsx:110,113). En first-run A2 frío + fallo de re-narración, el A4 horneado-sin-A2 (resumen_a2 "A2 no disponible", dirección/acción posiblemente desfasadas) queda junto a un A2Card ya poblado. La CIFRA se mitiga client-side; el resto del A4 no. Requiere doble evento, auto-resuelve al re-analizar, conocido (MEMORY first-run gap). No es phantom (es computación real stale).
- **sys-1 (/system, baja):** GET `/api/system` consulta `analyses_log` con client de SESIÓN sin `.eq('user_id')` → RLS own-row lo capa a las filas del propio admin, pero la consola presenta esas métricas como GLOBALES (analyses_total, coste, tokens). NO es fuga (RLS protege); es métrica engañosa junto a `get_users_overview` que SÍ es global. Inconsistencia interna: signals_total/watchlist_tickers SÍ filtran por userId. Fix: client admin o etiquetar "tus" métricas.
- **hon-1 (signup, baja):** user enumeration — `setError(error.message)` crudo de Supabase signUp distingue "User already registered". Mapear a mensaje neutro.
- **sig-hon-1 (/signals, media):** timestamp HH:MM sin fecha en historial multi-día (`signals/page.tsx:602`). Señal vieja parece fresca. No phantom (lossy), pero toca honestidad temporal.

**Seguridad (authz/default-deny intacto; rate-limit con 2 huecos reales — H2 parcial):**
- **sec-1 / sig-sec-1 (cmt/scan, media→alta):** POST `/api/cmt/scan` path manual (handleManual) tiene checkSameOrigin + getUser pero **NO rateLimitByIP** — único mutante cookie-auth caro sin throttle. `runScanLoop` itera la watchlist con sleep 1s/ticker + fan-out Yahoo daily('1y')+intraday, maxDuration=60. El path por defecto sin body NO tiene cap (el cap de 5 solo aplica al body `{tickers}`); sin límite per-user/día. Un usuario autenticado puede martillear POSTs y retener lambdas Hobby. DoS auto-infligido, sin exfiltración. **Fix:** `rateLimitByIP(req,'analysis')` antes del loop. *(Verificación adversarial fijó MEDIA por la barrera de auth; el barrido seguridad y signals lo elevaron a ALTA por la asimetría exacta con todos los hermanos + amplificador 1s/ticker + ausencia de cap en el path por defecto. Lo tratamos como crítico operativo.)*
- **sec-2 (market Edge, media):** `market/{quote,quotes,news}` declaran `runtime='edge'` → NO pueden usar rateLimitByIP (@upstash/redis no Edge-compatible) y quedan sin auth ni throttle. Su gemelo `sparklines` (Node) SÍ lleva `rateLimitByIP('quote')`. Datos públicos (no fuga), mitigado por zod+cap 20+Cache-Control, pero superficie DoS/coste. **Fix:** portar a `runtime='nodejs'` + rateLimitByIP como sparklines.
- **sec-1/sec-3/sec-2-watchlist (watchlist/[itemId], baja-media):** DELETE/PATCH filtran solo por `id`, sin `.eq('user_id')` — 100% dependientes de RLS (que existe y es correcta, 0001:168-177). Asimetría: `signals/[id]/ack:29` SÍ aplica el filtro de defensa-en-profundidad y el endpoint DESTRUCTIVO carece de él. `watchlist_items` no tiene user_id directo (cuelga de watchlist_id) → requiere subselect. NO explotable hoy. DELETE además trata 0-filas como éxito (sin 404).
- **sec-cron-1 (cron, nit):** comparación Bearer con `!==` (no constant-time) en las 5 rutas cron. Riesgo práctico muy bajo (alta entropía + jitter de red). Fix: helper `lib/cron-auth.ts` con `timingSafeEqual`.
- **sec-cron-2 (cron, nit):** gate de auth cron duplicado byte-equivalente 5×. Extraer `requireCronSecret(req)` hace el invariante visible por ausencia.
- **sys-3 (/system, baja):** `error.message` de Postgres propagado al cliente (`detail`) en users/users[id]/analyses[id]. Acceso ya limitado a allowlist. Loguear en servidor, código genérico al cliente.
- **sec-4 (rate-limit model, nit):** bucket 'quote' sin cap diario (solo 60/min) — decisión consciente, contexto del modelo RL.

**Seguridad — CONFIRMACIONES POSITIVAS (fortalezas a preservar):**
- **H3 confirmada:** las 5 crons exigen CRON_SECRET Bearer, fail-closed (500 si falta el secreto, 401 si no coincide). Sin ruta de bypass.
- **H4 / sec-5 / sys-2 confirmadas:** `/system` blindado en SERVIDOR, no solo middleware. `app/system/layout.tsx` re-verifica getUser+isSystemAuthorized por request (force-dynamic, sin cache). Las 5 APIs llaman `requireSystemApi()` antes de tocar DB (aplica aun llamando la API directa). RPCs `get_users_overview`/`get_user_activity` son SECURITY DEFINER que revalidan la allowlist en su 1ª línea + `is_system_authorized()` con search_path fijo + `system_access` con RLS sin policies de select (no enumerable). `isSystemAuthorized` default-deny ante cualquier error. Sin cache de auth (getUser valida JWT por request → revocar corta acceso inmediato). Cubierto por tests default-deny+gate. Único matiz: para `calibration` y `analyses/[id]` (service-role) `requireSystemApi` es la ÚNICA red — preservar esa llamada es invariante de mantenimiento (sec-2 system).

**Aislamiento A3/EST (invariante #2 — CUMPLIDO en datos Y visual):**
- **iso-1 (A3 card):** A3Card solo renderiza campos OHLCV-derivados; `rango_52s` viene de `computeTechnical`, NO del week52High/Low de Yahoo. Ningún prop A1/A2/macro/news entra. (Confirmado; caveat: ruta viva `components/agents/a1-card.tsx`).
- **iso-1 (radar):** distancias derivan solo de `a3_entry/stop/target` (normalize.ts:64-68, cero datos Yahoo); `computeDivergence` excluye A4 explícitamente; AxisCell "A3 aislado" marcado border-dashed. (Caveat: `compute-distances.ts`/`build-row.ts` viven en `lib/radar/`, no `components/watchlist/`).
- **est-5 (EST, 3 capas + visual):** `route.ts:20-29` `.strict()` solo `{ticker}`; `narrate.ts`/`compute.ts` guard `CLAVES_PERMITIDAS` lanza ante clave extra (lockeado por tests); fetch solo `fallbackDaily('1y')+fallbackIntraday`, nunca overview/news/macro. Grep: cero week52/VIX/fearGreed/sentiment. `vanillaWalls` es 4ª clave permitida (strikes opciones Fase 3, hoy sin poblar) — NO una fuga. **week52High/Low de Yahoo NO fluye a EST.**
- **H5 colateral:** `finnhub.week52_high/low` tiene CERO consumidores fuera de su definición; el pipeline pasa a A3 solo `{ticker,ohlcv,timeframe,intraday}` con guard runtime (pipeline.ts:233-241).

**Robustez:**
- **rob-1 (run-provider, media):** `toggleEstructura` lanza `fetchEstructura` + `reconsolidateA4` SIN el AbortController del run; el setState de A4 (línea 112) NO guarda `aborted` ni `ticker`. Secuencia: toggle EST sobre X → handleRun(Y) → al volver el A4 re-narrado de X **sobrescribe el state.a4 del run Y** (contaminación cross-ticker en UI). Trigger estrecho, blast radius UI-only (la fila persistida usa analysisId → escribe en la fila de X, no corrompe DB). rob-2/rob-3 son la misma raíz (call-site del toggle no propaga signal). rob-3 (run-provider/analysis): es el único fetch del provider sin versionar.
- **rob-3 (isLoading ignora EST, media):** `isLoading` se deriva solo de a1/a2/a3; EST puede seguir scanning tras resolver A1/A2/A3 → AssetInput y Re-analizar se rehabilitan con la 4ª pata en vuelo → combinado con rob-1 abre la ventana de la race.
- **rob-1 (watchlist, media):** `onTogglePin` hace setRadar optimista + `void reload()` silencioso que reemplaza el radar entero → parpadeo de orden si hay pins/deletes concurrentes. No corrompe datos.
- **rob-4 (radar 401, baja):** 401 en RadarProvider.reload navega a /login sin setear error/radar; degradación silenciosa OK en /analysis, pero /watchlist queda vacío sin mensaje si el push tarda. Guard explícito recomendado.
- **rob-5 (nit):** doble await de estPromise (190 y 270) es seguro; nit de legibilidad.
- **hon-3/H5 (ventana de velas, media):** la garantía ≥205 velas (SMA200/golden-death/rango_52s) está sana (1y≈252 + slice(-300)) pero vive SOLO en comentarios; los unit tests alimentan velas directamente a computeTechnical, saltándose fetch+slice. Una regresión a '3mo' pasaría CI en verde y mataría SMA200/cruces/rango_52s en prod. **Fix:** test que mockee fallbackDaily con ~252 velas y asserte snapshot length≥205.

**Confirmaciones positivas robustez:** rob-6 (reductor puro no fabrica done), rob-7 (manejo de error por tono + firewall respetado en caja de error: severidad por intensidad de blanco, no market-color), rob-8 (AbortController preservado en camino principal — única brecha el toggle).

**No asesoramiento (invariante #4 — CUMPLIDO):**
- util-1 (/analysis): CTAs post-resolve son acciones de producto, ninguna directiva compra/vende; accion_sugerida A4 verbatim; footer educativo.
- adv-1 (watchlist): "accionable ahora · LONG/SHORT" es señal técnica derivada de A3/A4 (no CTA), término glosado, footer educativo, sin botón de orden. Cumple; vigilar copy si se intensifica el visual.
- est-7 (estructura): plan como dato estructural educativo + DISCLAIMER_LITERAL; nota: sin la capa A4, da el plan con menos fricción.

### DEUDA / DOCS

| ID | Hallazgo | Evidencia | Sev |
|---|---|---|---|
| deuda-1 | `agents/a1/narrate.ts` cabecera cita `client.ts runA1` + `/api/agents/a1` ya BORRADOS; describe migración futura ya ocurrida. Comentario activamente engañoso. | `agents/a1/narrate.ts:11-15` | media |
| deuda-2 | CLAUDE.md:62 "First-run A2 gap" obsoleta: afirma que el re-narrate NO persiste, pero SÍ lo hace vía analysisId (`a4/route.ts:51,86-100`, `consolidate.ts:64-85`). Miente sobre garantía de honestidad de datos. | `CLAUDE.md:62` | baja |
| deuda-3 | CLAUDE.md:24 nombra `feature/estetica` como rama de trabajo; esa rama no existe (patrón real feat/*, redesign/*). | `CLAUDE.md:24` | baja |
| deuda-4 / hon-2(auth) | Comentario falso `(auth)/layout.tsx:5` "Reemplaza el layout raíz: sin bottom-nav" — BottomNav del root SÍ se renderiza. | `app/(auth)/layout.tsx:5` | baja |
| deuda-5 / est-1(auth) | Typo `Modular` (signup:55) vs `Module` (login:63) — rompe el acrónimo A.D.A.M. en la pantalla de registro. | `app/(auth)/signup/page.tsx:55` | baja |
| deuda-6 | `.env.example` define `CRON_SECRET` dos veces (líneas 35 y 53); dotenv toma silenciosamente la última. | `.env.example:35,53` | nit |
| deuda-7 / hon-1(raíz) | `app/page.tsx:3` comentario obsoleto "Sprint 2 → /(app)/analysis"; grupo real es (workspace), migración ya hecha. | `app/page.tsx:3` | baja |
| deuda-8 | `lib/run/types.ts:16` comentario en futuro ("se elevará a un provider") tras completarse la extracción. | `lib/run/types.ts:16` | nit |
| deuda-9 | `design/example.ts` copia casi byte-idéntica de `components/inicio/example.ts` (ya divergieron 1 línea); dos SSOT del modelo de escenarios. design/ excluido del build. | `design/example.ts:1-197` | baja |
| deuda-10 | `type Example = Scenario` @deprecated sin un solo importador (dead export, ×2). | `components/inicio/example.ts:79-80` | nit |
| sig-deuda-1 | `/signals` 713 líneas, 11 subcomponentes inline; helpers puros (computeTrackRecord/trackStatus) testeables enterrados. | `app/signals/page.tsx:1-713` | baja |
| deuda-1(raíz) | `redirect('/analysis')` literal sin constante compartida (reaparece en middleware). | `app/page.tsx:8` | nit |
| est-8 | Onboarding + footer educativo hardcodeados solo en /estructura; toggle inline no los muestra. | `app/estructura/page.tsx:137-166` | nit |

---

## 0.4 · BACKLOG PRIORIZADO

Ver array `backlog` adjunto. Resumen: 1 crítico operativo (sec-cmt-scan), 4 altos (market Edge, firewall watchlist, race toggle EST, test ventana velas), resto medio/bajo. Marcados `destructive` y `blocked_by` donde aplica.

---

## H1–H8 · VEREDICTOS

**H8 — CONFIRMADA (luego matizada).** El comentario `app/page.tsx:3` está obsoleto en dos frentes: grupo real `(workspace)` no `(app)`, y "Sprint 2" ya pasó. PERO el resto de H8 (dead code residual de la extracción page.tsx→run-provider) se **REFUTA a nivel de código**: la extracción quedó limpia (page.tsx importa solo lo usado, ningún estado huérfano, run-provider sin imports muertos). El único residuo de ESA extracción es `lib/run/types.ts:16`. La deuda real de dead-code/stale-doc vive en otros sitios (agents/a1/narrate.ts, CLAUDE.md, (auth)/layout.tsx, dos example.ts). *Veredicto: comentario raíz obsoleto SÍ; dead-code de la extracción NO.*

**H1 — PARCIAL (asimétrico).** `/signals` SÍ es candidato fuerte a (workspace) — refetch del mismo dominio que RadarProvider persiste, pierde estado en soft-nav. `/estructura` NO debe entrar — aislamiento standalone by-design. Coherencia de chrome: Header consistente en las 5 gated; las dos incoherencias reales son /estructura sin bottom-nav y BottomNav global sobre /inicio+auth. *Decisión de posicionamiento del owner, no fix mecánico.*

**H6 — PARCIAL / REFUTADA como "quitar una".** Par (a) /estructura vs toggle: redundancia real de superficie (mismo endpoint/componente/agente) pero divergen en confluencia/A4 — **mantener ambas, deduplicar, no borrar** (destructivo injustificado sin aprobación owner). Par (b) /signals vs radar: NO redundantes, complementarios (radar=señal vigente, signals=histórico+track-record). *Solo (a) justifica acción; (b) no.*

**H4 — CONFIRMADA.** Defensa en profundidad de /system ejemplar: barrera REAL en servidor (layout re-verifica por request, las 5 APIs llaman requireSystemApi antes de DB, RPCs DEFINER revalidan allowlist, default-deny ante todo error, sin cache de auth, system_access no enumerable). El middleware es solo primer filtro UX. Único matiz: para los 2 endpoints service-role, requireSystemApi es la única red. Defecto menor no-de-seguridad: sys-1 (métricas "globales" que son del propio admin por RLS).

**H2 — PARCIAL.** Authz/default-deny **intacto** en toda superficie sensible (mutantes cookie-auth con CSRF+getUser+zod; /system con requireSystemApi; 5 crons con Bearer fail-closed). PERO la migración rate-limit middleware→Node dejó **2 huecos reales**: (1) cmt/scan path manual sin rateLimitByIP (autenticado, caro), (2) market/quote+quotes+news Edge sin auth NI throttle (causa raíz estructural: @upstash/redis no Edge-compatible). No es fuga de datos privados; es superficie DoS/coste.

**H3 — CONFIRMADA.** Las 5 crons exigen CRON_SECRET y son default-deny (500 sin secreto, 401 sin match exacto). Sin bypass por query-param/header/short-circuit. Observaciones menores no-bloqueantes: comparación no constant-time (sec-cron-1) y gate duplicado 5× (sec-cron-2).

**H5 — CONFIRMADA (eje honestidad sano).** NO existen phantom signals en superficie de usuario: change_pct_7d nullable→"n/d", núcleo capado 0.92 sin %real/veredicto/κ hasta resolved, empty states honestos, reductor puro no fabrica done. Aislamiento A3 cumplido (week52 no fluye a A3). Ventana de velas 1y+slice≥205 satisface SMA200/cross/rango_52s. Residuos: anti-patrones latentes (7d:0 stub, 24h ?? 0) que hoy no alcanzan al usuario + falta de test de la ventana de velas en el path fetch+slice.

**H7 — PARCIAL (fork RESUELTO).** El toggle prosumer/educativo fue ELIMINADO y la glosa es PERMANENTE (`glossed.tsx:6-12`) → la mayoría de hallazgos visuales quedan DESBLOQUEADOS. Solo sigue siendo posicionamiento la COBERTURA del glosario y el tono de copy. El firewall está mayormente sano y ejemplar en /inicio; tokens coinciden exacto; Orbitron retirado. Persisten 3 fugas de market-color en chrome (user-menu, architecture-diagram, users-console) + global-error con paleta antigua + deuda text-white/X (253×). De ahí "parcial".

---

## NOTA DE POSICIONAMIENTO (G1)

El fork P-A (agnóstico) vs P-B (forcing function) bloquea **poco**. La realidad del working tree es que **el fork principal ya está resuelto por construcción**: el modo prosumer/educativo fue eliminado y la glosa es permanente (H7), de modo que la inmensa mayoría de hallazgos visuales/voz son **accionables YA sin esperar a G1**. Solo 3 ítems quedan genuinamente bloqueados por posicionamiento: cobertura del glosario (cuánto glosar), conversión de la landing (CTA→signup vs CTA→analysis), y si /signals entra al shell. Recomendación: **proceder con P-A (agnóstico)** — el GATE no necesita esperar la decisión de fork para limpiar firewall, deuda de docs y los huecos de seguridad/robustez, que son agnósticos al tono del producto. Reservar la conversación de posicionamiento para los 3 ítems marcados `blocked_by: posicionamiento` y para la decisión destructiva de /estructura (red-2). En otras palabras: G1 no es una forcing function que bloquee G2/G3; el 90% del backlog avanza sin él.