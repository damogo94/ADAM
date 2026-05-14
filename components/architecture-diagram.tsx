/**
 * ArchitectureDiagram — SVG estático del flujo del sistema.
 *
 * Re-skin B&W: la diferenciación visual antes era por COLOR (azul/cyan/
 * ámbar/violeta por agente). Ahora es por GROSOR DE TRAZO e INTENSIDAD:
 *
 *   - A3 (aislado) → stroke más grueso (1.5) + dashed → llama la atención
 *     sobre la regla absoluta sin necesidad de un acento de color
 *   - A1, A2 → stroke base (1.0), opacidad 70%
 *   - A4 (sistema) → stroke base, fill ligero white/8
 *   - Conexiones decorativas → opacidad baja (15-25%)
 *
 * Mantiene la regla load-bearing: A3 no recibe flujo de A1/A2/Debate.
 */
export function ArchitectureDiagram() {
  return (
    <div className="overflow-hidden rounded-[15px] border border-white/5 bg-black/40 p-3">
      <div className="font-mono text-[8px] uppercase tracking-wider text-white/40 mb-2">
        flujo de procesamiento
      </div>
      <svg viewBox="0 0 400 260" className="w-full" xmlns="http://www.w3.org/2000/svg" aria-label="Architecture diagram">
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.45)" />
          </marker>
          <marker id="arrow-a3" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.95)" />
          </marker>
        </defs>

        {/* USUARIO */}
        <g>
          <rect x="160" y="10" width="80" height="22" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <text x="200" y="25" textAnchor="middle" fill="rgba(255,255,255,0.95)" fontFamily="Orbitron, monospace" fontSize="9" fontWeight="700">USUARIO</text>
        </g>

        {/* DATA SOURCES */}
        <g>
          <rect x="15" y="55" width="100" height="20" rx="3" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <text x="65" y="68" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontFamily="IBM Plex Mono, monospace" fontSize="8">Investing+Bloomberg</text>
          <rect x="120" y="55" width="80" height="20" rx="3" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <text x="160" y="68" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontFamily="IBM Plex Mono, monospace" fontSize="8">IMF + Fed/BCE</text>
          <rect x="205" y="55" width="80" height="20" rx="3" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="3 2" />
          <text x="245" y="68" textAnchor="middle" fill="rgba(255,255,255,0.95)" fontFamily="IBM Plex Mono, monospace" fontSize="8" fontWeight="600">OHLCV only</text>
        </g>

        {/* AGENTES A1, A2, A3 */}
        <g>
          <rect x="15" y="100" width="100" height="32" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
          <text x="65" y="115" textAnchor="middle" fill="rgba(255,255,255,0.95)" fontFamily="Orbitron, monospace" fontSize="10" fontWeight="700">A1</text>
          <text x="65" y="126" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontFamily="IBM Plex Mono, monospace" fontSize="7">Activos · micro</text>

          <rect x="120" y="100" width="80" height="32" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
          <text x="160" y="115" textAnchor="middle" fill="rgba(255,255,255,0.95)" fontFamily="Orbitron, monospace" fontSize="10" fontWeight="700">A2</text>
          <text x="160" y="126" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontFamily="IBM Plex Mono, monospace" fontSize="7">Macro</text>

          {/* A3 — stroke más grueso + dashed para señalizar aislamiento sin color */}
          <rect x="205" y="100" width="80" height="32" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeDasharray="4 2" />
          <text x="245" y="115" textAnchor="middle" fill="rgba(255,255,255,1)" fontFamily="Orbitron, monospace" fontSize="10" fontWeight="700">A3</text>
          <text x="245" y="126" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontFamily="IBM Plex Mono, monospace" fontSize="7">Aislado · técnico</text>
        </g>

        {/* DEBATE — solo entre A1 y A2 */}
        <g>
          <rect x="60" y="155" width="120" height="22" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" strokeDasharray="2 2" />
          <text x="120" y="170" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontFamily="IBM Plex Mono, monospace" fontSize="8">Debate A1 × A2 (si anomalía)</text>
        </g>

        {/* A4 final */}
        <g>
          <rect x="120" y="200" width="160" height="32" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
          <text x="200" y="215" textAnchor="middle" fill="rgba(255,255,255,0.95)" fontFamily="Orbitron, monospace" fontSize="10" fontWeight="700">A4</text>
          <text x="200" y="226" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontFamily="IBM Plex Mono, monospace" fontSize="7">ensamblado + confluencia</text>
        </g>

        {/* CONEXIONES — USER -> sources */}
        <path d="M 180 32 L 65 55" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" fill="none" />
        <path d="M 200 32 L 160 55" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" fill="none" />
        {/* USER -> OHLCV: trazo grueso blanco (único comandante de A3) */}
        <path d="M 220 32 L 245 55" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" fill="none" markerEnd="url(#arrow-a3)" />

        {/* DATA -> AGENTS */}
        <path d="M 65 75 L 65 100" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" fill="none" markerEnd="url(#arrow)" />
        <path d="M 160 75 L 160 100" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" fill="none" markerEnd="url(#arrow)" />
        <path d="M 245 75 L 245 100" stroke="rgba(255,255,255,0.85)" strokeWidth="1.4" fill="none" markerEnd="url(#arrow-a3)" />

        {/* A1, A2 -> Debate */}
        <path d="M 80 132 L 100 155" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />
        <path d="M 160 132 L 140 155" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />

        {/* A1, A2, Debate, A3 -> A4 */}
        <path d="M 80 132 L 160 200" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" fill="none" markerEnd="url(#arrow)" />
        <path d="M 160 132 L 190 200" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" fill="none" markerEnd="url(#arrow)" />
        <path d="M 120 177 L 180 200" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" fill="none" strokeDasharray="2 2" markerEnd="url(#arrow)" />
        {/* A3 -> A4: trazo grueso (A4 cita textualmente a A3) */}
        <path d="M 245 132 L 230 200" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" fill="none" markerEnd="url(#arrow)" />

        {/* A4 -> USER (output ensamblado) */}
        <path d="M 280 215 Q 360 200 360 130 Q 360 30 240 22" stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" fill="none" strokeDasharray="2 2" markerEnd="url(#arrow)" />

        {/* Leyenda */}
        <g>
          <text x="15" y="252" fill="rgba(255,255,255,0.7)" fontFamily="IBM Plex Mono, monospace" fontSize="7">━ A3 isolated path (no leaks)</text>
          <text x="200" y="252" fill="rgba(255,255,255,0.4)" fontFamily="IBM Plex Mono, monospace" fontSize="7">--- ensamblado A4 (cita A3)</text>
        </g>
      </svg>
    </div>
  );
}
