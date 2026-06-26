import type { Metadata } from 'next';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { BottomNav } from '@/components/bottom-nav';
import './globals.css';

// Self-host vía next/font (LCP/CLS: sin <link> bloqueante a Google Fonts).
// Inter es variable → optical sizing disponible (font-optical-sizing en globals).
// IBM Plex Mono no es variable → pesos explícitos (los que usa el sistema).
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'A.D.A.M. — Anomaly Detection & Analysis Module',
  description:
    'Sistema multi-agente de análisis financiero. Análisis educativo · no constituye asesoramiento regulado.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`dark ${inter.variable} ${plexMono.variable}`}>
      <body className="bg-void text-ink antialiased font-sans">
        {children}
        <BottomNav />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
