import Link from 'next/link';
import type { DigestEntry_t } from '@/lib/radar/types';
import { cn } from '@/lib/utils';

/**
 * RelatedRadar — puente post-resolve de /analysis al scanner (Fase 1C·C2 + B3).
 *
 * Reconecta el análisis con el radar usando DATO REAL del scan persistido
 * (`GET /api/watchlist/radar` → digest): cuántos OTROS activos de tu watchlist
 * tienen señal o anomalía activa AHORA, con el top-3 ya rankeado por el servidor.
 *
 * HONESTIDAD: no afirma correlación con el ticker analizado (no hay metadato de
 * sector) — es "tu radar", NO "relacionadas con X". Si no hay nada, lo dice
 * explícito. FIREWALL: la severidad va por intensidad de tinta (chrome), nunca
 * por color de mercado; el único acento es el enlace (marca).
 */
const SEV_DOT: Record<DigestEntry_t['severity'], string> = {
  high: 'bg-ink/80',
  medium: 'bg-ink/55',
  low: 'bg-ink/35',
};

export function RelatedRadar({ count, preview }: { count: number; preview: DigestEntry_t[] }) {
  return (
    <div className="rounded-card-sm border border-ink/8 bg-surface-2 px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-fluid-micro font-bold uppercase tracking-[0.1em] text-ink/72">
          tu radar
        </span>
        <Link
          href="/watchlist"
          className="font-mono text-fluid-micro text-accent underline-offset-2 hover:underline"
        >
          ver radar →
        </Link>
      </div>

      {count === 0 ? (
        <div className="font-mono text-fluid-caption text-ink/55">
          radar limpio · sin otras señales activas
        </div>
      ) : (
        <>
          <div className="mb-2 font-mono text-fluid-caption text-ink/72">
            {count} {count === 1 ? 'activo' : 'activos'} con señal o anomalía
          </div>
          {preview.length > 0 && (
            <ul className="flex flex-col gap-1">
              {preview.map((d) => (
                <li key={d.ticker} className="flex items-start gap-2">
                  <span
                    className={cn('mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full', SEV_DOT[d.severity])}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 font-mono text-fluid-caption text-ink/80">
                    <span className="font-medium text-ink">{d.ticker}</span>
                    <span className="text-ink/55"> · {d.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
