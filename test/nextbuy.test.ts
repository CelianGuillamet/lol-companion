import { describe, it, expect } from 'vitest';
import { bestComponent, nextBuys } from '../src/core/nextbuy';

const PRICES: Record<number, number> = { 1: 3000, 2: 3100, 3: 2800, 4: 2900, 9: 1100, 3047: 1200, 3075: 2450 };
const base = {
  gold: 1500,
  cores: [
    { core: [1, 2], options: [{ id: 3, winrate: 0.55 }, { id: 4, winrate: 0.58 }] },
    { core: [5, 6], options: [] },
  ],
  boots: [9],
  counters: [{ title: 'Armure', items: [3047, 3075] }],
  allBoots: new Set([9, 3047, 3111]),
  price: (id: number) => PRICES[id] ?? null,
};

describe('prochain achat', () => {
  it('début de partie : premier item du meilleur build, avec l’or manquant', () => {
    const r = nextBuys({ ...base, owned: [] });
    expect(r.rows[0]).toMatchObject({ id: 1, missing: 1500 });
    expect(r.rows.map((x) => x.id)).not.toContain(9); // pas de bottes avant le premier item
  });

  it('suit le build déjà commencé et place les bottes après le premier item', () => {
    const r = nextBuys({ ...base, owned: [6] });
    expect(r.coreIndex).toBe(1);
    expect(r.rows.map((x) => x.id).slice(0, 2)).toEqual([5, 9]);
  });

  it('options : un winrate élevé sur peu de parties ne passe pas devant un winrate sûr', () => {
    const cores = [{ core: [1, 2], options: [{ id: 3, winrate: 0.55, games: 20000 }, { id: 4, winrate: 0.6, games: 80 }] }];
    const r = nextBuys({ ...base, cores, counters: [], owned: [1, 2, 9] }, 4);
    expect(r.rows.map((x) => x.id)).toEqual([3, 4]);
  });

  it('build fini : items contre l’équipe puis meilleur 3e item, sans 2e paire de bottes', () => {
    const r = nextBuys({ ...base, owned: [1, 2, 9] });
    expect(r.rows.map((x) => x.id)).toEqual([3075, 4, 3]);
  });
});

describe('composants', () => {
  const tree: Record<number, number[]> = { 1: [10, 11], 10: [20, 20], 11: [] };
  const price = (id: number) => ({ 1: 3000, 10: 1300, 11: 900, 20: 400 } as Record<number, number>)[id] ?? null;
  const comps = (id: number) => tree[id] ?? [];
  it('propose le composant le plus cher achetable', () => {
    expect(bestComponent(1, 1000, [], price, comps)).toEqual({ id: 11, price: 900 });
    expect(bestComponent(1, 1500, [], price, comps)).toEqual({ id: 10, price: 1300 });
    expect(bestComponent(1, 1500, [10], price, comps)).toEqual({ id: 11, price: 900 }); // 10 déjà acheté
    expect(bestComponent(1, 300, [], price, comps)).toBeNull();
  });
  it('le premier conseil porte le composant quand l’item est trop cher', () => {
    const r = nextBuys({ ...base, owned: [], gold: 1000, components: (id) => (id === 1 ? [11] : []), price: (id) => (id === 11 ? 900 : base.price(id)) });
    expect(r.rows[0].step).toEqual({ id: 11, price: 900 });
  });
});

describe('items transformés et parcours', () => {
  const base = {
    gold: 3000,
    cores: [{ core: [3119, 3084, 3075], options: [] }],
    boots: [3111],
    counters: [],
    allBoots: new Set([3111, 1001]),
    price: (id: number) => ({ 3119: 2400, 3084: 2800, 3075: 2450, 3111: 1250, 1001: 300, 3121: 2400 } as Record<number, number>)[id] ?? null,
  };
  it('Fimbulwinter compte comme Winter’s Approach : on ne reste pas bloqué dessus', () => {
    const r = nextBuys({ ...base, owned: [3121, 3111] });
    expect(r.rows[0].id).toBe(3084);
  });
  it('le parcours montre tes items finis puis la suite', () => {
    const r = nextBuys({ ...base, owned: [3121, 3111, 1001].slice(0, 2), complete: (id) => id !== 1001 });
    expect(r.plan.map((p) => [p.id, p.owned])).toEqual([[3121, true], [3111, true], [3084, false], [3075, false]]);
  });
});

describe('menace forte', () => {
  it('70 % de magie : Mercury à la place des bottes habituelles, et la RM passe avant la fin du build', () => {
    const r = nextBuys({
      owned: [3084],
      gold: 500,
      cores: [{ core: [3084, 2502, 3068], options: [] }],
      boots: [3047],
      counters: [{ title: 'Résistance magique', items: [3111, 4401], urgent: true }],
      allBoots: new Set([3111, 3047, 1001]),
      price: () => 2500,
    }, 6);
    expect(r.rows.map((x) => x.id)).toEqual([2502, 3111, 4401, 3068]);
  });
});

