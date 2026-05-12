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

if (!process.env.ANTHROPIC_API_KEY) {
  // In dev this throws on first import; in prod Vercel build will fail loudly.
  // eslint-disable-next-line no-console
  console.warn('[A.D.A.M.] ANTHROPIC_API_KEY not set — agent calls will fail.');
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

interface RunAgentArgs<T extends z.ZodTypeAny> {
  systemPrompt: string;
  userMessage: string;
  schema: T;
  model: ModelName;
  maxTokens?: number;
  temperature?: number;
  agentName: string;
}

export class AgentParseError extends Error {
  constructor(
    public readonly raw: string,
    public readonly zodIssues: z.ZodIssue[],
    public readonly agent: string
  ) {
    super(`[${agent}] LLM output failed schema validation`);
    this.name = 'AgentParseError';
  }
}

/**
 * Run an agent: non-streaming, JSON-structured output validated against a Zod schema.
 */
export async function runAgent<T extends z.ZodTypeAny>(
  args: RunAgentArgs<T>
): Promise<z.infer<T>> {
  const {
    systemPrompt,
    userMessage,
    schema,
    model,
    maxTokens = 8192,
    temperature = 0.3,
    agentName,
  } = args;

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const jsonString = extractJson(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (parseErr) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error(
        `[${agentName}] JSON.parse failed:`,
        parseErr instanceof Error ? parseErr.message : 'unknown',
        '\nRaw output (first 2000 chars):\n',
        text.slice(0, 2000)
      );
    }
    throw new AgentParseError(text, [], agentName);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error(
        `[${agentName}] schema validation failed. Issues:`,
        JSON.stringify(result.error.issues, null, 2),
        '\nRaw output (first 1500 chars):\n',
        text.slice(0, 1500)
      );
    }
    throw new AgentParseError(text, result.error.issues, agentName);
  }

  return result.data;
}
