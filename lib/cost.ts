/**
 * Coste por modelo / por agente — tarifas oficiales Anthropic (USD por MTok).
 *
 * Reemplaza el cálculo blended de `/api/system/route.ts` que mezclaba todo
 * en una sola constante. Ahora cada llamada se atribuye al modelo exacto
 * que la ejecutó, leyendo `usage_breakdown` de `analyses_log`.
 *
 * Cache pricing (Anthropic standard):
 *   - cache_read_input_tokens   → 0.10× input price (90% off)
 *   - cache_creation_input_tokens → 1.25× input price (25% premium, 5min TTL)
 *
 * Refs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */

export interface ModelPricing {
  /** USD por millón de tokens de input estándar. */
  input_usd_per_mtok: number;
  /** USD por millón de tokens de output. */
  output_usd_per_mtok: number;
}

// Tarifas Anthropic vigentes 2026. Si cambian, actualizar aquí — un solo sitio.
const PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6':           { input_usd_per_mtok: 15.0, output_usd_per_mtok: 75.0 },
  'claude-opus-4-7':           { input_usd_per_mtok: 15.0, output_usd_per_mtok: 75.0 },
  'claude-sonnet-4-6':         { input_usd_per_mtok: 3.0,  output_usd_per_mtok: 15.0 },
  'claude-haiku-4-5-20251001': { input_usd_per_mtok: 0.80, output_usd_per_mtok: 4.0 },
  'claude-haiku-4-5':          { input_usd_per_mtok: 0.80, output_usd_per_mtok: 4.0 },
};

// Fallback genérico cuando un modelo no está en la tabla (modelo nuevo
// no actualizado, o registro antiguo con string distinto). Usa Sonnet
// como ballpark conservador — preferimos sobreestimar y nunca silenciar.
const FALLBACK: ModelPricing = { input_usd_per_mtok: 3.0, output_usd_per_mtok: 15.0 };

const CACHE_READ_DISCOUNT = 0.1;       // 10% del input price
const CACHE_CREATION_PREMIUM = 1.25;   // 125% del input price

export interface UsageRow {
  agent: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface CostBreakdown {
  input_usd: number;
  output_usd: number;
  cache_read_usd: number;
  cache_creation_usd: number;
  total_usd: number;
}

export function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? FALLBACK;
}

/**
 * Coste exacto de una llamada LLM dada su uso de tokens.
 *
 * Importante: `input_tokens` que devuelve el SDK ya excluye los cache_read/
 * cache_creation. Así que sumamos las tres líneas — no hay doble conteo.
 */
export function costOf(usage: UsageRow): CostBreakdown {
  const p = pricingFor(usage.model);
  const input_usd = (usage.input_tokens * p.input_usd_per_mtok) / 1_000_000;
  const output_usd = (usage.output_tokens * p.output_usd_per_mtok) / 1_000_000;
  const cache_read = usage.cache_read_input_tokens ?? 0;
  const cache_creation = usage.cache_creation_input_tokens ?? 0;
  const cache_read_usd =
    (cache_read * p.input_usd_per_mtok * CACHE_READ_DISCOUNT) / 1_000_000;
  const cache_creation_usd =
    (cache_creation * p.input_usd_per_mtok * CACHE_CREATION_PREMIUM) / 1_000_000;
  return {
    input_usd,
    output_usd,
    cache_read_usd,
    cache_creation_usd,
    total_usd: input_usd + output_usd + cache_read_usd + cache_creation_usd,
  };
}

export interface AgentAggregate {
  agent: string;
  runs: number;
  models: string[];
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  total_tokens: number;
  cost_usd: number;
  /** Tokens cacheados sobre tokens de input — útil para medir efectividad del prompt caching. */
  cache_hit_rate_pct: number;
}

/**
 * Agrega un conjunto de UsageRow por agent_id. Devuelve un mapa
 * estable para tiles de UI. `models` lista los modelos vistos (suele
 * ser uno, pero el routing puede cambiar a mitad de ventana).
 */
export function aggregateByAgent(usages: UsageRow[]): Map<string, AgentAggregate> {
  const out = new Map<string, AgentAggregate>();
  for (const u of usages) {
    const key = u.agent.toUpperCase();
    let agg = out.get(key);
    if (!agg) {
      agg = {
        agent: key,
        runs: 0,
        models: [],
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        cache_hit_rate_pct: 0,
      };
      out.set(key, agg);
    }
    agg.runs += 1;
    if (!agg.models.includes(u.model)) agg.models.push(u.model);
    agg.input_tokens += u.input_tokens;
    agg.output_tokens += u.output_tokens;
    agg.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
    agg.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
    agg.cost_usd += costOf(u).total_usd;
  }
  for (const agg of out.values()) {
    agg.total_tokens =
      agg.input_tokens +
      agg.output_tokens +
      agg.cache_read_input_tokens +
      agg.cache_creation_input_tokens;
    const inputBilled = agg.input_tokens + agg.cache_read_input_tokens;
    agg.cache_hit_rate_pct = inputBilled > 0
      ? Math.round((agg.cache_read_input_tokens / inputBilled) * 100)
      : 0;
  }
  return out;
}

export interface CostSummary {
  total_tokens: number;
  total_cost_usd: number;
  by_agent: AgentAggregate[];
}

/**
 * Devuelve agregados ordenados por coste descendente — útil para tiles
 * priorizados en /system. "Quién quema más" arriba.
 */
export function summarize(usages: UsageRow[]): CostSummary {
  const byAgent = Array.from(aggregateByAgent(usages).values()).sort(
    (a, b) => b.cost_usd - a.cost_usd
  );
  const total_tokens = byAgent.reduce((acc, a) => acc + a.total_tokens, 0);
  const total_cost_usd = byAgent.reduce((acc, a) => acc + a.cost_usd, 0);
  return { total_tokens, total_cost_usd, by_agent: byAgent };
}
