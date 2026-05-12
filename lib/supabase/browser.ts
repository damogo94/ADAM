'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/db';

/**
 * Cliente Supabase para Client Components.
 * Singleton — se reusa entre renders.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createSupabaseBrowser() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
