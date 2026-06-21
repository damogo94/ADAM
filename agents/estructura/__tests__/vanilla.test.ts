import { describe, it, expect } from 'vitest';
import { nearestVanillaWall } from '../vanilla';

describe('nearestVanillaWall — interfaz pluggable de muros (manual §3)', () => {
  it('Fase 1: sin muros → null', () => {
    expect(nearestVanillaWall(2000, null, 1)).toBeNull();
    expect(nearestVanillaWall(2000, [], 1)).toBeNull();
  });

  it('devuelve el muro dentro de la banda de tolerancia', () => {
    const walls = [{ strike: 1995 }, { strike: 2100 }];
    expect(nearestVanillaWall(2000, walls, 1)?.strike).toBe(1995); // 0.25% dentro de 1%
  });

  it('descarta muros fuera de la banda', () => {
    expect(nearestVanillaWall(2000, [{ strike: 2100 }], 1)).toBeNull(); // 5% fuera de 1%
  });

  it('ante empate de distancia, gana el de mayor open interest', () => {
    const walls = [
      { strike: 1990, open_interest: 100 },
      { strike: 2010, open_interest: 9000 },
    ];
    expect(nearestVanillaWall(2000, walls, 1)?.strike).toBe(2010);
  });
});
