import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boundFit, boundItems, boundTarget, unknownBound } from '../src/core/itembound';
import { nextBuys, type NextBuyInput } from '../src/core/nextbuy';

const lut = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'tier-list.json'), 'utf8')).itemLut as Record<string, { e: string }>;
const name = (id: number) => `#${id}`;

describe('augments liés à un item', () => {
  it('vise les bons items (noms de la table d’items arammeta)', () => {
    const named = (a: string) => boundItems(a)!.map((id) => lut[id]?.e);
    expect(named('Upgrade Infinity Edge')).toEqual(['Infinity Edge']);
    expect(named("Upgrade Zhonya's")).toEqual(["Zhonya's Hourglass"]);
    expect(named('Upgrade Stormsurge')).toEqual(['Stormsurge']);
    expect(named('Upgrade Immolate')).toEqual(['Sunfire Aegis', 'Hollow Radiance']);
    expect(named('Upgrade Sheen')).toEqual(['Trinity Force', 'Iceborn Gauntlet', 'Lich Bane', 'Essence Reaver']);
    expect(named('Ultra Hydra')).toEqual(['Ravenous Hydra', 'Titanic Hydra', 'Profane Hydra']);
    expect(named('Upgrade Cutlass')).toEqual(['Spectral Cutlass']);
    expect(boundItems('Goredrink')).toBeNull();
  });

  it('repère les « Upgrade X » que l’app ne connaît pas', () => {
    expect(unknownBound(['Upgrade Cutlass', 'Goredrink', 'Upgrade Riftmaker', ' upgrade hubris ', 'Upgraded'])).toEqual(['Upgrade Riftmaker']);
  });

  it('prend d’abord l’item de ton plan, puis la meilleure option, puis le repli de ton build', () => {
    const none = new Set<number>();
    expect(boundTarget('Upgrade Immolate', none, [{ core: [3084, 6664], options: [{ id: 3068, winrate: 0.6 }] }], 'tank')).toBe(6664);
    expect(boundTarget('Upgrade Sheen', none, [{ core: [1, 2], options: [{ id: 3100, winrate: 0.5 }, { id: 3508, winrate: 0.55 }] }], 'ad')).toBe(3508);
    expect(boundTarget('Upgrade Sheen', none, [], 'ap')).toBe(3100);
    expect(boundTarget('Upgrade Sheen', none, [], 'tank')).toBe(6662);
    expect(boundTarget('Upgrade Sheen', none, [], 'ad')).toBe(3078);
    expect(boundTarget('Upgrade Infinity Edge', none, [], 'tank')).toBe(3031);
  });

  it('ne demande rien si un item de la famille est déjà là, ou pour un autre augment', () => {
    expect(boundTarget('Upgrade Immolate', new Set([3068]), [], 'tank')).toBeNull();
    expect(boundTarget('Goredrink', new Set(), [], 'ad')).toBeNull();
  });

  it('note la carte selon ton plan', () => {
    expect(boundFit('Upgrade Infinity Edge', new Set([3031]), new Set(), name)).toMatchObject({ delta: 0.02, good: true, why: 'tu as déjà #3031' });
    expect(boundFit('Upgrade Infinity Edge', new Set(), new Set([3031]), name)).toMatchObject({ delta: 0.015, good: true });
    expect(boundFit('Upgrade Infinity Edge', new Set(), new Set([1]), name)).toMatchObject({ delta: -0.02, good: false, why: 'il te faudrait #3031, hors de ton plan' });
    expect(boundFit('Goredrink', new Set(), new Set(), name)).toBeNull();
  });
});

describe('prochain achat avec un augment lié', () => {
  const base: NextBuyInput = {
    owned: [],
    gold: 5000,
    cores: [
      { core: [10, 11], options: [{ id: 12, winrate: 0.5 }] },
      { core: [20, 21], options: [{ id: 3031, winrate: 0.5 }] },
    ],
    boots: [],
    counters: [],
    allBoots: new Set(),
    price: () => 1000,
  };

  it('passe avant le build et choisit le build qui contient l’item', () => {
    const r = nextBuys({ ...base, bound: [{ id: 3031, why: 'pour Upgrade Infinity Edge, si tu l’as pris' }] });
    expect(r.rows[0]).toMatchObject({ id: 3031, why: 'pour Upgrade Infinity Edge, si tu l’as pris' });
    expect(r.coreIndex).toBe(1);
    expect(r.rows[1].id).toBe(20);
  });

  it('ne change pas le build déjà commencé', () => {
    const r = nextBuys({ ...base, owned: [10], bound: [{ id: 3031, why: 'x' }] });
    expect(r.coreIndex).toBe(0);
    expect(r.rows[0].id).toBe(3031);
    expect(r.rows[1].id).toBe(11);
  });

  it('remplace le conseil gardé pendant une attente', () => {
    expect(nextBuys({ ...base, keep: 11, owned: [10] }).rows[0].id).toBe(11);
    expect(nextBuys({ ...base, keep: 11, owned: [10], bound: [{ id: 3031, why: 'x' }] }).rows[0].id).toBe(3031);
  });

  it('s’efface si tu l’as passé 2 fois', () => {
    const r = nextBuys({ ...base, bound: [{ id: 3031, why: 'x' }], skipped: new Set([3031]) });
    expect(r.rows[0].id).toBe(20);
  });
});
