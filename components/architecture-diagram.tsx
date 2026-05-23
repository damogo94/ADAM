/**
 * ArchitectureDiagram — diagrama del pipeline de A.D.A.M.
 *
 * Rediseño (sesión 2026-05): layout vertical limpio en CAPAS bien
 * separadas, mucho menos cruce de líneas, columnas izquierdas con
 * etiqueta de "capa" para que se lea como un flujo de arriba abajo.
 *
 * Capas:
 *   1. INPUT      — usuario inicia el run con un ticker
 *   2. DATA       — fuentes externas (Yahoo / Finnhub / FRED)
 *   3. COMPUTE    — math determinístico para A3 (sin LLM)
 *   4. NARRATE    — A1, A2, A3 (paralelo)
 *   5. DEBATE     — A1×A2 condicional
 *   6. CONFLUENCE — math determinístico (30/40/30)
 *   7. OUTPUT     — A4 narrate · cita A3 · disclaimer literal
 *
 * Reglas load-bearing preservadas (NO tocar sin revisión):
 *   - A3 isolation: OHLCV es el ÚNICO input que recibe (no A1/A2/news).
 *   - A4 cita textualmente a A3 (trazo grueso A3 → A4).
 *   - Compute determinístico marcado con acento emerald sutil.
 */
export function ArchitectureDiagram() {
  return (
    <div className="overflow-hidden rounded-[15px] border border-white/5 bg-black/40 p-3">
      <div className="font-mono text-[8px] uppercase tracking-wider text-white/40 mb-2">
        pipeline · compute (determinístico) + narrate (LLM)
      </div>
      <svg
        viewBox="0 0 420 480"
        className="w-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="A.D.A.M. — diagrama del pipeline"
      >
        <defs>
          {/* Flecha estándar (gris) */}
          <marker
            id="arr"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(255,255,255,0.55)" />
          </marker>
          {/* Flecha A3-strict (blanco brillante) */}
          <marker
            id="arr-strict"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(255,255,255,1)" />
          </marker>
          {/* Flecha compute (emerald) */}
          <marker
            id="arr-compute"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(52,211,153,0.95)" />
          </marker>
        </defs>

        {/* ───────── Etiquetas de CAPA (columna izquierda) ───────── */}
        <g fontFamily="Orbitron, monospace" fontSize="7" fontWeight="700" fill="rgba(255,255,255,0.35)" letterSpacing="1">
          <text x="6" y="36">INPUT</text>
          <text x="6" y="92">DATA</text>
          <text x="6" y="166">COMPUTE</text>
          <text x="6" y="232">NARRATE</text>
          <text x="6" y="312">DEBATE</text>
          <text x="6" y="372">CONFLUENCE</text>
          <text x="6" y="436">OUTPUT</text>
        </g>

        {/* Líneas guía verticales sutiles (separan capas) */}
        <g stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="2 4">
          <line x1="70" y1="50" x2="410" y2="50" />
          <line x1="70" y1="120" x2="410" y2="120" />
          <line x1="70" y1="190" x2="410" y2="190" />
          <line x1="70" y1="280" x2="410" y2="280" />
          <line x1="70" y1="340" x2="410" y2="340" />
          <line x1="70" y1="400" x2="410" y2="400" />
        </g>

        {/* ───────── 1. INPUT — Usuario ───────── */}
        <g>
          <rect x="170" y="18" width="120" height="24" rx="5" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
          <text x="230" y="34" textAnchor="middle" fill="rgba(255,255,255,0.98)" fontFamily="Orbitron, monospace" fontSize="10" fontWeight="700">USUARIO · ticker</text>
        </g>

        {/* ───────── 2. DATA — 3 cajas paralelas ───────── */}
        <g fontFamily="IBM Plex Mono, monospace">
          {/* Yahoo OHLCV — destacado: única entrada de A3 */}
          <rect x="280" y="74" width="120" height="32" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeDasharray="4 2" />
          <text x="340" y="89" textAnchor="middle" fill="rgba(255,255,255,1)" fontSize="9" fontWeight="700">Yahoo</text>
          <text x="340" y="100" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="7">OHLCV · daily + 1h</text>

          {/* Finnhub */}
          <rect x="150" y="74" width="120" height="32" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
          <text x="210" y="89" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="9" fontWeight="600">Finnhub</text>
          <text x="210" y="100" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="7">quote · fund · news</text>

          {/* FRED macro */}
          <rect x="78" y="74" width="62" height="32" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
          <text x="109" y="89" textAnchor="middle" fill="rgba(255,255,253,0.85)" fontSize="9" fontWeight="600">FRED</text>
          <text x="109" y="100" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="7">macro</text>
        </g>

        {/* ───────── 3. COMPUTE técnico — alimentado SOLO por Yahoo ───── */}
        <g>
          <rect x="280" y="138" width="120" height="36" rx="5" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.75)" strokeWidth="1.2" />
          <text x="340" y="154" textAnchor="middle" fill="rgba(52,211,153,1)" fontFamily="Orbitron, monospace" fontSize="9" fontWeight="700">computeTechnical</text>
          <text x="340" y="166" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontFamily="IBM Plex Mono, monospace" fontSize="7">SMA · EMA · ATR · niveles · patrones</text>
        </g>

        {/* ───────── 4. NARRATE — A1, A2, A3 ───────── */}
        <g fontFamily="Orbitron, monospace">
          {/* A1 */}
          <rect x="78" y="200" width="116" height="50" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <text x="136" y="220" textAnchor="middle" fill="rgba(255,255,255,1)" fontSize="14" fontWeight="700">A1</text>
          <text x="136" y="234" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontFamily="IBM Plex Mono, monospace" fontSize="7">Activos · micro</text>
          <text x="136" y="244" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontFamily="IBM Plex Mono, monospace" fontSize="6.5">Sonnet · narrate</text>

          {/* A2 */}
          <rect x="206" y="200" width="64" height="50" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <text x="238" y="220" textAnchor="middle" fill="rgba(255,255,255,1)" fontSize="14" fontWeight="700">A2</text>
          <text x="238" y="234" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontFamily="IBM Plex Mono, monospace" fontSize="7">Macro</text>
          <text x="238" y="244" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontFamily="IBM Plex Mono, monospace" fontSize="6.5">Sonnet · narrate</text>

          {/* A3 — destacado (aislado) */}
          <rect x="282" y="200" width="118" height="50" rx="6" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.95)" strokeWidth="1.6" strokeDasharray="4 2" />
          <text x="341" y="220" textAnchor="middle" fill="rgba(255,255,255,1)" fontSize="14" fontWeight="700">A3</text>
          <text x="341" y="234" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontFamily="IBM Plex Mono, monospace" fontSize="7">Price action · AISLADO</text>
          <text x="341" y="244" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontFamily="IBM Plex Mono, monospace" fontSize="6.5">Haiku · narrate</text>
        </g>

        {/* ───────── 5. DEBATE — solo si A1 o A2 detectan signal ────── */}
        <g>
          <rect x="100" y="290" width="180" height="32" rx="5" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" strokeDasharray="3 3" />
          <text x="190" y="304" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontFamily="Orbitron, monospace" fontSize="9" fontWeight="700">DEBATE A1 × A2</text>
          <text x="190" y="316" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontFamily="IBM Plex Mono, monospace" fontSize="7">condicional · si A1 o A2 flagan signal</text>
        </g>

        {/* ───────── 6. CONFLUENCE — compute determinístico ────────── */}
        <g>
          <rect x="120" y="350" width="180" height="36" rx="5" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.75)" strokeWidth="1.2" />
          <text x="210" y="366" textAnchor="middle" fill="rgba(52,211,153,1)" fontFamily="Orbitron, monospace" fontSize="10" fontWeight="700">computeConfluence</text>
          <text x="210" y="378" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontFamily="IBM Plex Mono, monospace" fontSize="7">30/40/30 · capping por agentes vivos</text>
        </g>

        {/* ───────── 7. OUTPUT — A4 ───────── */}
        <g>
          <rect x="100" y="410" width="220" height="44" rx="6" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" />
          <text x="210" y="428" textAnchor="middle" fill="rgba(255,255,255,1)" fontFamily="Orbitron, monospace" fontSize="13" fontWeight="700">A4</text>
          <text x="210" y="442" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontFamily="IBM Plex Mono, monospace" fontSize="7">narrate · cita A3 verbatim · disclaimer literal</text>
        </g>

        {/* ────────── CONEXIONES ────────── */}
        {/* USER → 3 fuentes data */}
        <g stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" fill="none">
          <path d="M 200 42 Q 200 58 109 74" markerEnd="url(#arr)" />
          <path d="M 230 42 L 210 74" markerEnd="url(#arr)" />
          <path d="M 260 42 Q 290 58 340 74" stroke="rgba(255,255,255,0.85)" strokeWidth="1.4" markerEnd="url(#arr-strict)" />
        </g>

        {/* Yahoo → computeTechnical (path A3-strict) */}
        <path d="M 340 106 L 340 138" stroke="rgba(255,255,255,0.95)" strokeWidth="1.6" fill="none" markerEnd="url(#arr-strict)" />

        {/* Finnhub → A1 + A2 */}
        <g stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" fill="none">
          <path d="M 190 106 L 140 200" markerEnd="url(#arr)" />
          <path d="M 230 106 L 240 200" markerEnd="url(#arr)" />
        </g>

        {/* FRED → A2 */}
        <path d="M 120 106 Q 180 150 222 200" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" fill="none" markerEnd="url(#arr)" />

        {/* computeTechnical → A3-narrate */}
        <path d="M 340 174 L 340 200" stroke="rgba(52,211,153,0.95)" strokeWidth="1.6" fill="none" markerEnd="url(#arr-compute)" />

        {/* A1 → DEBATE, A2 → DEBATE */}
        <g stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" strokeDasharray="3 3" fill="none">
          <path d="M 140 250 L 160 290" markerEnd="url(#arr)" />
          <path d="M 238 250 L 220 290" markerEnd="url(#arr)" />
        </g>

        {/* A1, A2, A3 → computeConfluence (todos contribuyen) */}
        <g stroke="rgba(52,211,153,0.55)" strokeWidth="0.7" fill="none">
          <path d="M 140 250 L 175 350" markerEnd="url(#arr-compute)" />
          <path d="M 238 250 L 210 350" markerEnd="url(#arr-compute)" />
          <path d="M 341 250 L 245 350" markerEnd="url(#arr-compute)" />
        </g>

        {/* DEBATE → computeConfluence */}
        <path d="M 200 322 L 210 350" stroke="rgba(52,211,153,0.55)" strokeWidth="0.7" strokeDasharray="2 2" fill="none" markerEnd="url(#arr-compute)" />

        {/* computeConfluence → A4 */}
        <path d="M 210 386 L 210 410" stroke="rgba(52,211,153,0.95)" strokeWidth="1.6" fill="none" markerEnd="url(#arr-compute)" />

        {/* A3 → A4 (trazo grueso — A4 cita verbatim) */}
        <path d="M 341 250 Q 360 330 290 410" stroke="rgba(255,255,255,0.85)" strokeWidth="1.3" fill="none" markerEnd="url(#arr-strict)" />

        {/* A1, A2 → A4 (delgados — A4 también resume A1/A2) */}
        <g stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" fill="none">
          <path d="M 140 250 Q 110 340 140 410" markerEnd="url(#arr)" />
          <path d="M 238 250 Q 230 340 200 410" markerEnd="url(#arr)" />
        </g>

        {/* A4 → USER (output devuelto) */}
        <path
          d="M 320 432 Q 405 432 405 130 Q 405 30 290 30"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="0.7"
          strokeDasharray="3 3"
          fill="none"
          markerEnd="url(#arr)"
        />

        {/* ───────── Leyenda compacta ───────── */}
        <g fontFamily="IBM Plex Mono, monospace" fontSize="7" fill="rgba(255,255,255,0.65)">
          <rect x="78" y="466" width="10" height="2" fill="rgba(52,211,153,0.95)" />
          <text x="92" y="470">compute (sin LLM)</text>

          <rect x="190" y="466" width="10" height="1.6" fill="rgba(255,255,255,0.95)" />
          <text x="204" y="470">A3 isolated · OHLCV only</text>

          <line x1="332" y1="467" x2="342" y2="467" stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeDasharray="2 2" />
          <text x="346" y="470">condicional</text>
        </g>
      </svg>
    </div>
  );
}
