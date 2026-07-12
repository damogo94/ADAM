/**
 * A.D.A.M. — Test de momentum TRANSVERSAL sobre el S&P 500 con universo GRANDE y
 * survivorship-free REAL (constituyentes point-in-time + precios de deslistados).
 * Paso 1 del ADR-005 (búsqueda de edge de fuerza relativa, fuera de A3 aislado).
 *
 * POR QUÉ. El test de 55 nombres dio +0.58pp/mes pero t-stat 1.17 (insignificante)
 * por falta de POTENCIA (terciles de ~18) y survivorship por proxy. Con ~500
 * constituyentes point-in-time y deciles de ~50, la desviación cae ~5× → el t-stat
 * tiene por fin potencia para confirmar/refutar la prima de momentum, y al incluir
 * los deslistados-a-cero el corto de perdedores se mide DE VERDAD.
 *
 * FUENTE DE DATOS: Sharadar (Nasdaq Data Link), survivorship-free:
 *   - SHARADAR/SP500  → altas/bajas del índice con fecha (desde 1957) → membresía point-in-time.
 *   - SHARADAR/SEP    → precios EOD ajustados (closeadj), INCLUYE deslistados (desde 1998).
 *   (- SHARADAR/TICKERS → metadata/isdelisted, no imprescindible aquí.)
 *
 * REQUISITO: variable de entorno NASDAQ_DATA_LINK_API_KEY (suscripción a SEP).
 * CÓMO CORRERLO (gated; hace red + descarga grande, ~minutos):
 *   NASDAQ_DATA_LINK_API_KEY=xxx RUN_BACKTEST=1 node_modules/.bin/vitest run scripts/sp500-momentum.test.ts
 *
 * ⚠️ ESTADO: la capa de INGESTA (endpoints/columnas/paginación de Sharadar) está
 * escrita contra la documentación, NO validada aún contra la API real. En la
 * primera corrida con clave hay que verificar los nombres de columna y el formato
 * de respuesta y ajustar `fetchDatatable`/`membershipAt`/`loadPrices` si difieren.
 * El MOTOR de momentum (deciles/spread/t-stat) es el mismo ya probado (relstrength).
 *
 * GUARDAS METODOLÓGICOS (ADR-004): sin look-ahead (momentum ≤ t, forward > t);
 * umbrales PRE-REGISTRADOS (12-1, rebalance/hold mensual, deciles); reportar t-stat
 * y neto de costes + borrow del corto; por régimen (el "momentum crash" en bear);
 * deslistado en el hold → usar el último precio disponible (captura la caída; una
 * mejora futura usa el delisting return de SHARADAR/ACTIONS).
 */
import fs from 'node:fs';
import { test } from 'vitest';

