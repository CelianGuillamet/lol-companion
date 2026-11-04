import { describe, expect, it } from 'vitest';
import { ANVIL_LEVEL, ANVIL_PRICE, anvilAdvice, anvilPick, anvilsBought } from '../src/core/anvil';

const base = { isMayhem: true, level: 15, gold: 900, idle: true, price: ANVIL_PRICE, onMap: null };

describe('enclume conseillée', () => {
  it('build fini en Mayhem : à acheter, avec ou sans or', () => {
    expect(anvilAdvice(base)).toEqual({ price: 750, buy: true, missing: 0 });
    expect(anvilAdvice({ ...base, gold: 600.4 })).toEqual({ price: 750, buy: false, missing: 150 });
  });
  it('rien hors Mayhem, avant le niveau, avec un achat restant, ou absente de la carte', () => {
    expect(anvilAdvice({ ...base, isMayhem: false })).toBeNull();
    expect(anvilAdvice({ ...base, level: ANVIL_LEVEL - 1 })).toBeNull();
    expect(anvilAdvice({ ...base, level: null })).toBeNull();
    expect(anvilAdvice({ ...base, idle: false })).toBeNull();
    expect(anvilAdvice({ ...base, onMap: false })).toBeNull();
    expect(anvilAdvice({ ...base, onMap: true })).not.toBeNull();
  });
});

describe('enclume vue à l’or', () => {
  it('compte les achats, même deux sur une lecture, revenu passif compris', () => {
    expect(anvilsBought(2000, 1250, true, 750)).toBe(1);
    expect(anvilsBought(2000, 1290, true, 750)).toBe(1);
    expect(anvilsBought(3000, 1500, true, 750)).toBe(2);
    expect(anvilsBought(3000, 1540, true, 750)).toBe(2);
  });
  it('ne confond ni un élixir, ni une prime, ni un changement de sac', () => {
    expect(anvilsBought(2000, 1500, true, 750)).toBe(0); // élixir, 500
    expect(anvilsBought(2000, 2100, true, 750)).toBe(0);
    expect(anvilsBought(2000, 1250, false, 750)).toBe(0);
    expect(anvilsBought(2000, 1000, true, 750)).toBe(0); // 1 000 : ni 1 ni 2
    expect(anvilsBought(2000, 1250, true, 0)).toBe(0);
  });
});

describe('repère de choix', () => {
  it('attaque selon le build, défense selon leurs dégâts', () => {
    expect(anvilPick('ad', 0.5)).toContain('létalité');
    expect(anvilPick('ap', 0.5)).toContain('AP');
    expect(anvilPick('tank', 0.7)).toContain('armure, ils');
    expect(anvilPick('tank', 0.3)).toContain('résistance magique, ils');
    expect(anvilPick('tank', 0.5)).toContain('PV');
    expect(anvilPick('tank', null)).toContain('PV');
  });
});
