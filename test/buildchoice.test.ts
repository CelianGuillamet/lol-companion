import { describe, expect, it } from 'vitest';
import { fitWithAlternatives, invested, openCores, preferredCore } from '../src/core/buildchoice';
import { buildProfile, type FitTag } from '../src/core/augfit';

const CAT: Record<number, string[]> = { 1: ['Health'], 2: ['Health', 'Armor'], 3: ['SpellDamage'], 4: ['SpellDamage', 'AbilityHaste'], 5: ['Damage', 'CriticalStrike'], 6: ['Damage'], 30: ['SpellDamage'] };
const cat = (id: number) => CAT[id] ?? [];
const components = (id: number) => (id === 3 ? [30] : []);
const none = () => [];
const tank = { items: [1, 2], winrate: 0.52, games: 8000 };
const ap = { items: [3, 4], winrate: 0.505, games: 4000 };
const crit = { items: [5, 6], winrate: 0.51, games: 3000 };
const aug = (id: number, ...tags: FitTag[]) => ({ id, name: `A${id}`, tags: new Set(tags) });

describe('build poussé par les augments', () => {
  it('passe au build proche qui va avec l’augment', () => {
    expect(preferredCore([tank, ap], [aug(1, 'ap')], [], cat, none)).toMatchObject({ index: 1, base: 0 });
  });

  it('garde le 1er build au-delà de 2 points, ou sur un build trop peu joué', () => {
    expect(preferredCore([tank, { ...ap, winrate: 0.49 }], [aug(1, 'ap')], [], cat, none)).toBeNull();
    expect(preferredCore([tank, { ...ap, games: 900 }], [aug(1, 'ap')], [], cat, none)).toBeNull();
  });

  it('ne bouge pas sans augment, ni sur un augment déjà servi par le 1er build', () => {
    expect(preferredCore([tank, ap], [], [], cat, none)).toBeNull();
    expect(preferredCore([tank, ap], [aug(1, 'tank')], [], cat, none)).toBeNull();
    expect(preferredCore([tank, ap], [aug(1, 'haste'), aug(2, 'attacks')], [], cat, none)).toBeNull();
  });

  it('deux augments opposés s’annulent', () => {
    expect(preferredCore([tank, ap, crit], [aug(1, 'ap'), aug(2, 'tank')], [], cat, none)).toBeNull();
  });

  it('prend le build qui sert le plus d’augments, et ne cite que ceux-là', () => {
    const r = preferredCore([tank, ap, crit], [aug(1, 'ap'), aug(2, 'crit'), aug(3, 'ad')], [], cat, none);
    expect(r?.index).toBe(2);
    expect(r?.augments.map((a) => a.id)).toEqual([2, 3]);
  });

  it('ne change plus une fois de l’argent mis ailleurs, composant compris', () => {
    expect(invested([3, 4], [30], components)).toBe(1);
    expect(preferredCore([tank, ap], [aug(1, 'ap')], [1], cat, components)).toBeNull();
    expect(preferredCore([{ ...ap, winrate: 0.52 }, { ...tank, winrate: 0.51 }], [aug(1, 'tank')], [30], cat, components)).toBeNull();
    expect(openCores([tank, ap], [1], components)).toEqual({ base: 0, open: [] });
  });

  it('compare au build déjà commencé, pas au premier', () => {
    expect(openCores([tank, ap, crit], [5], none)).toEqual({ base: 2, open: [] });
  });

  it('sans catégories d’items (client fermé), rien ne change', () => {
    expect(preferredCore([tank, ap], [aug(1, 'ap')], [], none, none)).toBeNull();
  });
});

describe('note d’une carte tant que le build est ouvert', () => {
  const tankPlan = buildProfile([], tank.items, cat);
  const apPlan = buildProfile([], ap.items, cat);
  const tags = new Set<FitTag>(['ap']);

  it('retire le malus si un build proche va avec la carte, sans donner de bonus', () => {
    expect(fitWithAlternatives(tags, tankPlan, [], 2).delta).toBeLessThan(0);
    expect(fitWithAlternatives(tags, tankPlan, [apPlan], 2)).toEqual({ delta: 0, why: null, good: true });
  });

  it('garde le malus si aucun build proche ne convient, et le bonus du build en cours', () => {
    expect(fitWithAlternatives(new Set<FitTag>(['crit']), tankPlan, [apPlan], 2).delta).toBeLessThan(0);
    expect(fitWithAlternatives(tags, apPlan, [tankPlan], 2).delta).toBeGreaterThan(0);
  });
});
