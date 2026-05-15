/**
 * Tests para agents/a2/prompt.ts
 *
 * Refactor Fase 2 · Tarea 2.1 — Arreglar contradicción A2 §3 vs §4
 *
 * Los tests E2E con LLM real requerirían saldo + tiempo. Aquí verificamos
 * a nivel de PROMPT que las reglas críticas están presentes textualmente:
 *
 *   1. Existe sección "EDGE CASE" para macro_snapshot vacío.
 *   2. Instrucción explícita "NO completes con tu conocimiento de training".
 *   3. Regla "confidence ≤ 20" cuando snapshot insuficiente.
 *   4. NO existe ya el viejo texto "completa con tu conocimiento DE LA
 *      SITUACIÓN ACTUAL" (regression test del fix).
 *   5. Arrays vacíos en factores_clave y correlaciones cuando faltan datos.
 *   6. fed_funds_rate_pct y us_10y_yield_pct deben ir a null.
 */

import { describe, it, expect } from 'vitest';
import { A2_SYSTEM_PROMPT } from '../prompt';

describe('A2_SYSTEM_PROMPT — Fix contradicción §3 vs §4', () => {
  it('incluye sección EDGE CASE para snapshot vacío', () => {
    expect(A2_SYSTEM_PROMPT).toMatch(/EDGE CASE.*VAC[ÍI]O/i);
  });

  it('prohíbe explícitamente completar con conocimiento de training', () => {
    expect(A2_SYSTEM_PROMPT).toMatch(/NO completes con tu conocimiento de training/i);
  });

  it('instruye confidence ≤ 20 cuando snapshot insuficiente', () => {
    expect(A2_SYSTEM_PROMPT).toMatch(/confidence.{0,5}≤.{0,5}20|confidence.{0,5}<=.{0,5}20/);
  });

  it('instruye opportunity_detected: false cuando snapshot vacío', () => {
    expect(A2_SYSTEM_PROMPT).toContain('opportunity_detected');
    expect(A2_SYSTEM_PROMPT).toMatch(/opportunity_detected.{0,5}false/);
  });

  it('instruye factores_clave y correlaciones VACÍOS si no hay datos', () => {
    expect(A2_SYSTEM_PROMPT).toMatch(/factores_clave.{0,30}\[\]/);
    expect(A2_SYSTEM_PROMPT).toMatch(/correlaciones.{0,30}\[\]/);
  });

  it('instruye fed_funds_rate_pct y us_10y_yield_pct a NULL cuando no hay datos', () => {
    expect(A2_SYSTEM_PROMPT).toMatch(/fed_funds_rate_pct.{0,30}null/);
    expect(A2_SYSTEM_PROMPT).toMatch(/us_10y_yield_pct.{0,30}null/);
  });

  it('NO contiene la frase contradictoria vieja "completa con tu conocimiento DE LA SITUACIÓN ACTUAL"', () => {
    // Regression test contra el bug de origen del plan
    expect(A2_SYSTEM_PROMPT).not.toMatch(/completa con tu conocimiento DE LA SITUACI[ÓO]N ACTUAL/i);
  });

  it('NO instruye "completa con tu training" en ninguna sección', () => {
    expect(A2_SYSTEM_PROMPT).not.toMatch(/completa con tu training/i);
  });

  it('justifica el porqué de no inventar (training puede tener cifras desactualizadas)', () => {
    // Flag `s` permite que `.` haga match con saltos de línea (la justificación
    // puede ir partida en varias líneas en el prompt).
    expect(A2_SYSTEM_PROMPT).toMatch(/training.*desactualizad/is);
  });

  it('explica que el sistema sabe procesar el caso degradado', () => {
    expect(A2_SYSTEM_PROMPT).toMatch(/sistema.{0,30}reintentar|caso degradado/i);
  });

  it('regla cuantificada: confidence 20 con honestidad > confidence 70 inventando', () => {
    // Compara las dos opciones para que el modelo internalice la preferencia
    expect(A2_SYSTEM_PROMPT).toMatch(/confidence:?\s*20.{0,200}confidence:?\s*70|honest.{0,50}confidence/i);
  });
});
