'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { cn } from '@/lib/utils';
import type { SignalHistory, SignalLevel } from '@/types/db';

interface Stats {
  urgente: number;
  atencion: number;
  monitorear: number;
}

type LevelFilter = 'all' | SignalLevel;
type AckFilter = 'all' | 'unread' | 'acknowledged';

export default function SignalsScreen() {
  const router = useRouter();
  const [signals, setSignals] = useState<SignalHistory[]>([]);
  const [stats, setStats] = useState<Stats>({ urgente: 0, atencion: 0, monitorear: 0 });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filtros
  const [filterLevel, setFilterLevel] = useState<LevelFilter>('all');
  const [filterTicker, setFilterTicker] = useState('');
  const [filterAck, setFilterAck] = useState<AckFilter>('all');

  const filteredSignals = signals.filter((s) => {
    if (filterLevel !== 'all' && s.level !== filterLevel) return false;
    if (filterTicker && !s.ticker.toLowerCase().includes(filterTicker.toLowerCase())) return false;
    if (filterAck === 'unread' && s.acknowledged_at) return false;
    if (filterAck === 'acknowledged' && !s.acknowledged_at) return false;
    return true;
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/signals');
      if (!r.ok) {
        if (r.status === 401) {
          router.push('/login?next=/signals');
          return;
        }
        throw new Error('fetch failed');
      }
      const data = (await r.json()) as { signals: SignalHistory[]; stats: Stats };
      setSignals(data.signals);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }

  async function onScan() {
    setScanning(true);
    setError(null);
    try {
      const r = await fetch('/api/cmt/scan', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? 'scan failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setScanning(false);
    }
  }

  async function onAck(id: string) {
    // Optimistic update + rollback si POST falla
    const snapshot = signals;
    setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, acknowledged_at: new Date().toISOString() } : s)));
    try {
      const r = await fetch(`/api/signals/${id}/ack`, { method: 'POST' });
      if (!r.ok) throw new Error('ack_failed');
    } catch {
      setSignals(snapshot);
      setError('No se pudo marcar como leída — reintenta');
    }
  }

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={loading ? 'running' : stats.urgente > 0 ? 'error' : 'ok'} />

      <SectionLabel>resumen</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5 px-4">
        <CountBox label="URGENTES" value={stats.urgente} tone="urgente" />
        <CountBox label="ATENCIÓN" value={stats.atencion} tone="atencion" />
        <CountBox label="MONITOREAR" value={stats.monitorear} tone="monitorear" />
      </div>

      <div className="px-4 pt-3">
        <button
          onClick={onScan}
          disabled={scanning}
          className="w-full rounded-lg border border-white bg-white px-3 py-2.5 font-orbitron text-[11px] font-bold tracking-[0.15em] text-black transition hover:bg-white/85 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {scanning ? 'ESCANEANDO WATCHLIST…' : 'EJECUTAR SCAN CMT ▶'}
        </button>
        <p className="mt-1.5 font-mono text-[8px] text-white/40 text-center">
          escanea tus tickers · usa Haiku (rápido)
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-rose/40 bg-rose/[0.08] px-3 py-2 font-mono text-[10px] text-rose animate-urg-pulse">
          {error}
        </div>
      )}

      <SectionLabel>filtros</SectionLabel>
      <div className="px-4 space-y-1.5">
        <div className="flex gap-1">
          {(['all', 'urgente', 'atencion', 'monitorear'] as const).map((lv) => (
            <button
              key={lv}
              onClick={() => setFilterLevel(lv)}
              className={cn(
                'flex-1 rounded-lg border px-2 py-1.5 font-mono text-[9px] uppercase tracking-wider transition',
                // Filter activo: color del nivel correspondiente. Inactivo: B&W dim.
                filterLevel === lv
                  ? lv === 'urgente'
                    ? 'border-rose/55 bg-rose/[0.12] text-rose'
                    : lv === 'atencion'
                      ? 'border-amber/55 bg-amber/[0.10] text-amber'
                      : lv === 'monitorear'
                        ? 'border-emerald/45 bg-emerald/[0.08] text-emerald'
                        : 'border-white/35 bg-white/[0.06] text-white'
                  : 'border-white/8 bg-surface-2 text-white/45 hover:border-white/20'
              )}
            >
              {lv === 'all' ? 'todas' : lv}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={filterTicker}
            onChange={(e) => setFilterTicker(e.target.value)}
            placeholder="ticker..."
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-[10px] uppercase text-white placeholder-white/25 focus:border-white/40 focus:outline-none"
          />
          {(['all', 'unread', 'acknowledged'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setFilterAck(a)}
              className={cn(
                'rounded-lg border px-2 py-1.5 font-mono text-[9px] uppercase tracking-wider transition',
                filterAck === a
                  ? 'border-white/40 bg-white/[0.06] text-white'
                  : 'border-white/8 bg-surface-2 text-white/45 hover:border-white/20'
              )}
            >
              {a === 'all' ? 'todas' : a === 'unread' ? 'no leídas' : 'leídas'}
            </button>
          ))}
        </div>
      </div>

      <SectionLabel>
        historial · {filteredSignals.length === signals.length ? signals.length : `${filteredSignals.length} de ${signals.length}`}
      </SectionLabel>
      {loading ? (
        <div className="px-4 py-8 text-center font-mono text-[10px] text-slate">cargando señales…</div>
      ) : signals.length === 0 ? (
        <div className="mx-4 rounded-[15px] border border-dashed border-white/10 bg-surface-2 px-3 py-8 text-center">
          <div className="text-2xl text-slate-l opacity-15 mb-1">⚡</div>
          <div className="font-mono text-[10px] text-slate mb-1">sin señales</div>
          <div className="font-mono text-[8px] text-slate">
            añade activos a tu watchlist y ejecuta un scan
          </div>
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="mx-4 rounded-[15px] border border-dashed border-white/10 bg-surface-2 px-3 py-6 text-center">
          <div className="font-mono text-[10px] text-slate">ninguna señal cumple los filtros</div>
        </div>
      ) : (
        <div className="px-4 space-y-1.5">
          {filteredSignals.map((s) => (
            <SignalCard
              key={s.id}
              signal={s}
              expanded={expandedId === s.id}
              onToggle={() => setExpandedId((cur) => (cur === s.id ? null : s.id))}
              onAck={() => onAck(s.id)}
            />
          ))}
        </div>
      )}

      <footer className="px-5 pt-6 text-center font-mono text-[8px] text-slate opacity-60 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}

function CountBox({ label, value, tone }: { label: string; value: number; tone: SignalLevel }) {
  // Sesión 5b: color semántico back. La urgencia se comunica por COLOR
  // (rose>amber>emerald) + ANIMACIÓN (solo urgente pulsa cuando hay >0).
  // Cuando count=0, el box queda dim — el ojo no se distrae con ceros.
  const active = value > 0;
  const cls =
    tone === 'urgente'
      ? active
        ? 'text-rose border-rose/45 bg-rose/[0.10] animate-urg-pulse'
        : 'text-rose/30 border-rose/12 bg-rose/[0.02]'
      : tone === 'atencion'
        ? active
          ? 'text-amber border-amber/45 bg-amber/[0.08]'
          : 'text-amber/30 border-amber/12 bg-amber/[0.02]'
        : active
          ? 'text-emerald border-emerald/40 bg-emerald/[0.07]'
          : 'text-emerald/30 border-emerald/12 bg-emerald/[0.02]';
  return (
    <div className={cn('rounded-[15px] border px-2 py-2.5 text-center transition-all', cls)}>
      <div className="font-orbitron text-[20px] font-black">{value}</div>
      <div className="font-mono text-[7px] tracking-wider opacity-80 mt-0.5">{label}</div>
    </div>
  );
}

/**
 * levelMeta — color semántico por nivel de urgencia.
 *   urgente    → rose pulsing  (acción inmediata)
 *   atencion   → amber         (1-3 sesiones de seguimiento)
 *   monitorear → emerald       (en el radar, sin trigger)
 *   sin_senal  → slate         (ruido, no operar)
 */
function levelMeta(level: SignalLevel) {
  if (level === 'urgente') return { band: 'bg-rose', text: 'text-rose', label: 'URGENTE', pulse: true };
  if (level === 'atencion') return { band: 'bg-amber', text: 'text-amber', label: 'ATENCIÓN', pulse: false };
  if (level === 'monitorear') return { band: 'bg-emerald', text: 'text-emerald', label: 'MONITOREAR', pulse: false };
  return { band: 'bg-white/20', text: 'text-white/40', label: 'SIN SEÑAL', pulse: false };
}

function SignalCard({
  signal,
  expanded,
  onToggle,
  onAck,
}: {
  signal: SignalHistory;
  expanded: boolean;
  onToggle: () => void;
  onAck: () => void;
}) {
  const meta = levelMeta(signal.level);
  const acknowledged = !!signal.acknowledged_at;
  const emitted = new Date(signal.emitted_at);
  const indicators = (signal.indicators ?? {}) as Record<string, string>;

  function copyReport() {
    const lines = [
      `${signal.ticker} · ${meta.label} · ${signal.timeframe}`,
      `Confianza: ${signal.confidence_pct}%`,
      `Setup: ${signal.setup_detected}`,
      `Entrada: ${signal.entry_price ?? '—'} · Stop: ${signal.stop_loss ?? '—'} · Target: ${signal.target_price ?? '—'}`,
      `R/B: ${signal.risk_reward_ratio?.toFixed(2) ?? '—'}`,
      `Invalida: ${signal.invalidation_factor}`,
    ];
    void navigator.clipboard.writeText(lines.join('\n'));
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[15px] border bg-surface-2 transition-all',
        acknowledged ? 'border-white/5 opacity-60' : 'border-white/10',
        meta.pulse && !acknowledged && 'animate-urg-pulse'
      )}
    >
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', meta.band)} />
      <button onClick={onToggle} className="block w-full px-3 pl-4 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-orbitron text-[13px] font-bold tracking-wider text-white">{signal.ticker}</span>
              <span className={cn('font-mono text-[8px] font-medium uppercase tracking-wider', meta.text)}>
                {meta.label}
              </span>
              <span className="font-mono text-[8px] text-slate">· {signal.timeframe}</span>
            </div>
            <div className="font-mono text-[10px] text-slate-l mt-0.5 line-clamp-1">
              {signal.setup_detected}
            </div>
          </div>
          <div className="text-right">
            <div className={cn('font-orbitron text-[14px] font-bold', meta.text)}>
              {signal.confidence_pct}%
            </div>
            <div className="font-mono text-[7px] text-slate">{emitted.toLocaleTimeString().slice(0, 5)}</div>
          </div>
          <span className="font-mono text-[14px] text-slate-l opacity-50">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-3 pl-4 py-2.5">
          <div className="grid grid-cols-3 gap-2 mb-2">
            <KV label="ENTRADA" value={signal.entry_price?.toString() ?? '—'} />
            <KV label="▼ STOP" value={signal.stop_loss?.toString() ?? '—'} cls="text-rose" />
            <KV label="▲ TARGET" value={signal.target_price?.toString() ?? '—'} cls="text-emerald" />
          </div>
          <KV label="R/B" value={signal.risk_reward_ratio?.toFixed(2) ?? '—'} cls="text-amber" />

          {Object.keys(indicators).length > 0 && (
            <div className="mt-2">
              <div className="font-mono text-[8px] uppercase tracking-wider text-white/45 mb-1">Indicadores</div>
              <div className="space-y-1">
                {Object.entries(indicators).map(([k, v]) => (
                  <div key={k} className="font-mono text-[10px]">
                    <span className="text-white/55">{k}: </span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 border-t border-white/5 pt-2">
            <div className="font-mono text-[8px] uppercase tracking-wider text-rose mb-0.5">Invalida si</div>
            <div className="font-mono text-[10px] text-white/90">{signal.invalidation_factor}</div>
          </div>

          <div className="mt-3 flex gap-1.5">
            <button
              onClick={copyReport}
              className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 font-mono text-[10px] text-white/55 hover:border-white/35 hover:text-white transition"
            >
              copiar reporte
            </button>
            {!acknowledged && (
              <button
                onClick={onAck}
                className="flex-1 rounded-lg border border-emerald/25 bg-emerald/[0.04] px-2 py-1.5 font-mono text-[10px] text-emerald hover:bg-emerald/[0.08] hover:border-emerald/40 transition"
              >
                marcar leído
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KV({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
      <div className="font-mono text-[7px] uppercase tracking-wider text-slate mb-0.5">{label}</div>
      <div className={cn('font-mono text-[11px] font-medium text-white', cls)}>{value}</div>
    </div>
  );
}
