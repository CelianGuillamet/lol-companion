import { describe, expect, it } from 'vitest';
import { hasHaste, newCardHint } from '../src/core/cardhints';

const none = { haste: null, hasteItems: null, ultimate: null };

describe('cartes qui dépendent de ta partie', () => {
  it('ne dit rien sur une autre carte', () => {
    expect(newCardHint('Goliath', { haste: 30, hasteItems: 2, ultimate: 'Magnet Storm' })).toBeNull();
  });

  it('One Hit Wonder donne ton accélération lue et le plan', () => {
    expect(newCardHint('One Hit Wonder', { ...none, haste: 26.4, hasteItems: 0 })).toBe('Ton accélération : 26. C’est elle qui fait ses dégâts');
    expect(newCardHint('One Hit Wonder', { ...none, haste: 0, hasteItems: 1 })).toContain('Ton accélération : 0 et 1 item d’accélération au plan.');
    expect(newCardHint('One Hit Wonder', { ...none, haste: 50, hasteItems: 2 })).toContain('2 items d’accélération');
  });

  it('One Hit Wonder sans lecture décrit la carte, sans inventer un chiffre', () => {
    const t = newCardHint('One Hit Wonder', none)!;
    expect(t).toContain('selon ton accélération');
    expect(t).not.toMatch(/\d/);
  });

  it('RISE! nomme ton ultime quand il est lu', () => {
    expect(newCardHint('RISE!', { ...none, ultimate: 'Magnet Storm' })).toBe('Magnet Storm doit donner le coup de grâce : le délai repart, 3 fois maximum');
    expect(newCardHint('RISE', none)).toContain('Ton ultime doit');
  });

  it('reconnaît les 2 catégories d’accélération du client', () => {
    expect(hasHaste(['AbilityHaste', 'Health'])).toBe(true);
    expect(hasHaste(['CooldownReduction'])).toBe(true);
    expect(hasHaste(['Armor'])).toBe(false);
  });
});
