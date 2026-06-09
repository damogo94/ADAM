/**
 * Tests para agents/shared/atlas-capital-style.ts
 *
 * Garantiza que:
 *   1. La constante contiene las 5 reglas canónicas del plan §1.2.
 *   2. Todos los prompts que deben usarla la incluyen efectivamente (regression
 *      against alguien quitando el import o el `${ATLAS_CAPITAL_STYLE}` sin
 *      darse cuenta).
 *   3. NO existen definiciones duplicadas — el bloque solo aparece UNA vez
 *      por prompt (no copy-paste accidental + import).
 */

import { describe, it, expect } from 'vitest';
import { ATLAS_CAPITAL_STYLE } from '../atlas-capital-style';
import { A1_SYSTEM_PROMPT } from '@/agents/a1/prompt';
import { A2_SYSTEM_PROMPT } from '@/agents/a2/prompt';
import { A3_SYSTEM_PROMPT } from '@/agents/a3/prompt';
import { A4_SYSTEM_PROMPT } from '@/agents/a4/prompt';
import { DEBATE_SYSTEM_PROMPT } from '@/agents/debate/prompt';
// CMT ya NO usa LLM/prompt (es 100% determinista: agents/cmt/build-signal.ts),
// por eso no participa en estas comprobaciones de estilo de prompt.

describe('ATLAS_CAPITAL_STYLE — constante', () => {
  it('contiene las 5 reglas canónicas del plan §1.2', () => {
    expect(ATLAS_CAPITAL_STYLE).toContain('Directo, sin relleno');
    expect(ATLAS_CAPITAL_STYLE).toContain('Cuantifica');
    expect(ATLAS_CAPITAL_STYLE).toContain('Tiempo presente y futuro cercano');
    expect(ATLAS_CAPITAL_STYLE).toContain('Sin jerga vacía');
    expect(ATLAS_CAPITAL_STYLE).toContain('Frases cortas');
  });

  it('empieza con el header "# LENGUAJE ATLAS CAPITAL"', () => {
    expect(ATLAS_CAPITAL_STYLE.startsWith('# LENGUAJE ATLAS CAPITAL')).toBe(true);
  });

  it('no termina con whitespace extra (está .trim()-eada)', () => {
    expect(ATLAS_CAPITAL_STYLE).toBe(ATLAS_CAPITAL_STYLE.trim());
  });
});

describe('Interpolación en prompts — la constante aparece en cada agente', () => {
  const cases: { name: string; prompt: string }[] = [
    { name: 'A1', prompt: A1_SYSTEM_PROMPT },
    { name: 'A2', prompt: A2_SYSTEM_PROMPT },
    { name: 'A3', prompt: A3_SYSTEM_PROMPT },
    { name: 'A4', prompt: A4_SYSTEM_PROMPT },
    { name: 'Debate', prompt: DEBATE_SYSTEM_PROMPT },
  ];

  it.each(cases)('$name incluye ATLAS_CAPITAL_STYLE textualmente', ({ prompt }) => {
    expect(prompt).toContain(ATLAS_CAPITAL_STYLE);
  });

  it.each(cases)('$name incluye el bloque solo UNA vez (no duplicado)', ({ prompt }) => {
    // Contar ocurrencias del header del bloque
    const header = '# LENGUAJE ATLAS CAPITAL';
    const occurrences = prompt.split(header).length - 1;
    expect(occurrences).toBe(1);
  });
});

describe('Anti-regresión: no hay definiciones inline viejas (5 bullets sueltos)', () => {
  // Antes A4 tenía las 5 reglas escritas a mano en §10. Si alguien las
  // restaura accidentalmente además del import, este test salta.
  const ALL_PROMPTS = [
    A1_SYSTEM_PROMPT,
    A2_SYSTEM_PROMPT,
    A3_SYSTEM_PROMPT,
    A4_SYSTEM_PROMPT,
    DEBATE_SYSTEM_PROMPT,
  ].join('\n\n---\n\n');

  it('"Directo, sin relleno" aparece exactamente el número de veces de los prompts (1 por prompt vía import)', () => {
    const count = (ALL_PROMPTS.match(/Directo, sin relleno/g) ?? []).length;
    expect(count).toBe(5);
  });
});
