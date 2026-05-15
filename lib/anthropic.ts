import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/**
 * Anthropic client + model assignment for A.D.A.M.
 *
 * Model assignment locked 2026-05-09:
 *  - A1, A2, A3:    sonnet  (latency-sensitive, parallel calls)
 *  - DEBATE, A4:    opus    (synthesis quality dominates)
 *  - CMT scanner:   haiku   (batch throughput dominates)
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

/**
 * Errores transitorios de Anthropic. Códigos HTTP que NO son culpa del input
 * y se autocuran con backoff: rate-limit, overload, capacity, transient 5xx.
 */
function isTransientAnthropicError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // Anthropic SDK levanta APIError con .status numérico
  const status = (err as { status?: number }).status;
  if (typeof status === 'number') {
    if (status === 408 || status === 409 || status === 429) return true;
    if (status >= 500 && status <= 599) return true;
  }
  // Algunos errores de red (DNS, socket reset) no traen status pero traen .name
  const name = (err as { name?: string }).name;
  if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError') return true;
  return false;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const MODELS = {
  SONNET: 'claude-sonnet-4-6',
  OPUS: 'claude-opus-4-6',
  HAIKU: 'claude-haiku-4-5-20251001',
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];

/**
 * Strip a fenced JSON block out of an LLM response if present, otherwise
 * return the raw string. Tolerates the model occasionally wrapping output
 * in ```json ... ``` despite instructions, AND tolerates a leading fence
 * with no closing fence (which can happen when max_tokens cuts the response).
 */
function extractJson(text: string): string {
  // Closed fence first
  const closed = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (closed?.[1]) return closed[1].trim();
  // Open fence at the start, no closing — strip the opener
  const opener = text.match(/^\s*```(?:json)?\s*\n?/);
  if (opener) return text.slice(opener[0].length).trim();
  return text.trim();
}

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
}

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

  // Timeout 25s (antes 18s). Subido tras detectar que A2/A3 cronicamente
  // hitteaban 18s con maxTokens=8192 por defecto. Ahora con maxTokens=3000
  // el budget tipico es 8-12s, pero 25s da cushion para cold starts y
  // primera token latency variable.
  // Hobby maxDuration=60s: 3 calls paralelas × 25s = 25s peak (Promise.all),
  // + Sonnet Debate ~12s + Sonnet A4 ~12s = ~50s worst case. Encaja.
  const response = await anthropic.messages.create(
    {
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemWithCache,
      messages: [{ role: 'user', content: userMessage }],
    },
    { timeout: 25_000 }
  );

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const jsonString = extractJson(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (parseErr) {
    // Loguear SIEMPRE (incluso en prod) — sin visibility es imposible
    // diagnosticar por qué un agente devuelve JSON inválido. Trimmamos
    // raw a 500 chars para no spammear Vercel logs.
    // eslint-disable-next-line no-console
    console.error(
      `[${agentName}] JSON.parse failed:`,
      parseErr instanceof Error ? parseErr.message : 'unknown',
      '· first 500 chars of raw:',
      text.slice(0, 500).replace(/\n/g, ' ')
    );
    throw new AgentParseError(text, [], agentName);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    // Schema mismatch — loguear SIEMPRE (issues son críticos para diagnosis).
    // Trimmamos issues a 5 y raw a 1500 chars.
    // eslint-disable-next-line no-console
    console.error(
      `[${agentName}] schema validation failed. Issues:`,
      result.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(' | '),
      process.env.NODE_ENV !== 'production'
        ? '\nRaw output (first 1500 chars):\n' + text.slice(0, 1500)
        : ''
    );
    throw new AgentParseError(text, result.error.issues, agentName);
  }

  // Tracking de uso (no-op si caller no pasa callback)
  if (args.onUsage && response.usage) {
    try {
      // Las versiones recientes del SDK exponen cache_* — el tipo todavía no las
      // declara, así que las leemos en runtime.
      const usage = response.usage as {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
      args.onUsage({
        agent: agentName,
        model,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
      });
    } catch {
      /* tracking callback no debe romper el flujo */
    }
  }

  return result.data;
}
