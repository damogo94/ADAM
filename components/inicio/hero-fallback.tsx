/**
 * HeroFallback — versión estática y ligera del hero 3D.
 *
 * Doble uso: (1) `loading` del dynamic(import hero-3d) mientras descarga
 * three/R3F; (2) sustituto con `prefers-reduced-motion` (no se monta el canvas).
 *
 * SVG puro, sin dependencias. Evoca el mismo motivo que la escena 3D: cuatro
 * anillos (A1 · A2 · A3 + Estructura opt-in, más tenue) que convergen en un
 * núcleo común — la confluencia. Tintes que dialogan con la aurora (índigo /
 * violeta / teal / sky).
 */
export function HeroFallback() {
  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 240 240" className="h-full max-h-[320px] w-auto" fill="none">
        <ellipse cx="120" cy="120" rx="94" ry="34" stroke="#6366f1" strokeWidth="1" opacity="0.55" />
        <ellipse cx="120" cy="120" rx="34" ry="94" stroke="#a855f7" strokeWidth="1" opacity="0.5" />
        <ellipse
          cx="120"
          cy="120"
          rx="86"
          ry="86"
          stroke="#2dd4bf"
          strokeWidth="1"
          opacity="0.4"
          transform="rotate(45 120 120)"
        />
        {/* 4ª pata · Estructura (opt-in) — más tenue */}
        <ellipse
          cx="120"
          cy="120"
          rx="64"
          ry="92"
          stroke="#38bdf8"
          strokeWidth="1"
          opacity="0.3"
          transform="rotate(-30 120 120)"
        />
        <circle cx="120" cy="120" r="6" fill="#ffffff" opacity="0.85" />
      </svg>
    </div>
  );
}
