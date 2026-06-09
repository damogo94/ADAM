/**
 * A.D.A.M. — buildCMTSignal — CMT 100% determinista (cero LLM)
 *
 * Reemplaza al antiguo `runCMT` (un LLM eyeballeando 200 velas y "calculando"
 * de cabeza SMAs/niveles/R-B). Ahora reutiliza `computeTechnical()` —el mismo
 * motor determinista de A3— y deriva la señal CMT del compute:
 *
 *   - números (entrada/stop/target/R-B/indicadores/confianza/invalidación) →
 *     del compute, con R/B≥1.5 FORZADO en código. Cero alucinación aritmética.
 *   - nivel (urgente/atención/monitorear/sin_señal) → mapeo determinista desde
 *     signal + R/B + confianza + entry_type + MTF.
 *   - setup_detected → template determinista con los hechos ya calculados.
 *
 * Beneficios: gratis (0 tokens), instantáneo (0 latencia LLM, el lambda de 60s
 * deja de ser límite), 100% fiable (sin parseos fallidos) y medible/tuneable
 * (los umbrales de nivel son explícitos → cruzar con signal_trade_outcomes).
 *
 * AISLAMIENTO (invariante, igual que A3): sólo ticker + ohlcv (+ intraday para
 * MTF). El guard estructural rechaza cualquier otra clave; al no haber prompt
 * que inyectar, el aislamiento es estructural, no textual.
 *
 * El TIMEFRAME es siempre '1D': la señal sale del compute diario. El intraday
 * NO genera señales 1H (que el cron de outcomes no puede evaluar) — sólo
 * alimenta el MTF (agrega a 4H y ajusta la confianza del setup diario).
 */

import { computeTechnical, type ComputeTechnicalOutput } from '@/agents/a3/compute';
import { CMT_OUTPUT_SCHEMA, type CMTOutput } from './schema';
import type { OHLCVCandle_t } from '@/agents/shared/types';

export interface CMTBuildInput {
  ticker: string;
  /** Velas diarias (idealmente ≥200 para SMA200). */
  ohlcv: OHLCVCandle_t[];
  /** Velas horarias (≥24) → MTF. Opcional; NO genera señal 1H. */
  intraday?: OHLCVCandle_t[];
}

type CMTLevel = CMTOutput['level'];

export function buildCMTSignal(input: CMTBuildInput): CMTOutput {
  // Aislamiento estructural: ninguna clave fuera del set OHLCV.
  const allowed = new Set(['ticker', 'ohlcv', 'intraday']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(
        `[CMT isolation violation] Campo no permitido: "${key}". CMT sólo acepta ticker + ohlcv (+ intraday).`
      );
    }
  }

  const compute = computeTechnical({
    ticker: input.ticker,
    ohlcv: input.ohlcv,
    timeframe: '1D',
    intraday: input.intraday,
  });

  const op = compute.operativa;
  const level = classifyCMTLevel({
    signal: op.signal,
    rb: op.ratio_riesgo_beneficio,
    confidence: compute.confidence,
    entryType: op.entry_type ?? null,
    mtfDivergent: compute.mtf?.alignment === 'divergent',
  });

  const signal: CMTOutput = {
    ticker: compute.ticker,
    level,
    timeframe: '1D',
    setup_detected: buildSetupDetected(compute, level),
    confidence_pct: compute.confidence,
    entry_price: op.entrada,
    stop_loss: op.stop_loss,
    target_price: op.target,
    risk_reward_ratio: op.ratio_riesgo_beneficio,
    indicators: buildIndicators(compute),
    invalidation_factor: compute.factor_invalidacion,
  };

  // Red de seguridad: valida el contrato (enum nivel, longitudes, ≤5 indicators).
  return CMT_OUTPUT_SCHEMA.parse(signal);
}

/**
 * Mapeo determinista del nivel CMT desde el compute. Umbrales explícitos
 * (alineados con las definiciones del prompt legacy), tuneables con datos de
 * outcomes:
 *   - hold / R/B<1.5            → sin_senal (lo descarta el scan, sin persistir)
 *   - R/B≥2.5 · conf≥70 · entrada a mercado · MTF no divergente → urgente
 *   - R/B≥1.8 · conf≥50        → atencion
 *   - resto (R/B≥1.5)          → monitorear
 */
export function classifyCMTLevel(p: {
  signal: 'buy' | 'sell' | 'hold';
  rb: number | null;
  confidence: number;
  entryType: 'market' | 'limit' | null;
  mtfDivergent: boolean;
}): CMTLevel {
  if (p.signal === 'hold' || p.rb == null || p.rb < 1.5) return 'sin_senal';

  const immediate = p.entryType === 'market';
  if (p.rb >= 2.5 && p.confidence >= 70 && immediate && !p.mtfDivergent) return 'urgente';
  if (p.rb >= 1.8 && p.confidence >= 50) return 'atencion';
  return 'monitorear';
}

function buildSetupDetected(c: ComputeTechnicalOutput, level: CMTLevel): string {
  const op = c.operativa;
  if (level === 'sin_senal' || op.signal === 'hold') {
    return `Sin setup operativo con R/B≥1.5 cerca de un nivel — tendencia ${c.tendencia.primaria}, estructura sin trigger inmediato.`.slice(
      0,
      300
    );
  }
  const dir = op.signal === 'buy' ? 'Compra' : 'Venta';
  const tipo = op.entry_type === 'market' ? 'a mercado' : 'en límite';
  const rb = op.ratio_riesgo_beneficio != null ? op.ratio_riesgo_beneficio.toFixed(2) : 'n/d';
  const mtf = c.mtf ? ` · 4H ${c.mtf.alignment}` : '';
  return `${dir} ${tipo} ${op.entrada} · stop ${op.stop_loss} · target ${op.target} (R/B ${rb}) — tendencia ${c.tendencia.primaria} fuerza ${c.tendencia.fuerza}/5, volumen ${c.volumen.estado}${mtf}.`.slice(
    0,
    300
  );
}

function buildIndicators(c: ComputeTechnicalOutput): Record<string, string> {
  const fmt = (n: number | null) => (n == null ? 'n/d' : String(n));
  const cross = c.medias.golden_cross
    ? ' · golden cross'
    : c.medias.death_cross
      ? ' · death cross'
      : '';

  // Máx 5 entradas (lo exige el schema): tendencia, medias, [rsi], volumen, [mtf].
  const ind: Record<string, string> = {
    tendencia: `${c.tendencia.primaria} (fuerza ${c.tendencia.fuerza}/5)`,
    medias: `SMA20 ${fmt(c.medias.sma20)} / SMA50 ${fmt(c.medias.sma50)}${cross}`,
    volumen: c.volumen.estado,
  };
  if (c.osciladores?.rsi14 != null) ind.rsi = `RSI14 ${c.osciladores.rsi14.toFixed(0)}`;
  if (c.mtf) ind.mtf = `4H ${c.mtf.alignment}`;
  return ind;
}
