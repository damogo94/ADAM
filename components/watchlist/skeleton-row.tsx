/**
 * SkeletonRow — placeholder mientras carga el radar. Misma altura que
 * RadarRow para evitar layout shift cuando llegan los datos reales.
 *
 * `prefers-reduced-motion: reduce` desactiva la animación de pulse
 * automáticamente vía Tailwind (`motion-safe:animate-pulse`).
 */

export function SkeletonRow() {
  return (
    <div className="rounded-card-sm border border-white/8 bg-surface-2">
      {/* Cabecera */}
      <div className="flex items-center gap-3 px-3 pt-2.5">
        <div className="flex flex-1 flex-col gap-1">
          <div className="h-3 w-12 rounded bg-white/10 motion-safe:animate-pulse" />
          <div className="h-2 w-8 rounded bg-white/5 motion-safe:animate-pulse" />
        </div>
        <div className="h-[22px] w-16 rounded bg-white/5 motion-safe:animate-pulse" />
        <div className="text-right">
          <div className="h-3 w-14 rounded bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-1 h-2 w-10 rounded bg-white/5 motion-safe:animate-pulse" />
        </div>
        <div className="h-7 w-7 rounded-md bg-white/5 motion-safe:animate-pulse" />
        <div className="h-7 w-7 rounded-md bg-white/5 motion-safe:animate-pulse" />
      </div>
      {/* Headline */}
      <div className="px-3 pt-2">
        <div className="h-2 w-3/4 rounded bg-white/5 motion-safe:animate-pulse" />
      </div>
      {/* Grid de datos */}
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/5 px-3 py-2">
        <div className="h-3 w-12 rounded bg-white/10 motion-safe:animate-pulse" />
        <div className="h-3 w-10 rounded bg-white/10 motion-safe:animate-pulse" />
        <div className="h-3 w-10 rounded bg-white/10 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
