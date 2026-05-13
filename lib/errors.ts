/**
 * Diccionario de errores conocidos del backend → mensajes en español + acción concreta.
 *
 * Mantén SINCRONIZADO con los `error` strings que devuelven los API routes:
 * - app/api/agents/a4/route.ts
 * - app/api/cmt/scan/route.ts
 * - app/api/watchlist/route.ts
 * - middleware.ts
 *
 * Si el backend devuelve un código no listado aquí, se usa el `detail` o un fallback genérico.
 */

interface ErrorPayload {
  error?: string;
  detail?: string;
  agent?: string;
  failures?: { agent: string; message: string }[];
  zodIssues?: unknown[];
}

interface UserError {
  /** Título corto, una línea, ej. "Cuota diaria alcanzada" */
  title: string;
  /** Frase explicativa o instrucción concreta */
  message: string;
  /** Variante visual */
  tone: 'rate_limit' | 'transient' | 'auth' | 'partial' | 'fatal';
}

const DICT: Record<string, (p: ErrorPayload) => UserError> = {
  unauthorized: () => ({
    title: 'Sesión expirada',
    message: 'Inicia sesión de nuevo para continuar.',
    tone: 'auth',
  }),
  user_quota_exceeded: (p) => ({
    title: 'Cuota diaria alcanzada',
    message: p.detail ?? 'Has consumido tu límite de 20 análisis al día. Se renueva en unas horas.',
    tone: 'rate_limit',
  }),
  rate_limit_exceeded: (p) => ({
    title: 'Demasiadas peticiones',
    message: p.detail ?? 'Has superado el límite por minuto. Espera unos segundos.',
    tone: 'rate_limit',
  }),
  rate_limit_unavailable: () => ({
    title: 'Servicio momentáneamente saturado',
    message: 'Reintenta en unos segundos.',
    tone: 'transient',
  }),
  market_data_unavailable: () => ({
    title: 'Sin datos de mercado',
    message:
      'Alpha Vantage no responde para este ticker (free-tier 25/día). Espera 1 min y reintenta, o prueba con otro activo.',
    tone: 'transient',
  }),
  all_agents_failed: (p) => ({
    title: 'Servicio de IA saturado',
    message: `Los 3 agentes fallaron transitoriamente${p.failures?.length ? ' (' + p.failures.map((f) => f.agent).join(', ') + ')' : ''}. Anthropic puede estar en pico de carga. Reintenta en 30-60s.`,
    tone: 'transient',
  }),
  orchestration_failed: (p) => ({
    title: p.agent ? `Error en agente ${p.agent}` : 'Error en orquestación',
    message: humanizeAgentError(p),
    tone: 'fatal',
  }),
  no_quote: (p) => ({
    title: 'Ticker sin cotización',
    message: p.detail ?? 'No se encontró cotización para ese ticker. Verifica que sea válido (ej. AAPL, BTC-USD, EUR/USD).',
    tone: 'fatal',
  }),
};

function humanizeAgentError(p: ErrorPayload): string {
  const detail = p.detail ?? '';
  if (detail.includes('rate-limit') || detail.includes('soft error')) {
    return 'Alpha Vantage te tiene rate-limited. Espera 1 minuto y reintenta.';
  }
  if (detail.includes('Overloaded') || detail.includes('529')) {
    return 'Anthropic en pico de carga. Reintenta en unos segundos.';
  }
  if (detail.includes('schema validation')) {
    return 'El modelo devolvió un output inválido. Suele autocurarse al reintentar.';
  }
  if (detail.includes('timed out') || detail.includes('timeout')) {
    return 'Tiempo de espera agotado. Reintenta.';
  }
  return detail || 'Error desconocido en el pipeline. Reintenta o revisa los logs.';
}

/**
 * Resuelve la respuesta del backend a un mensaje user-friendly.
 * Tolera tanto un payload JSON parseado como un Error/string.
 */
export function resolveError(payload: ErrorPayload | string | undefined): UserError {
  if (!payload) {
    return { title: 'Error', message: 'Error desconocido.', tone: 'fatal' };
  }
  if (typeof payload === 'string') {
    return { title: 'Error', message: payload, tone: 'fatal' };
  }
  const code = payload.error ?? '';
  const handler = DICT[code];
  if (handler) return handler(payload);
  // Fallback: muestra detail si existe, code si no
  return {
    title: code || 'Error',
    message: payload.detail ?? 'Error desconocido en el servidor. Reintenta.',
    tone: 'fatal',
  };
}

/** Para errores de red puro (fetch reject) — sin payload del backend */
export function networkError(err: unknown): UserError {
  const msg = err instanceof Error ? err.message : 'unknown';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return {
      title: 'Sin conexión',
      message: 'No se pudo contactar con el servidor. Verifica tu conexión a internet.',
      tone: 'transient',
    };
  }
  return { title: 'Error de red', message: msg, tone: 'transient' };
}

export type { UserError, ErrorPayload };
