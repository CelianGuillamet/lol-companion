import { describe, it, expect } from 'vitest';
import { bestComponent, consumedBy, itemToSell, nextBuys, itemSlot, optionsForSlot, resaleFor } from '../src/core/nextbuy';

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

describe('conseil stable', () => {
  it('garde le conseil précédent en tête tant qu’il reste dans la liste', () => {
    const free = nextBuys({ ...base, owned: [] }, 4);
    const second = free.rows[1].id;
    const kept = nextBuys({ ...base, owned: [], keep: second }, 4);
    expect(kept.rows[0].id).toBe(second);
    expect(kept.plan.find((p) => !p.owned)?.id).toBe(second);
    expect(nextBuys({ ...base, owned: [], keep: 999999 }, 4).rows[0].id).toBe(free.rows[0].id);
  });

  it('rang du prochain item : bottes et composants ne comptent pas', () => {
    const fini = new Set([1, 2, 3]);
    expect(itemSlot([], (id) => fini.has(id))).toBe(1);
    expect(itemSlot([1, 2, 3, 9, 1036], (id) => fini.has(id))).toBe(4);
  });

  it('options du rang : on ne mélange pas un 4e item avec un 5e, gonflé par la longueur de la partie', () => {
    // Vraie forme OP.GG : le winrate monte avec le rang (Rabadon 58 % en 4e, 64 % en 5e)
    const merged = [{ id: 7, winrate: 0.6, games: 1700 }, { id: 3, winrate: 0.56, games: 10000 }];
    const fourth = [{ id: 3, winrate: 0.56, games: 10000 }, { id: 7, winrate: 0.53, games: 900 }, { id: 8, winrate: 0.7, games: 12 }];
    const options = optionsForSlot(merged, fourth, () => false);
    expect(options.map((o) => o.id)).toEqual([3, 7]);
    const r = nextBuys({ ...base, cores: [{ core: [1, 2], options }], counters: [], owned: [1, 2, 9] }, 2);
    expect(r.rows.map((x) => x.id)).toEqual([3, 7]);
  });

  it('options du rang : items déjà pris écartés, repli sur les options fusionnées s’il en reste moins de 2', () => {
    const merged = [{ id: 7, winrate: 0.6, games: 1700 }];
    const stats = [{ id: 3, winrate: 0.56, games: 1000 }, { id: 4, winrate: 0.55, games: 1000 }, { id: 3042, winrate: 0.54, games: 1000 }];
    expect(optionsForSlot(merged, stats, (id) => id === 3).map((o) => o.id)).toEqual([4, 3042]);
    expect(optionsForSlot(merged, stats, (id) => id === 3, (id) => (id === 3042 ? 3004 : id)).map((o) => o.id)).toEqual([4, 3004]);
    expect(optionsForSlot(merged, stats, (id) => id !== 4)).toBe(merged);
    expect(optionsForSlot(merged, undefined, () => false)).toBe(merged);
  });
});

