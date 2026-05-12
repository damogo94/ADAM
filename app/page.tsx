/**
 * Pantalla raíz — redirige a ANÁLISIS.
 * En Sprint 2 esto pasa a /(app)/analysis con auth gate.
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/analysis');
}
