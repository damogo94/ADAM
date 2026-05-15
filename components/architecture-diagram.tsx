/**
 * ArchitectureDiagram — SVG estático del flujo del sistema.
 *
 * Sesión Refactor F1+F2 (2026-05):
 *   El diagrama refleja la arquitectura POST-refactor:
 *   - COMPUTE layer (determinístico, sin LLM): computeTechnical para A3,
 *     computeConfluence para A4. Visualmente: rectángulo emerald-tinted.
 *   - NARRATE layer (LLM, solo prosa): A1, A2, A3-narrate, A4-narrate,
 *     Debate. Visualmente: rectángulo blanco (como antes).
 *
 * Re-skin B&W con un único acento: emerald muy tenue (border + bg)
 * SOLO para identificar el compute layer determinístico. Esto comunica
 * la novedad arquitectónica sin volver al color-por-agente del original.
 *
 * Reglas load-bearing preservadas:
 *   - A3 NO recibe flujo de A1/A2/Debate (aislamiento)
 *   - El usuario es comandante único de A3 (trazo grueso USER→OHLCV)
 *   - A4 cita textualmente a A3 (trazo grueso A3→A4)
 *
 * Nuevo en este diagrama:
 *   - "compute" como caja explícita junto a A3-narrate y antes de A4
 *   - Trazo "confluence" determinístico entrando en A4
 */
