// Règles d'affichage partagées par tous les écrans : couleur d'un résultat perso et fiabilité d'un winrate.
import { describe, expect, it } from 'vitest';
import { confidenceOf, statsBehind, tone } from '../src/renderer/store';

describe('tone (résultat perso)', () => {
  it('reste neutre tant que l’écart à 50 % ne tient pas sur l’échantillon', () => {
    expect(tone(1, 1)).toBe('');
    expect(tone(2, 3)).toBe('');
    expect(tone(0, 0)).toBe('');
  });
  it('colore quand l’échantillon le justifie', () => {
    expect(tone(4, 4)).toBe('good');
    expect(tone(0, 5)).toBe('bad');
    expect(tone(60, 100)).toBe('good');
  });
});

describe('confidenceOf (fiabilité d’un winrate)', () => {
  it('trois crans selon la largeur de l’intervalle à 95 %', () => {
    expect(confidenceOf(0.52, 20000).level).toBe(3);
    expect(confidenceOf(0.52, 1000).level).toBe(2);
    expect(confidenceOf(0.6, 80).level).toBe(1);
    expect(confidenceOf(0.5, 0)).toMatchObject({ level: 1, title: 'aucune partie' });
  });
  it('explique la marge en points', () => {
    expect(confidenceOf(0.5, 1000).title).toMatch(/± 3,1 points \(95 %\) sur 1\s000 parties/);
  });
});

describe('statsBehind (stats en retard sur le client)', () => {
  it('signale seulement un vrai écart de patch', () => {
    expect(statsBehind({ patch: '16.21', clientPatch: '16.22' })).toBe(true);
    expect(statsBehind({ patch: '16.21', clientPatch: '16.21' })).toBe(false);
    expect(statsBehind({ patch: '16.21' })).toBe(false);
    expect(statsBehind({ patch: null, clientPatch: '16.22' })).toBe(false);
    expect(statsBehind(null)).toBe(false);
  });
});
