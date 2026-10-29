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
