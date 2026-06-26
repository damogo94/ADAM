/**
 * Grain — grano de película ultra-sutil (materialidad sobre superficies oscuras,
 * mata el banding de los degradados). Estático, sin JS, server component.
 * `feTurbulence` rasterizado UNA vez como data-URI (no animado) → coste nulo.
 * Chrome: no introduce color.
 */
const NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

export function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[5] opacity-[0.035] mix-blend-overlay"
      style={{ backgroundImage: `url("${NOISE}")`, backgroundSize: '180px 180px' }}
    />
  );
}