export function ArchitectureDiagram() {
  return (
    <div className="overflow-hidden rounded-[15px] border border-white/5 bg-black/40 p-3">
      <div className="font-mono text-[8px] uppercase tracking-wider text-white/40 mb-2">
        flujo de procesamiento · compute (determinístico) + narrate (LLM)
      </div>
      <svg
        viewBox="0 0 400 320"
        className="w-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Architecture diagram"
      >
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.45)" />
          </marker>
          <marker id="arrow-a3" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.95)" />
          </marker>
          <marker
            id="arrow-compute"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(52,211,153,0.85)" />
          </marker>
        </defs>

        {/* USUARIO */}
        <g>
          <rect
            x="160"
            y="6"
            width="80"
            height="22"
            rx="4"
            fill="rgba(255,255,255,0.05)"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1"
          />
          <text
            x="200"
            y="21"
            textAnchor="middle"
            fill="rgba(255,255,255,0.95)"
            fontFamily="Orbitron, monospace"
            fontSize="9"
            fontWeight="700"
          >
            USUARIO
          </text>
        </g>

        {/* DATA SOURCES — fila 1 */}
        <g>
          <rect
            x="15"
            y="48"
            width="100"
            height="20"
            rx="3"
            fill="rgba(255,255,255,0.03)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.5"
          />
          <text
            x="65"
            y="61"
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="8"
          >
            Finnhub: quote+news
          </text>
          <rect
            x="120"
            y="48"
            width="80"
            height="20"
            rx="3"
            fill="rgba(255,255,255,0.03)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.5"
          />
          <text
            x="160"
            y="61"
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="8"
          >
            macro snapshot
          </text>
          <rect
            x="205"
            y="48"
            width="80"
            height="20"
            rx="3"
            fill="rgba(255,255,255,0.05)"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1"
            strokeDasharray="3 2"
          />
          <text
            x="245"
            y="61"
            textAnchor="middle"
            fill="rgba(255,255,255,0.95)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="8"
            fontWeight="600"
          >
            Yahoo: OHLCV only
          </text>
        </g>

        {/* COMPUTE LAYER — para A3 (entre data y narrate) */}
        <g>
          <rect
            x="205"
            y="82"
            width="80"
            height="22"
            rx="4"
            fill="rgba(52,211,153,0.06)"
            stroke="rgba(52,211,153,0.65)"
            strokeWidth="1"
          />
          <text
            x="245"
            y="92"
            textAnchor="middle"
            fill="rgba(52,211,153,0.95)"
            fontFamily="Orbitron, monospace"
            fontSize="7"
            fontWeight="700"
          >
            COMPUTE
          </text>
          <text
            x="245"
            y="100"
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="6.5"
          >
            SMA·EMA·ATR·niveles
          </text>
        </g>

        {/* AGENTES NARRATE — A1, A2, A3 */}
        <g>
          <rect
            x="15"
            y="118"
            width="100"
            height="32"
            rx="6"
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1"
          />
          <text
            x="65"
            y="133"
            textAnchor="middle"
            fill="rgba(255,255,255,0.95)"
            fontFamily="Orbitron, monospace"
            fontSize="10"
            fontWeight="700"
          >
            A1
          </text>
          <text
            x="65"
            y="144"
            textAnchor="middle"
            fill="rgba(255,255,255,0.55)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="7"
          >
            Activos · narrate
          </text>

          <rect
            x="120"
            y="118"
            width="80"
            height="32"
            rx="6"
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1"
          />
          <text
            x="160"
            y="133"
            textAnchor="middle"
            fill="rgba(255,255,255,0.95)"
            fontFamily="Orbitron, monospace"
            fontSize="10"
            fontWeight="700"
          >
            A2
          </text>
          <text
            x="160"
            y="144"
            textAnchor="middle"
            fill="rgba(255,255,255,0.55)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="7"
          >
            Macro · narrate
          </text>

          {/* A3 narrate — recibe compute output, solo añade narrative */}
          <rect
            x="205"
            y="118"
            width="80"
            height="32"
            rx="6"
            fill="rgba(255,255,255,0.06)"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="1.8"
            strokeDasharray="4 2"
          />
          <text
            x="245"
            y="133"
            textAnchor="middle"
            fill="rgba(255,255,255,1)"
            fontFamily="Orbitron, monospace"
            fontSize="10"
            fontWeight="700"
          >
            A3
          </text>
          <text
            x="245"
            y="144"
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="7"
          >
            Aislado · narrate
          </text>
        </g>

        {/* DEBATE — solo entre A1 y A2 */}
        <g>
          <rect
            x="60"
            y="170"
            width="120"
            height="22"
            rx="4"
            fill="rgba(255,255,255,0.03)"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
          <text
            x="120"
            y="184"
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="8"
          >
            Debate A1 × A2 (si anomalía)
          </text>
        </g>

        {/* CONFLUENCE COMPUTE — determinístico, alimenta A4 */}
        <g>
          <rect
            x="205"
            y="208"
            width="80"
            height="22"
            rx="4"
            fill="rgba(52,211,153,0.06)"
            stroke="rgba(52,211,153,0.65)"
            strokeWidth="1"
          />
          <text
            x="245"
            y="218"
            textAnchor="middle"
            fill="rgba(52,211,153,0.95)"
            fontFamily="Orbitron, monospace"
            fontSize="7"
            fontWeight="700"
          >
            CONFLUENCE
          </text>
          <text
            x="245"
            y="226"
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="6.5"
          >
            scoring 30/40/30
          </text>
        </g>

        {/* A4 narrate final */}
        <g>
          <rect
            x="120"
            y="248"
            width="160"
            height="34"
            rx="6"
            fill="rgba(255,255,255,0.06)"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
          />
          <text
            x="200"
            y="263"
            textAnchor="middle"
            fill="rgba(255,255,255,0.95)"
            fontFamily="Orbitron, monospace"
            fontSize="10"
            fontWeight="700"
          >
            A4
          </text>
          <text
            x="200"
            y="275"
            textAnchor="middle"
            fill="rgba(255,255,255,0.55)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="7"
          >
            narrate · cita A3 · disclaimer
          </text>
        </g>

        {/* CONEXIONES — USER → sources */}
        <path
          d="M 180 28 L 65 48"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.5"
          fill="none"
        />
        <path
          d="M 200 28 L 160 48"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.5"
          fill="none"
        />
        {/* USER → OHLCV: comandante único de A3 */}
        <path
          d="M 220 28 L 245 48"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="1.2"
          fill="none"
          markerEnd="url(#arrow-a3)"
        />

        {/* DATA → AGENTS / COMPUTE */}
        <path
          d="M 65 68 L 65 118"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="0.5"
          fill="none"
          markerEnd="url(#arrow)"
        />
        <path
          d="M 160 68 L 160 118"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="0.5"
          fill="none"
          markerEnd="url(#arrow)"
        />
        {/* OHLCV → COMPUTE → A3 narrate */}
        <path
          d="M 245 68 L 245 82"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="1.4"
          fill="none"
          markerEnd="url(#arrow-a3)"
        />
        <path
          d="M 245 104 L 245 118"
          stroke="rgba(52,211,153,0.85)"
          strokeWidth="1.4"
          fill="none"
          markerEnd="url(#arrow-compute)"
        />

        {/* A1, A2 → Debate */}
        <path
          d="M 80 150 L 100 170"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.5"
          fill="none"
          strokeDasharray="2 2"
        />
        <path
          d="M 160 150 L 140 170"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.5"
          fill="none"
          strokeDasharray="2 2"
        />

        {/* A1, A2, A3 → CONFLUENCE compute */}
        <path
          d="M 80 150 L 220 208"
          stroke="rgba(52,211,153,0.45)"
          strokeWidth="0.6"
          fill="none"
          markerEnd="url(#arrow-compute)"
        />
        <path
          d="M 160 150 L 235 208"
          stroke="rgba(52,211,153,0.45)"
          strokeWidth="0.6"
          fill="none"
          markerEnd="url(#arrow-compute)"
        />
        <path
          d="M 245 150 L 245 208"
          stroke="rgba(52,211,153,0.55)"
          strokeWidth="0.7"
          fill="none"
          markerEnd="url(#arrow-compute)"
        />
        {/* Debate → CONFLUENCE compute */}
        <path
          d="M 165 192 L 225 208"
          stroke="rgba(52,211,153,0.45)"
          strokeWidth="0.6"
          fill="none"
          strokeDasharray="2 2"
          markerEnd="url(#arrow-compute)"
        />

        {/* CONFLUENCE → A4 (trazo emerald grueso — determinístico) */}
        <path
          d="M 245 230 L 230 248"
          stroke="rgba(52,211,153,0.85)"
          strokeWidth="1.4"
          fill="none"
          markerEnd="url(#arrow-compute)"
        />

        {/* A1, A2, A3 → A4 (también para que A4 narre con los outputs originales) */}
        <path
          d="M 65 150 L 160 248"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.5"
          fill="none"
          markerEnd="url(#arrow)"
        />
        <path
          d="M 160 150 L 185 248"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.5"
          fill="none"
          markerEnd="url(#arrow)"
        />
        {/* A3 → A4 (trazo grueso porque A4 cita textualmente) */}
        <path
          d="M 245 150 L 215 248"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="1.2"
          fill="none"
          markerEnd="url(#arrow)"
        />

        {/* A4 → USER (output ensamblado, vuelta arriba) */}
        <path
          d="M 280 265 Q 370 250 370 130 Q 370 30 240 22"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.5"
          fill="none"
          strokeDasharray="2 2"
          markerEnd="url(#arrow)"
        />

        {/* Leyenda */}
        <g>
          <rect
            x="6"
            y="294"
            width="8"
            height="2"
            fill="rgba(52,211,153,0.85)"
          />
          <text
            x="18"
            y="298"
            fill="rgba(255,255,255,0.7)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="7"
          >
            compute determinístico (sin LLM)
          </text>

          <rect
            x="6"
            y="306"
            width="8"
            height="1.5"
            fill="rgba(255,255,255,0.85)"
          />
          <text
            x="18"
            y="310"
            fill="rgba(255,255,255,0.7)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="7"
          >
            A3 isolated path (no leaks)
          </text>

          <text
            x="200"
            y="310"
            fill="rgba(255,255,255,0.4)"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="7"
          >
            --- LLM narrate · A4 cita A3
          </text>
        </g>
      </svg>
    </div>
  );
}
