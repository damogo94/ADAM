/**
 * HeroFallback — versión estática y ligera del hero 3D.
 *
 * Doble uso:
 *   1. `loading` del dynamic(import hero-3d) mientras descarga three/R3F.
 *   2. Sustituto cuando `prefers-reduced-motion` está activo (no se monta
 *      el canvas; cero descarga de three).
 *
 * SVG puro, monocromo, sin dependencias. Evoca el mismo motivo que la escena
 * 3D: anillos concéntricos (apertura) + un poliedro wireframe = la "anomalía".
 */
export function HeroFallback() {
  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden="true">
      <svg
        viewBox="0 0 240 240"
        className="h-full max-h-[320px] w-auto text-white"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* halo: anillos concéntricos tenues */}
        <circle cx="120" cy="120" r="104" strokeWidth="0.6" opacity="0.12" />
        <circle cx="120" cy="120" r="78" strokeWidth="0.6" opacity="0.18" />
        {/* poliedro wireframe (icosaedro estilizado) */}
        <g strokeWidth="1" opacity="0.55">
          <polygon points="120,46 178,86 156,154 84,154 62,86" />
          <polygon points="120,90 150,112 138,148 102,148 90,112" opacity="0.7" />
          <line x1="120" y1="46" x2="120" y2="90" />
          <line x1="178" y1="86" x2="150" y2="112" />
          <line x1="156" y1="154" x2="138" y2="148" />
          <line x1="84" y1="154" x2="102" y2="148" />
          <line x1="62" y1="86" x2="90" y2="112" />
        </g>
        {/* núcleo */}
        <circle cx="120" cy="120" r="3" fill="currentColor" stroke="none" opacity="0.8" />
      </svg>
    </div>
  );
}
