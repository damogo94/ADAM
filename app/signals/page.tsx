import { Header } from '@/components/header';

export default function SignalsPage() {
  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header tagline="Señales · historial de alertas CMT" status="offline" />
      <div className="p-6 font-mono text-[10px] text-slate-l">
        <p className="mb-2">Pantalla SEÑALES — Sprint 2.</p>
        <p className="text-slate">Depende del módulo CMT scanner (cron 5min).</p>
      </div>
    </div>
  );
}