// Clave desde el entorno o desde .env.local (gitignored) — NUNCA hardcodear.
function resolveKey(): string | undefined {
  if (process.env.NASDAQ_DATA_LINK_API_KEY) return process.env.NASDAQ_DATA_LINK_API_KEY;
  try {
    const m = fs.readFileSync('.env.local', 'utf8').match(/^NASDAQ_DATA_LINK_API_KEY=(.*)$/m);
    return m ? m[1]!.trim().replace(/^["']|["']$/g, '') : undefined;
  } catch { return undefined; }
}
const KEY = resolveKey();
const BASE = 'https://data.nasdaq.com/api/v3/datatables';
const START = '2004-01-01'; // ~20 años → potencia; ampliable a 1999 con SEP
const LB = 252, STEP = 21, HOLD = 21; // 12-1 momentum, rebalance y hold mensual (días de trading)
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const tstat = (a: number[]) => mean(a) / (std(a) / Math.sqrt(a.length));

/** Fetch paginado de una datatable de Nasdaq Data Link → filas como objetos. */
async function fetchDatatable(table: string, params: Record<string, string>): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ ...params, api_key: KEY!, 'qopts.per_page': '10000' });
    if (cursor) qs.set('qopts.cursor_id', cursor);
    const res = await fetch(`${BASE}/${table}.json?${qs}`);
    if (!res.ok) throw new Error(`${table} HTTP ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as { datatable: { data: any[][]; columns: { name: string }[] }; meta?: { next_cursor_id?: string } };
    const cols = j.datatable.columns.map((c) => c.name);
    for (const row of j.datatable.data) { const o: Record<string, any> = {}; cols.forEach((c, i) => (o[c] = row[i])); out.push(o); }
    cursor = j.meta?.next_cursor_id ?? undefined;
  } while (cursor);
  return out;
}

test.skipIf(!process.env.RUN_BACKTEST || !KEY)('S&P 500 cross-sectional momentum (survivorship-free)', async () => {
  // ── 1. Membresía point-in-time desde SHARADAR/SP500 (eventos added/removed) ──
  const events = (await fetchDatatable('SHARADAR/SP500', {})).map((e) => ({ date: String(e.date), action: String(e.action).toLowerCase(), ticker: String(e.ticker) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const everMembers = [...new Set(events.map((e) => e.ticker))];
  function membershipAt(dateStr: string): Set<string> {
    const m = new Set<string>();
    for (const e of events) { if (e.date > dateStr) break; if (e.action.includes('add')) m.add(e.ticker); else m.delete(e.ticker); }
    return m;
  }

  // ── 2. Precios closeadj (survivorship-free) de todos los ever-members ──
  const priceRows = await fetchDatatable('SHARADAR/SEP', { ticker: everMembers.join(','), 'date.gte': START, 'qopts.columns': 'ticker,date,closeadj' });
  const px = new Map<string, Map<string, number>>();
  for (const r of priceRows) { const t = String(r.ticker); if (!px.has(t)) px.set(t, new Map()); px.get(t)!.set(String(r.date), Number(r.closeadj)); }
  // calendario maestro = fechas de SPY (proxy de días de trading)
  const spyTk = px.has('SPY') ? 'SPY' : everMembers.find((t) => (px.get(t)?.size ?? 0) > 4000)!;
  const cal = [...(px.get(spyTk)?.keys() ?? [])].sort();
  const closeOnOrBefore = (t: string, d: string) => { const m = px.get(t); if (!m) return null; if (m.has(d)) return m.get(d)!; let best: number | null = null; for (const [k, v] of m) { if (k <= d) best = v; else break; } return best; };

  // ── 3. Motor de momentum: deciles, spread long-short, forward mensual ──
  const spread: number[] = [];
  for (let j = LB; j < cal.length - HOLD - 1; j += STEP) {
    const [dT, dSkip, dLB, dFwd] = [cal[j]!, cal[j - STEP]!, cal[j - LB]!, cal[j + HOLD]!];
    const members = membershipAt(dT);
    const rows: { mom: number; fwd: number }[] = [];
    for (const t of members) {
      const cT = px.get(t)?.get(dT), cS = closeOnOrBefore(t, dSkip), cL = closeOnOrBefore(t, dLB), cF = closeOnOrBefore(t, dFwd);
      if (cT == null || cS == null || cL == null || cF == null || cL <= 0 || cT <= 0) continue;
      rows.push({ mom: cS / cL - 1, fwd: ((cF - cT) / cT) * 100 });
    }
    if (rows.length < 50) continue;
    rows.sort((a, b) => b.mom - a.mom);
    const k = Math.floor(rows.length / 10); // deciles
    spread.push(mean(rows.slice(0, k).map((r) => r.fwd)) - mean(rows.slice(-k).map((r) => r.fwd)));
  }

  console.log(`\nEventos SP500: ${events.length} · ever-members: ${everMembers.length} · rebalances: ${spread.length}`);
  console.log('\n=== SPREAD long-short (decil top − bottom momentum), forward mensual ===');
  console.log(`  media ${mean(spread).toFixed(3)}pp/mes · std ${std(spread).toFixed(2)} · t-stat ${tstat(spread).toFixed(2)} · Sharpe anual ${((mean(spread) / std(spread)) * Math.sqrt(12)).toFixed(2)}`);
  console.log(`  neto costes(0.20pp) + borrow(0.17pp): ${(mean(spread) - 0.37).toFixed(3)}pp/mes`);
  console.log(`  %>0: ${Math.round((100 * spread.filter((x) => x > 0).length) / spread.length)}%`);
  console.log('\n(t-stat >2 ≈ significativo al 95%. Con deciles de ~50 la potencia por fin está — ADR-004/005.)');
}, 600_000);
