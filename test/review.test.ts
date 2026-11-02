import { describe, expect, it } from 'vitest';
import { choiceText, reviewChoice, reviewGame, reviewSummary, roundLabel, type ReviewCard } from '../src/core/review';

const card = (id: number, value: number, games = 20_000, estimated = false): ReviewCard => ({ id, name: `Carte ${id}`, value, games, estimated });

describe('reviewChoice', () => {
  it('reconnaît la meilleure carte, comme le conseil en partie', () => {
    const c = reviewChoice(1, [card(1, 0.52), card(2, 0.56), card(3, 0.5)], 2);
    expect(c).toMatchObject({ verdict: 'best', best: 2, lost: 0 });
    expect(choiceText(c)).toBe('Carte 2 : la meilleure des cartes proposées (56,0\u00a0%).');
  });

  it('note un choix coûteux quand l’écart est net sur beaucoup de parties', () => {
    const c = reviewChoice(2, [card(1, 0.56), card(2, 0.52), card(3, 0.5)], 2);
    expect(c.verdict).toBe('costly');
    expect(c.lost).toBeCloseTo(0.04);
    expect(choiceText(c)).toContain('environ 4,0 pts perdus');
  });

  it('ne dit jamais « coûteux » pour un écart d’un point à peine', () => {
    expect(reviewChoice(1, [card(1, 0.525), card(2, 0.52)], 2).verdict).toBe('close');
  });

  it('dit « proche » quand l’écart ne tient pas sur l’échantillon, même à 5 points', () => {
    const c = reviewChoice(1, [card(1, 0.56, 150), card(2, 0.51, 150)], 2);
    expect(c.verdict).toBe('close');
    expect(c.lost).toBe(0);
  });

  it('ne note pas une carte estimée ni une carte prise non lue', () => {
    expect(reviewChoice(1, [card(1, 0.6, 5000, true), card(2, 0.5)], 2).verdict).toBe('unknown');
    expect(reviewChoice(1, [card(1, 0.6), card(2, 0.5, 5000, true)], 2).verdict).toBe('unknown');
    const notRead = reviewChoice(1, [card(1, 0.6), card(2, 0.5)], null);
    expect(notRead.verdict).toBe('unknown');
    expect(choiceText(notRead)).toContain('non lue');
  });

  it('ne plante pas sans carte connue', () => {
    expect(reviewChoice(1, [], 2)).toMatchObject({ verdict: 'unknown', best: null });
  });
});

describe('reviewGame et reviewSummary', () => {
  const costly = reviewChoice(3, [card(1, 0.56), card(2, 0.52)], 2);
  const best = reviewChoice(1, [card(1, 0.56), card(2, 0.52)], 1);
  const unread = reviewChoice(2, [card(1, 0.56)], null);

  it('compte les choix notés et trie par moment de la partie', () => {
    const r = reviewGame([costly, unread, best]);
    expect(r?.choices.map((c) => c.round)).toEqual([1, 2, 3]);
    expect(r).toMatchObject({ analysed: 2, solid: 1 });
    expect(r?.lost).toBeCloseTo(0.04);
    expect(r?.approx).toBeUndefined();
    expect(reviewGame([best], true)?.approx).toBe(true);
    expect(reviewGame([])).toBeNull();
  });

  it('résume plusieurs parties sans compter celles qui n’ont aucun choix noté', () => {
    const s = reviewSummary([reviewGame([best, costly])!, reviewGame([unread])!, undefined]);
    expect(s).toMatchObject({ games: 1, analysed: 2, solid: 1 });
    expect(s?.lostPerGame).toBeCloseTo(0.04);
    expect(s?.worst?.round).toBe(3);
    expect(reviewSummary([reviewGame([unread])!])).toBeNull();
  });

  it('nomme les moments du choix', () => {
    expect([1, 2, 3, 4].map(roundLabel)).toEqual(['Début', 'Niveau 7', 'Niveau 11', 'Niveau 15']);
    expect(roundLabel(null)).toBe('Choix');
  });
});
