/**
 * Harness para tests de route handlers de Next.js.
 *
 * Provee:
 *   - makeRequest(): construye un NextRequest con body JSON.
 *   - makeBuilder(): query-builder encadenable y thenable que imita
 *     postgrest-js (select/insert/update/eq/… devuelven el builder; await
 *     del builder o .single()/.maybeSingle() resuelven el resultado config).
 *   - makeSupabaseMock(): cliente falso con auth.getUser + from(table).
 *
 * Patrón de uso en el test: declarar `vi.mock(...)` con factories que solo
 * devuelven `vi.fn()`, e inyectar el comportamiento en `beforeEach` vía
 * `vi.mocked(...)`. Así se evita el TDZ de referenciar variables externas
 * dentro de una factory de vi.mock (que vitest hoistea).
 */

import { vi } from 'vitest';
import { NextRequest } from 'next/server';

export interface BuilderResults {
  /** Resultado al await-ear el builder directamente (queries sin .single). */
  then?: unknown;
  /** Resultado de .single(). */
  single?: unknown;
  /** Resultado de .maybeSingle(). */
  maybeSingle?: unknown;
}

type MockFn = ReturnType<typeof vi.fn>;

const CHAIN_METHODS = [
  'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
  'contains', 'not', 'or', 'filter', 'match', 'order', 'limit', 'range',
] as const;

type ChainMethod = (typeof CHAIN_METHODS)[number];

// Mapa de claves literales (no index signature) → cada método queda como
// MockFn no-opcional incluso con noUncheckedIndexedAccess.
export type QueryBuilderMock = Record<ChainMethod, MockFn> & {
  single: MockFn;
  maybeSingle: MockFn;
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
};

/** Crea un query-builder encadenable y thenable que imita postgrest-js. */
export function makeBuilder(results: BuilderResults = {}): QueryBuilderMock {
  const thenResult = results.then ?? { data: null, error: null };
  const builder = {} as QueryBuilderMock;
  for (const m of CHAIN_METHODS) {
    builder[m] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(results.single ?? thenResult));
  builder.maybeSingle = vi.fn(() => Promise.resolve(results.maybeSingle ?? thenResult));
  builder.then = (resolve, reject) => Promise.resolve(thenResult).then(resolve, reject);
  return builder;
}

export interface SupabaseMock {
  client: {
    auth: { getUser: ReturnType<typeof vi.fn> };
    from: ReturnType<typeof vi.fn>;
  };
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
}

/** Cliente Supabase falso: auth.getUser + from(table) → builder configurable. */
export function makeSupabaseMock(
  opts: {
    user?: { id: string } | null;
    builders?: Record<string, QueryBuilderMock>;
    defaultBuilder?: QueryBuilderMock;
  } = {}
): SupabaseMock {
  const { user = { id: 'user-1' }, builders = {}, defaultBuilder } = opts;
  const from = vi.fn((table: string) => builders[table] ?? defaultBuilder ?? makeBuilder());
  const auth = { getUser: vi.fn(async () => ({ data: { user }, error: null })) };
  return { client: { auth, from }, auth, from };
}

/** Construye un NextRequest con body JSON serializado. */
export function makeRequest(
  url: string,
  opts: { body?: unknown; headers?: Record<string, string>; method?: string } = {}
): NextRequest {
  const { body, headers = {}, method = 'POST' } = opts;
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
