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
      'Los proveedores (Finnhub/Yahoo) no devuelven datos para este ticker. Comprueba la grafía o prueba con otro activo.',
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
  csrf_blocked: () => ({
    title: 'Origen no autorizado',
    message: 'Esta petición no viene del dominio esperado. Recarga la página y reintenta.',
    tone: 'fatal',
  }),
  invalid: (p) => ({
    title: 'Entrada inválida',
    message: p.detail ?? 'Revisa los datos enviados. Ticker debe ser ej. AAPL, BTC-USD, EUR/USD.',
    tone: 'fatal',
  }),
  Invalid: (p) => ({
    title: 'Entrada inválida',
    message: p.detail ?? humanizeZodIssues(p),
    tone: 'fatal',
  }),
  'Invalid request': (p) => ({
    title: 'Entrada inválida',
    message: p.detail ?? humanizeZodIssues(p),
    tone: 'fatal',
  }),
  duplicate: (p) => ({
    title: 'Ya existe',
    message: p.detail ?? 'Este recurso ya está en tu lista.',
    tone: 'fatal',
  }),
  fetch_failed: () => ({
    title: 'Error al cargar',
    message: 'No se pudo cargar la información. Reintenta o recarga la página.',
    tone: 'transient',
  }),
  update_failed: () => ({
    title: 'Error al actualizar',
    message: 'La operación falló. Reintenta.',
    tone: 'transient',
  }),
  insert_failed: () => ({
    title: 'Error al guardar',
    message: 'No se pudo guardar. Reintenta.',
    tone: 'transient',
  }),
  delete_failed: () => ({
    title: 'Error al borrar',
    message: 'No se pudo eliminar el item. Reintenta.',
    tone: 'transient',
  }),
  fk_violation: () => ({
    title: 'Referencia inválida',
    message: 'El recurso referenciado no existe.',
    tone: 'fatal',
  }),
  forbidden: () => ({
    title: 'Sin permisos',
    message: 'No tienes permiso para esta operación.',
    tone: 'auth',
  }),
  method_not_allowed: () => ({
    title: 'Método no permitido',
    message: 'Esta ruta no acepta el método de la petición.',
    tone: 'fatal',
  }),
  'A1 failed': (p) => ({
    title: 'Agente A1 caído',
    message: humanizeAgentError(p),
    tone: 'transient',
  }),
  'A2 failed': (p) => ({
    title: 'Agente A2 caído',
    message: humanizeAgentError(p),
    tone: 'transient',
  }),
  'A3 failed': (p) => ({
    title: 'Agente A3 caído',
    message: humanizeAgentError(p),
    tone: 'transient',
  }),
  'Debate failed': (p) => ({
    title: 'Debate falló',
    message: humanizeAgentError(p),
    tone: 'transient',
  }),
  'Quote failed': () => ({
    title: 'Cotización no disponible',
    message: 'Los proveedores de mercado no respondieron. Espera unos segundos y reintenta.',
    tone: 'transient',
  }),
};

function humanizeZodIssues(p: ErrorPayload): string {
  const issues = p.zodIssues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return 'Verifica los campos enviados.';
  }
  const first = issues[0] as { path?: (string | number)[]; message?: string };
  const path = first?.path?.join('.') ?? 'campo';
  return `${path}: ${first?.message ?? 'inválido'}`;
}

function humanizeAgentError(p: ErrorPayload): string {
  const detail = p.detail ?? '';
  if (detail.includes('rate-limit') || detail.includes('soft error')) {
    return 'Proveedor de mercado rate-limited. Espera unos segundos y reintenta.';
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
