'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Batch quotes para tiles del AssetPicker.
 *
 * Restricciones del endpoint:
 *   GET /api/market/quotes acepta máx. 20 symbols por request.
 *   Cap defensivo del server — no se puede subir desde aquí.
 *   Server cachea 30s (s-maxage=30, stale-while-revalidate=60).
 *
 * Estrategia:
 *   - Chunkea en grupos de 20, paraleliza los chunks.
 *   - Cache en memoria de módulo con TTL 30s, alineado al s-maxage del server.
 *     Reusable entre aperturas del picker sin volver a pegar al endpoint.
 *   - Debounce 250ms para no disparar al cambiar de tab a tab rápidamente.
 *   - Abort en cambio de symbols (evita race condition de tab switching).
 */

const CHUNK_SIZE = 20;
const TTL_MS = 30_000;
const DEBOUNCE_MS = 250;

interface Quote {
  current?: number;
  change_pct_24h?: number;
  error?: string;
}

interface CacheEntry {
  q: Quote;
  ts: number;
}

const CACHE = new Map<string, CacheEntry>();

function fresh(entry: CacheEntry | undefined): boolean {
  return !!entry && Date.now() - entry.ts < TTL_MS;
}

export function useQuotes(symbols: string[], enabled: boolean): Map<string, Quote> {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(() => snapshotFromCache(symbols));
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    if (!enabled) return;
    const key = symbols.join(',');
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    // Hidrata inmediato lo que ya esté en caché.
    setQuotes(snapshotFromCache(symbols));

    const missing = symbols.filter((s) => !fresh(CACHE.get(s.toUpperCase())));
    if (missing.length === 0) return;

    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      void fetchBatched(missing, ctrl.signal).then((added) => {
        if (ctrl.signal.aborted) return;
        if (added === 0) return;
        // Re-snapshot tras escribir al cache.
        setQuotes(snapshotFromCache(symbols));
      });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [symbols, enabled]);

  return quotes;
}

function snapshotFromCache(symbols: string[]): Map<string, Quote> {
  const out = new Map<string, Quote>();
  for (const s of symbols) {
    const e = CACHE.get(s.toUpperCase());
    if (fresh(e)) out.set(s.toUpperCase(), e!.q);
  }
  return out;
}

async function fetchBatched(symbols: string[], signal: AbortSignal): Promise<number> {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    chunks.push(symbols.slice(i, i + CHUNK_SIZE));
  }
  let written = 0;
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const url = `/api/market/quotes?symbols=${chunk.map(encodeURIComponent).join(',')}`;
        const r = await fetch(url, { signal });
        if (!r.ok) return;
        const data = (await r.json()) as {
          quotes: { symbol: string; current?: number; change_pct_24h?: number; error?: string }[];
        };
        const now = Date.now();
        for (const q of data.quotes) {
          CACHE.set(q.symbol.toUpperCase(), {
            q: { current: q.current, change_pct_24h: q.change_pct_24h, error: q.error },
            ts: now,
          });
          written++;
        }
      } catch {
        // Aborto o red — silencioso. El tile cae a estado sin quote.
      }
    })
  );
  return written;
}
