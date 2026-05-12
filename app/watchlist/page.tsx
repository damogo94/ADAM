import { Header } from '@/components/header';

export default function WatchlistPage() {
  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header tagline="Watchlist · activos monitorizados" status="offline" />
      <div className="p-6 font-mono text-[10px] text-slate-l">
        <p className="mb-2">Pantalla WATCHLIST — Sprint 2.</p>
        <p className="text-slate">Requiere Supabase + Auth. Próxima entrega:</p>
        <ul className="mt-2 list-disc pl-5 leading-relaxed">
          <li>Lista de activos del usuario con sparkline 7D</li>
          <li>Badge de señal CMT activa por activo</li>
          <li>Tap en activo → /analysis con ticker prefilled</li>
        </ul>
      </div>
    </div>
  );
}
