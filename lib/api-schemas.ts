import { z } from 'zod';

/**
 * Gramática de tickers/símbolos aceptados en la superficie de entrada de la API.
 * Incluye `.` (BRK.B), `-` (BTC-USD), `/` (pares forex), `=` y `^` (futuros e
 * índices: GC=F, ^GSPC). Es un CONTRATO TRANSVERSAL: si un endpoint amplía el
 * charset y los demás no, el mismo activo pasa por unos y 400ea en otros.
 *
 * SSOT único — no re-declares el literal. Un incidente real en prod (GC=F 400eaba
 * por el char `=` tras introducir futuros de metales) nació justo de esta deriva;
 * ver `lib/catalog/__tests__/assets.test.ts`, que importa esta misma constante
 * como check de contrato.
 */
export const TICKER_REGEX = /^[A-Z0-9.\-/=^]+$/i;

/**
 * Campo Zod para el `ticker` del body en los endpoints de agentes. Normaliza a
 * mayúsculas y aplica {@link TICKER_REGEX}. Compón dentro del RequestSchema de
 * cada ruta conservando su `.strict()` (imprescindible en A3/Estructura):
 *
 *   const RequestSchema = z.object({ ticker: TickerField }).strict();
 */
export const TickerField = z
  .string()
  .min(1)
  .max(20)
  .regex(TICKER_REGEX, 'ticker invalido')
  .toUpperCase();
