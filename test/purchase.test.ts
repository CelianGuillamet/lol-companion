import { describe, expect, it } from 'vitest';
import type { NextBuyPanel } from '../src/core/types';
import { purchaseOf } from '../src/renderer/purchase';

const target = { id: 4401, name: 'Force de la nature', icon: null };
const component = { id: 1057, name: 'Manteau de Négatron', icon: null };
type Row = NextBuyPanel['rows'][number];
const panel = (row: Partial<Row> = {}, gold = 500): NextBuyPanel => ({
  gold, buildName: 'Tank',
  rows: [{ item: target, why: 'Résistance magique', price: 2800, remaining: 2400, missing: 1900, ...row }],
});

describe('décision d’achat partagée', () => {
  it('conseille l’objet final devenu achetable plutôt qu’un ancien composant', () => {
    const decision = purchaseOf(panel({ remaining: 500, step: { item: component, price: 200 } }));
    expect(decision).toMatchObject({ kind: 'item', item: target, cost: 500, canBuy: true, goldAfter: 0, missing: 0 });
    expect(decision!.title).toMatch(/^Achète /);
    expect(decision!.title).toContain(target.name);
    expect(decision!.title).not.toContain(component.name);
  });

  it('conseille le composant au montant réellement payé, en gardant l’objectif final', () => {
    const decision = purchaseOf(panel({ step: { item: component, price: 500 } }));
    expect(decision).toMatchObject({ kind: 'component', item: component, target, cost: 500, canBuy: true, goldAfter: 0 });
    expect(decision!.title).toContain(component.name);
    expect(decision!.title).toMatch(/^Achète /);
  });

  it('demande d’économiser sans achat disponible et recalcule l’or manquant', () => {
    const decision = purchaseOf(panel({ missing: 0 })); // ancien montant devenu périmé
    expect(decision).toMatchObject({ kind: 'saving', item: target, cost: 2400, canBuy: false, missing: 1900, goldAfter: null });
    expect(decision!.title).toMatch(/^Économise /);
    expect(decision!.title).toContain(target.name);
  });

  it('ne transforme pas un prix inconnu et missing=0 en achat possible', () => {
    const decision = purchaseOf(panel({ price: null, remaining: null, missing: 0 }, 3000));
    expect(decision).toMatchObject({ kind: 'unknown', cost: null, canBuy: false, missing: null });
    expect(decision!.title).not.toMatch(/^Achète /);
  });

  it('utilise le prix total des états anciens sans remaining, mais respecte un null explicite', () => {
    const legacy = panel({ price: 800, remaining: undefined }, 1000);
    expect(purchaseOf(legacy)).toMatchObject({ kind: 'item', cost: 800, canBuy: true, goldAfter: 200 });
    expect(purchaseOf(panel({ price: 800, remaining: null }, 1000))).toMatchObject({ kind: 'unknown', cost: null, canBuy: false });
  });

  it.each([undefined, NaN, -1, Infinity])('n’autorise pas un achat avec un budget manquant ou invalide : %s', (gold) => {
    const malformed = { ...panel({ step: { item: component, price: 100 } }), gold } as unknown as NextBuyPanel;
    const decision = purchaseOf(malformed);
    expect(decision).toMatchObject({ kind: 'unknown', canBuy: false, missing: null, goldAfter: null });
    expect(decision!.title).not.toMatch(/^Achète /);
  });

  it.each([501, -1, NaN, Infinity])('ignore un composant hors budget ou au prix invalide : %s', (price) => {
    const decision = purchaseOf(panel({ step: { item: component, price } }));
    expect(decision).toMatchObject({ kind: 'saving', item: target, canBuy: false, cost: 2400 });
    expect(decision!.title).not.toContain(component.name);
  });

  it('permet une combinaison gratuite lorsque tous les composants sont déjà payés', () => {
    expect(purchaseOf(panel({ remaining: 0 }, 0))).toMatchObject({ kind: 'item', cost: 0, canBuy: true, goldAfter: 0 });
  });

  it('ne donne aucun conseil sans prochain achat', () => {
    expect(purchaseOf(null)).toBeNull();
    expect(purchaseOf(undefined)).toBeNull();
    expect(purchaseOf({ gold: 1000, buildName: null, rows: [] })).toBeNull();
  });
});

describe('revente', () => {
  const sold = { id: 1058, name: 'Needlessly Large Rod', icon: null };
  const other = { id: 1052, name: 'Amplifying Tome', icon: null };
  it('passe de « économise » à « vends, puis achète », reste calculé avec la vente', () => {
    const buy = purchaseOf(panel({ remaining: 600, step: { item: component, price: 500 }, resale: { items: [sold], gain: 305 } }));
    expect(buy).toMatchObject({ kind: 'item', canBuy: true, item: target, sell: sold, gain: 305, goldAfter: 205, missing: 100 });
    expect(buy!.title).toBe(`Vends ${sold.name}, puis achète ${target.name}`);
  });
  it('nomme les deux ventes', () => {
    expect(purchaseOf(panel({ remaining: 900, resale: { items: [sold, other], gain: 550 } }))!.title).toBe(`Vends ${sold.name} et ${other.name}, puis achète ${target.name}`);
  });
  it('or relu entre-temps : une revente devenue trop courte ne promet plus l’achat', () => {
    expect(purchaseOf(panel({ remaining: 900, resale: { items: [sold], gain: 305 } }))).toMatchObject({ kind: 'saving', sell: null, gain: 0 });
  });
  it('or suffisant : pas de vente', () => {
    expect(purchaseOf(panel({ remaining: 400, resale: { items: [sold], gain: 305 } }))).toMatchObject({ kind: 'item', sell: null, gain: 0, goldAfter: 100 });
  });
});

describe('sac plein', () => {
  const sold = { id: 1036, name: 'Long Sword', icon: null };
  it('dit quoi vendre seulement au moment d’acheter', () => {
    const buy = purchaseOf(panel({ remaining: 400, room: { sell: sold } }));
    expect(buy).toMatchObject({ kind: 'item', canBuy: true, sell: sold });
    expect(buy!.title).toMatch(/^Vends Long Sword, puis achète /);
    expect(purchaseOf(panel({ room: { sell: sold } }))).toMatchObject({ kind: 'saving', sell: null });
  });
  it('6 items finis : ni achat ni économie', () => {
    expect(purchaseOf(panel({ remaining: 400, room: { sell: null, held: true } }))).toMatchObject({ kind: 'full', held: true, title: 'Inventaire plein : termine tes composants avant Force de la nature', sell: null });
    const buy = purchaseOf(panel({ remaining: 400, room: { sell: null } }));
    expect(buy).toMatchObject({ kind: 'full', canBuy: false, cost: null, missing: null, goldAfter: null });
    expect(buy!.title).toMatch(/^Inventaire plein/);
  });
});
