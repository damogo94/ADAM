import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { BottomNav } from '@/components/bottom-nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'A.D.A.M. — Anomaly Detection & Analysis Module',
  description:
    'Sistema multi-agente de análisis financiero. Análisis educativo · no constituye asesoramiento regulado.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Inter:wght@300;400;500;600&family=IBM+Plex+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-void text-white antialiased">
        {children}
        <BottomNav />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
