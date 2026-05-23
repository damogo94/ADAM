import { describe, expect, it } from 'vitest';
import { GLOSSARY, lookup } from '../glossary';

describe('GLOSSARY', () => {
  it('contiene las claves load-bearing del producto', () => {
    const required = [
      'confluencia',
      'dictamen',
      'anomalia',
      'oportunidad',
      'vulnerabilidad',
      'flip',
      'rb',
      'stop',
      'target',
      'entrada',
      'cmt',
      'stale',
    ];
    for (const key of required) {
      expect(GLOSSARY[key], `falta la entrada "${key}"`).toBeDefined();
      expect(GLOSSARY[key]!.label.length).toBeGreaterThan(0);
      expect(GLOSSARY[key]!.explanation.length).toBeGreaterThan(20);
    }
  });

  it('todas las explicaciones son razonablemente breves (<400 chars)', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.explanation.length, `"${key}" es muy larga`).toBeLessThan(400);
    }
  });
});

describe('lookup', () => {
  it('caso normal', () => {
    expect(lookup('confluencia')).not.toBeNull();
  });

  it('case-insensitive y trim', () => {
    expect(lookup('  CONFLUENCIA ')).not.toBeNull();
    expect(lookup('Confluencia')).not.toBeNull();
  });

  it('término inexistente → null', () => {
    expect(lookup('inexistente_xyz')).toBeNull();
  });
});