describe('revente comptée dans l’or disponible', () => {
  // 100 = composant de 200, 101 et 102 = composants orphelins, 300-302 = items finis, 900 = bottes
  const P: Record<number, number> = { 100: 875, 101: 350, 102: 435, 103: 1300, 200: 3000, 201: 2800, 300: 3000, 301: 3000, 302: 3000, 900: 1100 };
  const SELL: Record<number, number> = { 100: 612, 101: 245, 102: 305, 300: 2100, 900: 770 };
  const comps = (id: number) => (({ 200: [100] }) as Record<number, number[]>)[id] ?? [];
  const finished = (id: number) => id >= 200;
  const input = { boots: [], counters: [], allBoots: new Set([900]), price: (id: number) => P[id] ?? null, components: comps, complete: finished, sellValue: (id: number) => SELL[id] ?? null };

  it('sac plein : la vente imposée compte, l’achat passe au lieu d’« économise »', () => {
    const bag = [300, 301, 302, 900, 303, 101];
    const r = nextBuys({ ...input, gold: 2600, owned: bag, bag, cores: [{ core: [201], options: [] }] }).rows[0];
    expect(r.missing).toBe(200);
    expect(r.room).toEqual({ sell: 101 });
    expect(r.resale).toEqual({ sell: [101], gain: 245 });
    expect(r.step).toBeUndefined();
  });

  it('ajoute une 2e vente si la 1re ne suffit pas, la plus petite somme d’abord', () => {
    const bag = [300, 301, 302, 900, 101, 102];
    expect(nextBuys({ ...input, gold: 2400, owned: bag, bag, cores: [{ core: [201], options: [] }] }).rows[0].resale).toEqual({ sell: [101, 102], gain: 550 });
    expect(nextBuys({ ...input, gold: 2600, owned: bag, bag, cores: [{ core: [201], options: [] }] }).rows[0].resale).toEqual({ sell: [101], gain: 245 });
    expect(nextBuys({ ...input, gold: 2200, owned: bag, bag, cores: [{ core: [201], options: [] }] }).rows[0].resale).toBeUndefined();
  });

  it('avec de la place, vend seulement un composant sans usage', () => {
    const bag = [300, 900, 101];
    const r = nextBuys({ ...input, gold: 2600, owned: bag, bag, cores: [{ core: [201], options: [] }] }).rows[0];
    expect(r.resale).toEqual({ sell: [101], gain: 245 });
    expect(r.room).toBeUndefined();
  });

  it('ne vend jamais un composant de l’item visé ni d’un achat prévu', () => {
    const bag = [300, 900, 100];
    expect(nextBuys({ ...input, gold: 2000, owned: bag, bag, cores: [{ core: [200], options: [] }] }).rows[0].resale).toBeUndefined();
    expect(nextBuys({ ...input, gold: 2600, owned: bag, bag, cores: [{ core: [201, 200], options: [] }] }).rows[0].resale).toBeUndefined();
  });

  it('valeur inconnue : l’objet ne compte pas, rien n’est supposé', () => {
    const bag = [300, 900, 103];
    expect(nextBuys({ ...input, gold: 2700, owned: bag, bag, cores: [{ core: [201], options: [] }] }).rows[0].resale).toBeUndefined();
    const sans = nextBuys({ ...input, sellValue: undefined, gold: 2700, owned: [101], bag: [101], cores: [{ core: [201], options: [] }] }).rows[0];
    expect(sans.resale).toBeUndefined();
  });

  it('or suffisant : aucune vente pour rien, et seul le 1er conseil en parle', () => {
    const bag = [300, 900, 101];
    expect(nextBuys({ ...input, gold: 5000, owned: bag, bag, cores: [{ core: [201], options: [] }] }).rows[0].resale).toBeUndefined();
    const rows = nextBuys({ ...input, gold: 2600, owned: bag, bag, cores: [{ core: [201, 301], options: [] }] }).rows;
    expect(rows[1].resale).toBeUndefined();
  });

  it('plus rien à vendre : pas de revente', () => {
    const six = [300, 301, 302, 303, 900, 304];
    expect(nextBuys({ ...input, gold: 2700, owned: six, bag: six, cores: [{ core: [201], options: [] }] }).rows[0].resale).toBeUndefined();
  });

  it('resaleFor retire aussi la bonne copie d’un composant en double', () => {
    expect(resaleFor(200, 500, [100, 100], [200], null, () => false, () => false, (id) => P[id] ?? null, comps, (id) => SELL[id] ?? null)).toEqual({ sell: [100], gain: 612 });
  });
});

