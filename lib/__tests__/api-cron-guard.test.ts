/**
 * Tests del guard de cron compartido (lib/api-helpers.ts) — 7 call sites dependen
 * de su semántica exacta (5 crons puros + el modo dual de /api/cmt/scan).
 *
 * requireCronSecret: fail-closed (500 sin secret, 401 mismatch, null si pasa).
 * isCronRequest: booleano NO fail-closed (para el path dual cron+manual).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireCronSecret, isCronRequest } from '../api-helpers';

const SECRET = 'test-secret';

function req(authorization?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/x', {
    method: 'GET',
    headers: authorization ? { authorization } : {},
  });
}

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('requireCronSecret — fail-closed', () => {
  it('500 si CRON_SECRET no está configurado (nunca fail-open)', () => {
    const res = requireCronSecret(req(`Bearer ${SECRET}`));
    expect(res?.status).toBe(500);
  });

  it('401 con Bearer incorrecto', () => {
    process.env.CRON_SECRET = SECRET;
    expect(requireCronSecret(req('Bearer wrong'))?.status).toBe(401);
  });

  it('401 sin header', () => {
    process.env.CRON_SECRET = SECRET;
    expect(requireCronSecret(req())?.status).toBe(401);
  });

  it('null (pasa) con el Bearer correcto', () => {
    process.env.CRON_SECRET = SECRET;
    expect(requireCronSecret(req(`Bearer ${SECRET}`))).toBeNull();
  });
});

describe('isCronRequest — dual mode (no fail-closed)', () => {
  it('false si no hay secret (cae al path manual, NO 500)', () => {
    expect(isCronRequest(req(`Bearer ${SECRET}`))).toBe(false);
  });

  it('false con Bearer incorrecto', () => {
    process.env.CRON_SECRET = SECRET;
    expect(isCronRequest(req('Bearer wrong'))).toBe(false);
  });

  it('true con el Bearer correcto', () => {
    process.env.CRON_SECRET = SECRET;
    expect(isCronRequest(req(`Bearer ${SECRET}`))).toBe(true);
  });
});
