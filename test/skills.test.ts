import { describe, expect, it } from 'vitest';
import { nextSkill, pointsOffPlan, skillLevels, spentPoints } from '../src/core/skills';

// Ordre réel d'Ahri en ARAM (opgg-sample-aram.json).
const AHRI = ['Q', 'W', 'E', 'Q', 'Q', 'R', 'Q', 'W', 'Q', 'W', 'R', 'W', 'W', 'E', 'E'];
const MAX = ['Q', 'W', 'E'];
const lv = (Q: number, W: number, E: number, R: number) => ({ Q, W, E, R });

describe('nextSkill', () => {
  it('suit l’ordre tant que tu le suis', () => {
    expect(nextSkill(AHRI, MAX, lv(0, 0, 0, 0), 1)).toBe('Q');
    expect(nextSkill(AHRI, MAX, lv(1, 1, 1, 0), 3)).toBe('Q');
    expect(nextSkill(AHRI, MAX, lv(3, 1, 1, 0), 6)).toBe('R');
  });

  it('un écart ne casse pas la suite', () => {
    // E pris trop tôt : l'étape E du niveau 3 est validée par ce rang, on continue sur Q.
    expect(nextSkill(AHRI, MAX, lv(1, 0, 2, 0), 3)).toBe('W');
    expect(nextSkill(AHRI, MAX, lv(1, 1, 3, 0), 5)).toBe('Q');
  });

  it('respecte les rangs permis par le niveau', () => {
    // Niveau 3 : Q est déjà à 2 (limite ⌈3/2⌉) alors que l'ordre le demande.
    expect(nextSkill(['Q', 'Q', 'Q', 'W', 'E'], MAX, lv(2, 0, 0, 0), 3)).toBe('W');
    // R impossible avant le 6 même si tu es en retard dans l'ordre.
    expect(nextSkill(AHRI, MAX, lv(2, 1, 1, 0), 5)).toBe('Q');
  });

  it('après les 15 étapes : R puis la priorité de montée', () => {
    expect(nextSkill(AHRI, MAX, lv(5, 5, 3, 2), 16)).toBe('R');
    expect(nextSkill(AHRI, MAX, lv(5, 5, 3, 3), 17)).toBe('E');
    expect(nextSkill(AHRI, MAX, lv(5, 5, 5, 3), 18)).toBe(null);
  });

  it('accepte les champions à R dès le début', () => {
    const jayce = ['Q', 'R', 'W', 'E', 'Q', 'R'];
    expect(nextSkill(jayce, MAX, lv(1, 0, 0, 0), 2)).toBe('R');
  });

  it('ignore ce qui n’est pas un sort', () => {
    expect(nextSkill(['?', 'q', 'W'], MAX, lv(0, 0, 0, 0), 1)).toBe('W');
  });
});

describe('skillLevels', () => {
  it('lit la réponse réelle de activeplayer (capture Sejuani, niveau 15)', () => {
    const l = skillLevels({ E: { abilityLevel: 3, displayName: 'Permafrost' }, Passive: { displayName: 'Fury' }, Q: { abilityLevel: 4 }, R: { abilityLevel: 2 }, W: { abilityLevel: 5 } })!;
    expect(l).toEqual(lv(4, 5, 3, 2));
    expect(spentPoints(l)).toBe(14);
  });
  it('rien sans les 4 sorts', () => {
    expect(skillLevels({ Q: { abilityLevel: 1 } })).toBeNull();
    expect(skillLevels(undefined)).toBeNull();
  });
});

describe('pointsOffPlan', () => {
  it('compte les points hors ordre', () => {
    expect(pointsOffPlan(AHRI.join(''), AHRI, MAX)).toBe(0);
    expect(pointsOffPlan('QWEEQ', AHRI, MAX)).toBe(1);
  });
});
