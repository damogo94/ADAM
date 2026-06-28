/**
 * Pantalla raíz — redirige a /analysis (grupo (workspace), con auth gate).
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/analysis');
}
