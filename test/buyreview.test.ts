import { describe, expect, it } from 'vitest';
import { buyText, gameOfBuy, itemValues, reviewBuy, reviewBuys } from '../src/core/buyreview';
import type { ItemBought } from '../src/core/usage';

const name = (id: number) => `Item ${id}`;
const buy = (o: Partial<ItemBought>): ItemBought => ({ type: 'item_bought', at: 1000, championId: 54, id: 1, reco: 2, plan: [2, 3], followed: false, ...o });

describe('revue des achats', () => {
  it('conseil suivi, couvert, ou item du plan : jamais une erreur', () => {
    expect(reviewBuy(buy({ id: 2, reco: 2, followed: true }), name).verdict).toBe('followed');
    expect(reviewBuy(buy({ covers: true }), name).verdict).toBe('followed');
    // Vraie partie : bottes prises avant l'item conseillé, l'item étant aussi au plan
    expect(reviewBuy(buy({ id: 3, value: 0.4, games: 9000, recoValue: 0.6, recoGames: 9000 }), name).verdict).toBe('plan');
  });

  it('conseil contre leur équipe ignoré : signalé, sans points', () => {
    const l = reviewBuy(buy({ why: 'contre leur équipe : anti-soins (Soraka)', value: 0.4, games: 9000, recoValue: 0.6, recoGames: 9000 }), name);
    expect(l).toMatchObject({ verdict: 'counter', lost: 0 });
    expect(buyText(l)).toContain('Item 2 était conseillé contre leur équipe : anti-soins');
  });

  it('coûteux seulement si l’écart dépasse 1 point et tient sur l’échantillon', () => {
    const big = reviewBuy(buy({ value: 0.5, games: 5000, recoValue: 0.56, recoGames: 5000 }), name);
    expect(big.verdict).toBe('costly');
    expect(big.lost).toBeCloseTo(0.06);
    expect(buyText(big)).toContain('environ 6,0 pts perdus');
    expect(reviewBuy(buy({ value: 0.5, games: 60, recoValue: 0.56, recoGames: 60 }), name).verdict).toBe('close');
    expect(reviewBuy(buy({ value: 0.56, games: 5000, recoValue: 0.5, recoGames: 5000 }), name).verdict).toBe('close');
  });

  it('Faille : le rang comparé est dit et gardé', () => {
    const l = reviewBuy(buy({ slot: 4, value: 0.53, games: 2700, recoValue: 0.58, recoGames: 10000 }), name);
    expect(l).toMatchObject({ verdict: 'costly', slot: 4 });
    expect(buyText(l)).toMatch(/mieux placé \(58,0.%\) en 4e item/);
  });

  it('sans valeur, ou avec des bottes : non noté plutôt qu’une fausse erreur', () => {
    expect(reviewBuy(buy({ value: 0.5, games: 5000 }), name).verdict).toBe('unknown');
    expect(reviewBuy(buy({ boots: true, value: 0.5, games: 5000, recoValue: 0.56, recoGames: 5000 }), name).verdict).toBe('unknown');
    expect(reviewBuy(buy({ reco: null }), name).verdict).toBe('unknown');
  });

  it('un item racheté compte une fois ; les non notés restent hors du total', () => {
    const r = reviewBuys([buy({ id: 2, reco: 2, followed: true }), buy({ id: 2, reco: 2, followed: true }), buy({ id: 9, reco: 8, plan: [8] }), buy({ id: 3, reco: 2 })], name)!;
    expect(r.lines).toHaveLength(3);
    expect(r).toMatchObject({ analysed: 2, onPlan: 2, lost: 0 });
    expect(reviewBuys([], name)).toBeNull();
  });

  it('les items transformés se retrouvent sous l’id acheté, sans écraser une vraie valeur', () => {
    const v = itemValues([{ id: 3042, winrate: 0.55, games: 900 }, { id: 3121, winrate: 0.5, games: 100 }, { id: 3119, winrate: 0.52, games: 500 }], (id) => ({ 3042: 3004, 3121: 3119 })[id] ?? id);
    expect(v.get(3004)?.winrate).toBe(0.55);
    expect(v.get(3119)?.winrate).toBe(0.52);
  });

  it('retrouve la partie d’un ancien achat : même champion, dans la fenêtre', () => {
    const games = [{ gameId: 1, championId: 54, createdAt: 100_000, durationSec: 1000 }, { gameId: 2, championId: 89, createdAt: 100_000, durationSec: 1000 }];
    expect(gameOfBuy(buy({ at: 500_000 }), games)?.gameId).toBe(1);
    expect(gameOfBuy(buy({ at: 50_000 }), games)).toBeNull();
    expect(gameOfBuy(buy({ at: 100_000 + 1_950_000 }), games)).toBeNull();
  });
});
