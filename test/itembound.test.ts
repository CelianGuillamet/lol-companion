import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boundFit, boundItems, boundTarget, legendaryHint, noSellItems, questDone, unknownBound } from '../src/core/itembound';
import { neverDrawn, parseAugmentModule } from '../src/core/augfit';
import { nextBuys, type NextBuyInput } from '../src/core/nextbuy';

const lut = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'tier-list.json'), 'utf8')).itemLut as Record<string, { e: string }>;
const name = (id: number) => `#${id}`;

describe('augments liés à un item', () => {
  it('vise les bons items (noms de la table d’items arammeta)', () => {
    const named = (a: string) => boundItems(a)!.map((id) => lut[id]?.e);
    expect(named('Upgrade Infinity Edge')).toEqual(['Infinity Edge']);
    expect(named("Upgrade Zhonya's")[0]).toBe("Zhonya's Hourglass");
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

  it('connaît les cartes dont le texte demande un item (wiki du 3 nov.)', () => {
    const none = new Set<number>();
    expect(boundTarget('Upgrade Sword of Blossoming Dawn', none, [], 'ap')).toBe(124011);
    expect(boundTarget('Quest: Steel Your Heart', none, [], 'tank')).toBe(3084);
    expect(boundTarget('Steel Your Heart', none, [], 'tank')).toBe(3084);
    expect(boundTarget("Icathia's Fall", none, [{ core: [6664, 1], options: [] }], 'tank')).toBe(6664);
    expect(boundTarget("Wooglet's Witchcap", none, [], 'ap')).toBe(3089);
    // la quête finie convertit les 2 items : rien à racheter
    expect(boundTarget("Wooglet's Witchcap", new Set([228002]), [], 'ap')).toBeNull();
    expect(unknownBound(['Upgrade Sword of Blossoming Dawn'])).toEqual([]);
  });

  it('quête : pousse l’item suivant, jusqu’au dernier', () => {
    expect(boundTarget("Wooglet's Witchcap", new Set([3089]), [], 'ap')).toBe(3157);
    expect(boundTarget("Wooglet's Witchcap", new Set([3157]), [], 'ap')).toBe(3089);
    expect(boundTarget("Wooglet's Witchcap", new Set([3089, 3157]), [], 'ap')).toBeNull();
    expect(boundTarget("Icathia's Fall", new Set([6664]), [], 'tank')).toBe(3068);
    expect(boundTarget('Ultra Hydra', new Set([3748]), [], 'tank')).toBe(3074);
    expect(boundTarget('Ultra Hydra', new Set([3748, 3074]), [], 'tank')).toBe(6698);
    expect(boundTarget('Ultra Hydra', new Set([3074]), [{ core: [1, 6698], options: [] }], 'ad')).toBe(6698); // ton plan d'abord
    // une famille reste une famille : un seul item suffit
    expect(boundTarget('Upgrade Immolate', new Set([6664]), [], 'tank')).toBeNull();
  });

  it('quête : un item vu qui disparaît = converti, même si la récompense n’a pas d’id connu', () => {
    const seen = new Set([6664]);
    expect(questDone("Icathia's Fall", new Set([6664]), seen)).toBe(false);
    expect(questDone("Icathia's Fall", new Set([9999]), seen)).toBe(true);
    expect(boundTarget("Icathia's Fall", new Set([9999]), [], 'tank', seen)).toBeNull();
    expect(questDone("Wooglet's Witchcap", new Set([228002]), new Set())).toBe(true);
    expect(questDone('Upgrade Immolate', new Set(), seen)).toBe(false); // pas une quête
  });

  it('quête finie : ses items ne reviennent pas par le plan', () => {
    const input: NextBuyInput = { owned: [228002], gone: [3089, 3157], gold: 5000, cores: [{ core: [3089, 3157], options: [{ id: 3135, winrate: 0.5 }] }], boots: [], counters: [], allBoots: new Set(), price: () => 3000, components: () => [] };
    expect(nextBuys(input).rows.map((r) => r.id)).toEqual([3135]);
  });
});

describe('cartes liées, relues sur le module du 3 nov.', () => {
  const module = parseAugmentModule(readFileSync(join(__dirname, 'fixtures', 'mayhem-augments-wiki-nov.lua'), 'utf8'));
  const names: Record<number, string> = { 228002: "Wooglet's Witchcap", 9001: "Seeker's Armguard", 9002: "Bami's Cinder", 9003: 'Sheen', 9004: 'Void Immolation', 3157: "Zhonya's Hourglass", 3068: 'Sunfire Aegis' };
  const itemName = (id: number) => names[id] ?? `#${id}`;

  it('couvre toutes les cartes « Upgrade » tirables du module', () => {
    const lua = readFileSync(join(__dirname, 'fixtures', 'mayhem-augments-wiki-nov.lua'), 'utf8');
    const cards = [...lua.matchAll(/^\s*\["(Upgrade [^"]+)"\]/gm)].map((m) => m[1]);
    expect(cards.length).toBeGreaterThanOrEqual(10);
    expect(unknownBound(cards.filter((c) => !neverDrawn(module.get(c.toLowerCase().replace(/[^a-z0-9]/g, ''))?.description ?? '')))).toEqual([]);
  });

  it('Wooglet’s Witchcap compte pour Upgrade Zhonya’s : ni malus, ni Zhonya à racheter', () => {
    const owned = new Set([228002]);
    expect(boundFit("Upgrade Zhonya's", owned, new Set(), itemName)).toMatchObject({ good: true, delta: 0.02 });
    expect(boundTarget("Upgrade Zhonya's", owned, [], 'ap')).toBeNull();
    expect(boundTarget("Upgrade Zhonya's", new Set(), [], 'ap')).toBe(3157);
  });

  it('un composant amélioré évite le malus, l’item fini reste à acheter', () => {
    expect(boundFit("Upgrade Zhonya's", new Set([9001]), new Set(), itemName)).toMatchObject({ good: true, delta: 0.015, why: "Seeker's Armguard la fait déjà marcher" });
    expect(boundFit('Upgrade Sheen', new Set([9003]), new Set(), itemName)?.good).toBe(true);
    expect(boundTarget("Upgrade Zhonya's", new Set([9001]), [], 'ap', new Set(), itemName)).toBe(3157);
  });

  it('Void Immolation compte pour Upgrade Immolate, sans id connu', () => {
    const owned = new Set([9004]);
    expect(boundFit('Upgrade Immolate', owned, new Set(), itemName)).toMatchObject({ delta: 0.02, why: 'tu as déjà Void Immolation' });
    expect(boundTarget('Upgrade Immolate', owned, [], 'tank', new Set(), itemName)).toBeNull();
  });

  it('Bami’s Cinder seul fait marcher Upgrade Immolate', () => {
    expect(boundFit('Upgrade Immolate', new Set([9002]), new Set(), itemName)?.delta).toBe(0.015);
  });

  it('Hubris a son id Mayhem', () => {
    expect(boundFit('Upgrade Hubris', new Set([126697]), new Set(), itemName)?.good).toBe(true);
  });

  it('Ultra Hydra interdit de vendre Tiamat, les autres cartes rien', () => {
    expect(noSellItems('Ultra Hydra')).toEqual([3077]);
    expect(noSellItems('Upgrade Sheen')).toEqual([]);
  });

  it('dit où iront Weapon of Destiny et King Me, sans inventer le cas sans item', () => {
    expect(legendaryHint('Goliath', ['A', 'B'])).toBeNull();
    expect(legendaryHint('Weapon of Destiny', [])).toContain('le wiki ne dit pas');
    expect(legendaryHint('Weapon of Destiny', ['Rabadon'])).toBe('Ira sur Rabadon, invendable ensuite');
    expect(legendaryHint('Weapon of Destiny', ['Rabadon', 'Zhonya'])).toContain('mets ton meilleur item devant');
    expect(legendaryHint('King Me', [])).toContain('achète d’abord');
    expect(legendaryHint('King Me', ['Rabadon'])).toBe('Agit en entrant dans leur porte ou leur catapulte : 1 000 or de stats sur Rabadon');
    expect(legendaryHint('King Me', ['Rabadon', 'Zhonya'])).toContain('change l’ordre avant d’y entrer');
  });
});

describe('revente et cartes', () => {
  it('Tiamat protégé n’est pas proposé à la vente', () => {
    const base: NextBuyInput = {
      owned: [3077, 3006, 1036, 1036, 1036, 1036], bag: [3077, 3006, 1036, 1036, 1036, 1036], gold: 5000,
      cores: [{ core: [3031], options: [] }], boots: [], counters: [], allBoots: new Set([3006]),
      price: (id) => ({ 3077: 1200, 1036: 350, 3006: 1100, 3031: 3500 })[id] ?? null,
      components: () => [], sellValue: () => 100,
    };
    const sold = (x: NextBuyInput) => nextBuys(x).rows[0]?.room?.sell ?? null;
    expect(sold({ ...base, owned: [3077, 3006], bag: [3077, 3006, 3006, 3006, 3006, 3006], noSell: [3077] })).not.toBe(3077);
    expect(sold({ ...base, owned: [3077, 3006], bag: [3077, 3006, 3006, 3006, 3006, 3006] })).toBe(3077);
  });
});