import { remainingCost } from '../src/core/nextbuy';
describe('or restant', () => {
  // Force of Nature (2800) = Negatron Cloak (900) + Winged Moonplate (800) + 1100 ; Negatron = Null-Magic Mantle (400) + 500
  const P: Record<number, number> = { 4401: 2800, 1057: 900, 3066: 800, 1033: 400 };
  const C: Record<number, number[]> = { 4401: [1057, 3066], 1057: [1033] };
  const price = (id: number) => P[id] ?? null;
  const comps = (id: number) => C[id] ?? [];
  it('retire les composants déjà achetés', () => {
    expect(remainingCost(4401, [1057], price, comps)).toBe(1900);
    expect(remainingCost(4401, [1033, 3066], price, comps)).toBe(1600);
    expect(remainingCost(4401, [], price, comps)).toBe(2800);
  });
  it('l’or manquant se calcule sur ce qu’il reste à payer', () => {
    const r = nextBuys({ owned: [1057], gold: 1500, cores: [{ core: [4401], options: [] }], boots: [], counters: [], allBoots: new Set(), price, components: comps });
    expect(r.rows[0]).toMatchObject({ id: 4401, price: 2800, remaining: 1900, missing: 400 });
  });
  it('propose de finir Negatron avec la cape déjà possédée, au prix réellement payé', () => {
    expect(bestComponent(4401, 500, [1033], price, comps)).toEqual({ id: 1057, price: 500 });
    const r = nextBuys({ owned: [1033], gold: 500, cores: [{ core: [4401], options: [] }], boots: [], counters: [], allBoots: new Set(), price, components: comps });
    expect(r.rows[0]).toMatchObject({ remaining: 2400, missing: 1900, step: { id: 1057, price: 500 } });
  });
  it('ne propose pas une amélioration au-delà du budget restant', () => {
    expect(bestComponent(4401, 499, [1033], price, comps)).toBeNull();
  });
});

describe('amélioration des composants : inventaire physique et recettes partagées', () => {
  const prices: Record<number, number> = { 1: 3000, 10: 1000, 11: 900, 20: 400 };
  const price = (id: number) => prices[id] ?? null;
  it('ne crédite un exemplaire qu’une fois dans une recette qui en demande deux', () => {
    const components = (id: number) => ({ 1: [10], 10: [20, 20] } as Record<number, number[]>)[id] ?? [];
    expect(bestComponent(1, 500, [20], price, components)).toEqual({ id: 20, price: 400 });
    expect(bestComponent(1, 600, [20], price, components)).toEqual({ id: 10, price: 600 });
    // Finir le composant de 1000 pour 200 est préféré au rachat d'une autre base de 400.
    expect(bestComponent(1, 400, [20, 20], price, components)).toEqual({ id: 10, price: 200 });
  });
  it('n’invente pas les sous-composants d’un item déjà fini', () => {
    const components = (id: number) => ({ 1: [10, 11], 10: [20], 11: [20] } as Record<number, number[]>)[id] ?? [];
    expect(bestComponent(1, 500, [10], price, components)).toEqual({ id: 20, price: 400 });
    expect(bestComponent(1, 500, [10, 20], price, components)).toEqual({ id: 11, price: 500 });
  });
  it('compare les achats alternatifs sans réserver le composant à la première branche', () => {
    const components = (id: number) => ({ 1: [11, 10], 10: [20], 11: [20] } as Record<number, number[]>)[id] ?? [];
    expect(bestComponent(1, 600, [20], price, components)).toEqual({ id: 10, price: 600 });
  });
  it('ne propose pas deux fois un composant déjà possédé quand la recette contient deux branches identiques', () => {
    const components = (id: number) => ({ 1: [10, 10], 10: [20, 20] } as Record<number, number[]>)[id] ?? [];
    expect(bestComponent(1, 600, [10, 20], price, components)).toEqual({ id: 10, price: 600 });
  });
});

describe('conseil passé 2 fois', () => {
  it('passe en dernier', () => {
    const r = nextBuys({
      owned: [],
      gold: 0,
      cores: [{ core: [1, 2], options: [] }],
      boots: [],
      counters: [{ title: 'Coups critiques', items: [3157] }],
      allBoots: new Set(),
      price: () => 3000,
      skipped: new Set([3157]),
    }, 5);
    expect(r.rows.map((x) => x.id)).toEqual([1, 2, 3157]);
    expect(r.rows[2].why).toContain('passé 2 fois');
  });
});

describe('menace déjà couverte', () => {
  it('Morello acheté : plus d’Oblivion Orb conseillé', () => {
    const r = nextBuys({ owned: [3165], gold: 0, cores: [{ core: [1], options: [] }], boots: [], counters: [{ title: 'Anti-soins', items: [3916, 3165] }], allBoots: new Set(), price: () => 1000 }, 5);
    expect(r.rows.map((x) => x.id)).toEqual([1]);
  });
});