describe('sac plein', () => {
  // 100 = Pickaxe, 101 = Long Sword, 102 = Potion ; 200 se construit sur 100, 201 sur rien que tu aies ; 300-303 = items finis
  const P: Record<number, number> = { 111: 300, 100: 875, 101: 350, 102: 150, 110: 1000, 200: 3000, 201: 2800, 300: 3000, 301: 3000, 302: 3000, 303: 3000, 900: 1100 };
  const comps = (id: number) => (({ 200: [100], 201: [110], 110: [111] }) as Record<number, number[]>)[id] ?? [];
  const finished = (id: number) => id >= 200 && id < 900 || id === 900;
  const input = { gold: 5000, boots: [], counters: [], allBoots: new Set([900]), price: (id: number) => P[id] ?? null, components: comps, complete: finished };
  const bag = [300, 301, 900, 302, 100, 101];

  it('passe en tête l’item qui consomme un composant du sac', () => {
    const r = nextBuys({ ...input, owned: bag, bag, cores: [{ core: [300, 201, 200], options: [] }] });
    expect(r.rows[0].id).toBe(200);
    expect(r.rows[0].room).toBeUndefined();
    expect(r.rows[1].id).toBe(201);
    expect(r.rows[1].room).toEqual({ sell: 101 }); // Pickaxe sert à 200 : on vend le reste
  });

  it('demande de vendre le composant le moins cher, ni fini ni bottes', () => {
    const r = nextBuys({ ...input, owned: [300, 301, 900, 302, 101, 102], bag: [300, 301, 900, 302, 101, 102], cores: [{ core: [201], options: [] }] });
    expect(r.rows[0].room).toEqual({ sell: 102 });
  });

  it('6 items finis : rien à vendre', () => {
    const six = [300, 301, 302, 303, 900, 200];
    const r = nextBuys({ ...input, owned: six, bag: six, cores: [{ core: [201], options: [] }] });
    expect(r.rows[0].room).toEqual({ sell: null });
  });

  it('une menace forte reste devant, avec la vente à faire', () => {
    const r = nextBuys({ ...input, owned: bag, bag, cores: [{ core: [300, 200], options: [] }], counters: [{ title: 'Armure', items: [201], urgent: true }] });
    expect(r.rows[0].id).toBe(201);
    expect(r.rows[0].room).toEqual({ sell: 101 });
  });

  it('ne propose pas un composant sans place', () => {
    const r = nextBuys({ ...input, gold: 1200, owned: bag, bag, cores: [{ core: [201], options: [] }] });
    expect(r.rows[0].step).toBeUndefined();
    const free = bag.slice(0, 5);
    expect(nextBuys({ ...input, gold: 1200, owned: free, bag: free, cores: [{ core: [201], options: [] }] }).rows[0].step?.id).toBe(110);
  });

  it('un composant qui consomme le sien passe, même sac plein', () => {
    const b = [300, 301, 900, 302, 303, 111];
    const r = nextBuys({ ...input, gold: 800, owned: b, bag: b, cores: [{ core: [201], options: [] }] });
    expect(r.rows[0].room).toBeUndefined(); // 201 → 110 → 111 : la recette consomme 111
    expect(r.rows[0].step?.id).toBe(110);
  });

  it('5 places prises ou sac inconnu : rien ne change', () => {
    const five = bag.slice(0, 5);
    expect(nextBuys({ ...input, owned: five, bag: five, cores: [{ core: [201], options: [] }] }).rows[0].room).toBeUndefined();
    expect(nextBuys({ ...input, owned: bag, cores: [{ core: [201], options: [] }] }).rows[0].room).toBeUndefined();
  });

  it('ne vend jamais un Tear, une quête de support ou une Dark Seal', () => {
    expect(itemToSell([300, 3070, 3865, 1082], [], () => false, () => false, () => 100, () => [])).toBe(300);
    expect(itemToSell([3070, 3865, 1082], [], () => false, () => false, () => 100, () => [])).toBeNull();
  });

  it('ne vend pas un objet sans prix connu (objet Mayhem hors catalogue) ni un objet cher', () => {
    const price = (id: number) => (id === 1 ? null : id === 2 ? 2500 : 300);
    expect(itemToSell([1, 2, 3], [], () => false, () => false, price, () => [])).toBe(3);
    expect(itemToSell([1, 2], [], () => false, () => false, price, () => [])).toBeNull();
  });

  it('consumedBy descend la recette et compte chaque item une fois', () => {
    const c = (id: number) => (({ 1: [2, 2], 2: [3] }) as Record<number, number[]>)[id] ?? [];
    expect(consumedBy(1, [2, 3], c)).toEqual([2, 3]);
    expect(consumedBy(1, [2, 2], c)).toEqual([2, 2]);
    expect(consumedBy(1, [9], c)).toEqual([]);
  });
});
