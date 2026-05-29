import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { extractJson } from '@/agents/shared/parser';

/**
 * Anthropic client + model assignment for A.D.A.M.
 *
 * Model assignment (ADR-001 — narración en Haiku, razonamiento en Sonnet):
 *  - Pipeline vivo (narrate*): A1 Haiku · A2 Sonnet · A3 Haiku · A4 Haiku.
 *    A3/A4 narran sobre compute determinista, así que Haiku basta.
 *  - Debate: Sonnet (síntesis A1×A2; downgrade desde Opus por el budget Hobby).
 *  - CMT scanner: Haiku (throughput de batch domina).
 *  - Clients legacy (runA1/A2/A3/A4): Sonnet — hacen razonamiento + narración
 *    en una sola call sin capa compute. Sólo los usan el endpoint legacy
 *    /api/agents/a4 y el per-agent /api/agents/a3.
 *
 * Si cambias esta asignación, actualiza también el narrate.ts/client.ts
 * correspondiente: el budget de coste y latencia del lambda Hobby la asume.
 */

/**
 * Fail-loud cuando una request realmente intenta llamar a Anthropic.
 *
 * Antes era console.warn al import: arrancábamos "OK" y la primera request
 * cascaba con "401 Unauthorized" enterrado en error genérico. Throw al
 * import también es problemático: `next build` instancia los módulos para
 * collect page data y eso aborta el build aunque el key esté bien en runtime.
 *
 * Solución: chequeo en el primer .messages.create() (en runAgent). En tests
 * NODE_ENV='test', los tests mockean runAgent y nunca llegamos aquí.
 */
function assertApiKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      '[A.D.A.M.] ANTHROPIC_API_KEY missing. Set it in .env.local (dev) or Vercel env (prod).'
    );
  }
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Hobby plan: maxDuration=60s. Cada retry × 18s timeout suma. Con
  // 5 calls (A1+A2+A3 paralelos + Debate + A4), aún 2 retries por call
  // mataba lambdas. Bajado a 1 retry → worst case por call ~36s.
  // Combinado con downgrade de Opus → Sonnet en Debate+A4, el pipeline
  // entero cabe en ~40-45s en peor caso.
  maxRetries: 1,
});

export const MODELS = {
  SONNET: 'claude-sonnet-4-6',
  OPUS: 'claude-opus-4-6',
  HAIKU: 'claude-haiku-4-5-20251001',
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];

