/**
 * Helper compartido para disparar el Agente de Estructura desde el cliente.
 *
 * Devuelve la Response CRUDA — cada caller maneja error/abort/401/parse a su
 * manera (run-provider degrada a null silencioso; /estructura surface el error
 * tipado). Deduplica el fetch que estaba COPIADO en
 * components/analysis/run-provider.tsx y app/estructura/page.tsx — un cambio de
 * endpoint/headers/body ahora vive en un solo sitio. (Auditoría Fase 0 · G3, no
 * destructivo: /estructura sigue standalone, con su deep-link y lienzo aislado.)
 *
 * Deliberadamente NO es un agents/estructura/client.ts: no narra ni valida, solo
 * dispara el POST. El contrato del agente (aislamiento OHLCV-only) vive server-side.
 */
export function postEstructura(ticker: string, signal?: AbortSignal): Promise<Response> {
  return fetch('/api/agents/estructura', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker }),
    signal,
  });
}
