import { Header } from '@/components/header';

export default function SystemPage() {
  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header tagline="Sistema · estado de agentes" status="ok" />

      <section className="mx-4 mt-3 rounded-[18px] border border-a4/20 bg-gradient-to-br from-a4/[0.08] to-a1/[0.04] px-3.5 py-3.5">
        <div className="font-orbitron text-[22px] font-black tracking-[0.2em] bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
          A.D.A.M.
        </div>
        <div className="mt-1 font-mono text-[8px] text-slate tracking-wider">
          Anomaly Detection &amp; Analysis Module · ATLAS CAPITAL
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-blink-slow" />
          <span className="font-mono text-[9px] text-emerald">sistema operativo</span>
          <span className="ml-auto font-mono text-[9px] text-slate">v0.1.0 · sprint-1</span>
        </div>
      </section>

      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        {[
          ['1,842', 'señales generadas'],
          ['—', 'precisión confluencia'],
          ['—', 'activos analizados'],
          ['—', 'anomalías detectadas'],
        ].map(([n, l]) => (
          <div key={l} className="rounded-xl border border-white/5 bg-surface-2 px-3 py-2.5">
            <div className="font-orbitron text-[18px] font-bold text-white">{n}</div>
            <div className="mt-0.5 font-mono text-[8px] text-slate">{l}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pt-6 font-mono text-[9px] text-slate-l leading-relaxed">
        Pantalla SISTEMA — Sprint 3 conectará métricas reales desde tabla{' '}
        <code className="text-a4">agent_calls_log</code>. Por ahora son placeholders.
      </div>
    </div>
  );
}