export interface AgentUsage {
  agent: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface RunAgentArgs<T extends z.ZodTypeAny> {
  systemPrompt: string;
  userMessage: string;
  schema: T;
  model: ModelName;
  maxTokens?: number;
  temperature?: number;
  agentName: string;
  /** Callback opcional para tracking de coste — invocado tras parsing OK */
  onUsage?: (usage: AgentUsage) => void;
  /**
   * Timeout per-call al SDK Anthropic. Default DEFAULT_TIMEOUT_MS (25s) es
   * para callers dentro del pipeline /api/agents/run, donde el budget de
   * 60s de lambda Hobby fuerza moderacion. Callers en lambdas dedicados
   * (ej. /api/agents/a2) pueden subir a 45-50s sin riesgo de 504.
   */
  timeoutMs?: number;
}

/** Timeout default. Calibrado para encajar 5 calls en 60s lambda Hobby. */
const DEFAULT_TIMEOUT_MS = 25_000;

export class AgentParseError extends Error {
  constructor(
    public readonly raw: string,
    public readonly zodIssues: z.ZodIssue[],
    public readonly agent: string
  ) {
    // Mensaje user-facing — incluye el primer issue de Zod si existe.
    // Esto se propaga al frontend en `failures[].message` y permite
    // diagnosticar sin necesidad de revisar logs de Vercel.
    const summary = zodIssues.length > 0
      ? zodIssues
          .slice(0, 3)
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join(' · ')
      : 'JSON inválido (parse error)';
    super(`[${agent}] schema mismatch — ${summary}`);
    this.name = 'AgentParseError';
  }
}

/**
 * Run an agent: non-streaming, JSON-structured output validated against a Zod schema.
 */
export async function runAgent<T extends z.ZodTypeAny>(
  args: RunAgentArgs<T>
): Promise<z.infer<T>> {
  // Fail-loud al primer uso si la key falta. Mejor 1 error claro que N errores
  // crípticos 401 enterrados en stack traces.
  assertApiKey();

  const {
    systemPrompt,
    userMessage,
    schema,
    model,
    maxTokens = 8192,
    temperature = 0.3,
    agentName,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = args;

  // Timeout hard de 18s — un Anthropic colgado NO consume nuestros 60s de maxDuration.
  // El SDK ya hace maxRetries=2 con backoff exponencial. Antes había un wrapper
  // belt-and-suspenders extra (4s sleep + 1 retry final) que sumaba ~22s en
  // peor caso y mataba lambdas en Hobby. Removido. Si el SDK falla tras 2
  // retries, Promise.allSettled del orquestador atrapa y A4 ensambla con
  // partial data — mejor que matar todo el pipeline.
  //
  // Prompt caching (sesión 6c):
  // El system prompt se marca con cache_control: ephemeral (TTL 5min).
  // Si llega a >=1024 tokens, Anthropic lo cachea y la siguiente invocación
  // del MISMO agente dentro de 5 min lee desde cache (-90% input tokens).
  // Casos donde gana mucho:
  //   - CMT escaneando watchlist (N tickers, mismo system prompt)
  //   - Usuarios re-ejecutando análisis sobre el mismo ticker
  //   - Multi-user simultáneo (un user calienta el cache, los demás leen)
  // Si el system prompt es <1024 tokens (a1/a2 lo son hoy), no se cachea
  // pero tampoco hay error — graceful no-op.
  // SDK 0.32 acepta cache_control en runtime pero los types no lo exponen
  // hasta 0.35+. Cast as-any es estándar para esta feature en SDKs < 0.35.
  // Migración: bumpear el SDK retira el cast.
  const systemWithCache = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any;

  // Timeout 25s. REVERT del intento de subirlo a 30s (2026-05-21) que
  // provoco 504 Gateway Timeout en prod: yo mismo calcule mal el worst
  // case suponiendo que Debate y A4 son siempre rapidos (~12s avg),
  // ignorando que tambien pueden hittear el per-call timeout.
  // Worst case real con 30s era 5s data + 30s parallel + 30s Debate +
  // 30s A4 = 95s, muy por encima del lambda Hobby 60s.
  // 25s + Debate ~12s + A4 ~12s + 5s data = ~54s, encaja con cushion.
  // El precio: A2 ocasionalmente cae en P99 y degrada a "parcial".
  // Aceptable hasta migrar a Pro plan (maxDuration 300s).
  //
  // RETRY POLICY (Refactor F2.2):
  //   Si el LLM devuelve JSON malformado o output que no cumple schema,
  //   reintentamos UNA vez más (total 2 intentos). El SDK ya maneja errores
  //   de red (429/5xx) con sus propios retries; lo que añadimos aquí es
  //   resistencia a fallos de PARSING/SCHEMA — outputs sintácticamente
  //   inválidos del modelo o respuestas que no encajan el contrato Zod.
  //   Worst case: 2 × 25s = 50s. Sigue cabiendo en maxDuration=60s.
  return runWithParseRetry({
    agentName,
    schema,
    onUsage: args.onUsage,
    callOnce: () =>
      anthropic.messages.create(
        {
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemWithCache,
          messages: [{ role: 'user', content: userMessage }],
        },
        { timeout: timeoutMs }
      ),
  });
}

/**
 * Retry loop interno — separado de runAgent para que sea testeable sin
 * tocar imports mágicos. Hace hasta `MAX_ATTEMPTS` llamadas al LLM:
 *
 *   - JSON.parse OK + schema OK → devuelve data + tracking de uso
 *   - JSON.parse error → log warn + retry (si quedan attempts)
 *   - schema mismatch → log warn + retry (si quedan attempts)
 *   - Último intento que falla → AgentParseError + log error
 *
 * Errores de red/timeout del SDK NO se reintentan aquí (el SDK ya los
 * maneja con sus propios retries). Si la llamada throws, propagamos hacia
 * fuera para que el caller (orchestrador / Promise.allSettled) decida.
 */
const MAX_ATTEMPTS = 2;

interface RunWithRetryArgs<T extends z.ZodTypeAny> {
  agentName: string;
  schema: T;
  callOnce: () => Promise<Anthropic.Message>;
  onUsage?: (u: AgentUsage) => void;
}

export async function runWithParseRetry<T extends z.ZodTypeAny>(
  args: RunWithRetryArgs<T>
): Promise<z.infer<T>> {
  const { agentName, schema, callOnce, onUsage } = args;
  let lastError: AgentParseError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await callOnce();

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const jsonString = extractJson(text);
    const isFinalAttempt = attempt === MAX_ATTEMPTS;

    // Step 1: JSON.parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseErr) {
      lastError = new AgentParseError(text, [], agentName);
      const msg = parseErr instanceof Error ? parseErr.message : 'unknown';
      if (isFinalAttempt) {
        // eslint-disable-next-line no-console
        console.error(
          `[${agentName}] JSON.parse failed (attempt ${attempt}/${MAX_ATTEMPTS} · final):`,
          msg,
          '· first 500 chars of raw:',
          text.slice(0, 500).replace(/\n/g, ' ')
        );
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[${agentName}] JSON.parse failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying:`,
          msg
        );
      }
      continue;
    }

    // Step 2: schema.safeParse
    const result = schema.safeParse(parsed);
    if (!result.success) {
      lastError = new AgentParseError(text, result.error.issues, agentName);
      const issueSummary = result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join(' | ');
      if (isFinalAttempt) {
        // eslint-disable-next-line no-console
        console.error(
          `[${agentName}] schema validation failed (attempt ${attempt}/${MAX_ATTEMPTS} · final). Issues:`,
          issueSummary,
          process.env.NODE_ENV !== 'production'
            ? '\nRaw output (first 1500 chars):\n' + text.slice(0, 1500)
            : ''
        );
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[${agentName}] schema mismatch (attempt ${attempt}/${MAX_ATTEMPTS}), retrying. Issues:`,
          issueSummary
        );
      }
      continue;
    }

    // Step 3: success → tracking + return
    if (onUsage && response.usage) {
      try {
        // Las versiones recientes del SDK exponen cache_* — el tipo todavía no
        // las declara, así que las leemos en runtime.
        const usage = response.usage as {
          input_tokens: number;
          output_tokens: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
        onUsage({
          agent: agentName,
          model: (response as { model?: string }).model ?? 'unknown',
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
        });
      } catch {
        /* tracking no debe romper el flujo */
      }
    }
    return result.data;
  }

  // Imposible llegar aquí porque cada iteración o devuelve o setea lastError.
  // Pero TS necesita el throw final.
  throw lastError ?? new AgentParseError('', [], agentName);
}
