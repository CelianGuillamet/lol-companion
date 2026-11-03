// Séquences reprises de vraies parties (usage.json, 28 oct. et 2 nov.).
import { describe, expect, it } from 'vitest';
import { ghostCards, offerChoice, offerKind, settleOffers, type OfferSlot, drawFromSeen, seenBefore } from '../src/core/offers';

const offer = (round: number, ids: number[], choice = 0): OfferSlot => ({ round, ids, choice, kind: 'augment' });

describe('tirages au même palier', () => {
  it('une relance reste le même choix, des cartes toutes nouvelles ouvrent un 2e choix', () => {
    expect(offerChoice([], [3078, 1029, 1013])).toBe(0);
    expect(offerChoice([offer(2, [3078, 1029, 1013])], [3078, 1328, 3049])).toBe(0);
    expect(offerChoice([offer(2, [3078, 1328, 3049])], [2065, 3071, 3088])).toBe(1);
    expect(offerChoice([offer(2, [3078, 1328, 3049]), offer(2, [2065, 3071, 3088], 1)], [2065, 3129, 2116])).toBe(1);
  });

  it('partie à 5 augments : les 2 choix du niveau 7 sont gardés', () => {
    const offers = [offer(2, [3078, 1328, 3049]), offer(2, [2065, 3129, 2116], 1)];
    expect(settleOffers(offers, [2139, 3078, 2065, 1150, 1006]).map((x) => x.picked)).toEqual([3078, 2065]);
  });

  it('trois relances entre deux lectures : le tirage sans carte prise est écarté', () => {
    const offers = [offer(2, [1358, 1326, 1061]), offer(2, [3116, 1133, 1038], 1)];
    expect(settleOffers(offers, [1332, 1038, 1045, 1403]).map((x) => x.picked)).toEqual([1038]);
  });

  it('partie finie avant le choix : un seul tirage reste, sans carte prise', () => {
    const offers = [offer(4, [2096, 1013, 1]), offer(4, [7, 8, 9], 1)];
    expect(settleOffers(offers, [1115, 2018]).map((x) => [x.offer.ids[0], x.picked])).toEqual([[7, null]]);
  });

  it('cartes laissées ouvertes jusqu’au palier suivant : une seule décision', () => {
    const offers = [offer(2, [1, 2, 3]), offer(3, [1, 2, 3]), offer(3, [4, 5, 6], 1)];
    expect(settleOffers(offers, [2, 5]).map((x) => [x.offer.round, x.picked])).toEqual([[2, 2], [3, 5]]);
  });

  it('les cartes headliner forment leur propre type', () => {
    expect(offerKind([3170, 3171, 3172])).toBe('headliner');
    expect(offerKind([3170, 3171, 1058])).toBe('augment');
  });
});

describe('drawFromSeen', () => {
  const read = (at: number, ids: number[], round = 4, championId = 40) => ({ at, championId, round, ids, unsure: false });
  const offer = (ids: number[], round = 4) => ({ championId: 40, round, ids, from: 0, until: 10_000_000 });

  it('remonte un vrai tirage de la partie du 2 nov. (Janna, choix 4)', () => {
    const seen = [read(1000, [1205, 2016, 3025]), read(5000, [1205, 1129, 3025]), read(7000, [1415, 1129, 3025])];
    expect(drawFromSeen(seen, offer([1129, 1415, 3025]))).toEqual([[1205, 2016, 3025], [1205, 1129, 3025], [1415, 1129, 3025]]);
  });

  it('s’arrête au tirage précédent du même palier, aux lectures partielles et aux trous', () => {
    const before = read(1000, [1, 2, 3]);
    expect(drawFromSeen([before, read(2000, [4, 5, 6]), read(3000, [4, 5, 7])], offer([4, 5, 7]))).toEqual([[4, 5, 6], [4, 5, 7]]);
    expect(drawFromSeen([read(0, [4, 5, 6]), read(500_000, [4, 5, 7])], offer([4, 5, 7]))).toEqual([[4, 5, 7]]);
    expect(drawFromSeen([{ ...read(1000, [4, 5, 6]), unsure: true }, read(2000, [4, 5, 7])], offer([4, 5, 7]))).toEqual([[4, 5, 7]]);
  });

  it('une même lecture répétée ne compte qu’une fois, même dans un autre ordre', () => {
    expect(drawFromSeen([read(1000, [1, 2, 3]), read(2000, [3, 2, 1]), read(3000, [1, 2, 4])], offer([1, 2, 4]))).toEqual([[3, 2, 1], [1, 2, 4]]);
  });

  it('ignore l’autre partie, l’autre champion, et rend rien sans les cartes du choix', () => {
    expect(drawFromSeen([read(1000, [1, 2, 3], 4, 99)], offer([1, 2, 3]))).toEqual([]);
    expect(drawFromSeen([read(1000, [1, 2, 3])], { ...offer([1, 2, 3]), from: 2000 })).toEqual([]);
  });
});

describe('seenBefore', () => {
  const read = (at: number, ids: number[], championId = 40) => ({ at, championId, round: 1, ids, unsure: false });
  const game = { championId: 40, from: 1000, until: 9000 };

  it('garde les cartes lues avant le tirage dans cette partie, pas celles du tirage ni des autres parties', () => {
    const seen = [read(500, [90, 91, 92]), read(2000, [1, 2, 3]), read(3000, [1, 2, 4]), read(4000, [5, 6, 7]), read(5000, [5, 6, 8]), read(6000, [10, 11, 12])];
    expect(seenBefore(seen, game, [5, 6, 7])).toEqual([1, 2, 3, 1, 2, 4]);
    expect(seenBefore([read(2000, [1, 2, 3], 99), ...seen], game, [5, 6, 7])).toEqual([1, 2, 3, 1, 2, 4]);
  });

  it('premier tirage ou tirage non retrouvé : rien', () => {
    expect(seenBefore([read(2000, [1, 2, 3])], game, [1, 2, 3])).toEqual([]);
    expect(seenBefore([read(2000, [1, 2, 3])], game, [7, 8, 9])).toEqual([]);
  });
});

describe('carte déjà vue lue dans un tirage', () => {
  // Caitlyn, 3 nov. : Giant Slayer (1195) pris au choix 2, lu pendant les relances du choix 3
  const draw = { round: 3, ids: [1336, 1211, 3088], seen: new Set([1195, 1115, 1103, 1336, 1211, 3088]), before: new Set([1195, 1115]) };

  it('retire un augment d’un choix précédent lu pendant les relances', () => {
    expect(ghostCards([1195, 1211, 3088], draw, 3)).toEqual([0]);
  });

  it('retire aussi la carte à la 1re lecture du choix suivant', () => {
    expect(ghostCards([1195, 7, 8], { ...draw, round: 2 }, 3)).toEqual([0]);
    expect(ghostCards([1336, 7, 8], draw, 4)).toEqual([0]);
  });

  it('garde une relance normale et une carte relancée puis vue dans le même tirage', () => {
    expect(ghostCards([1336, 1211, 9], draw, 3)).toEqual([]);
    expect(ghostCards([1103, 1211, 9], draw, 3)).toEqual([]);
    expect(ghostCards([1, 2, 3], draw, 3)).toEqual([]);
  });

  it('garde les cartes laissées ouvertes jusqu’au palier suivant', () => {
    expect(ghostCards([1336, 1211, 3088], draw, 4)).toEqual([]);
  });

  it('laisse revenir les cartes de headliner Pentakill', () => {
    expect(ghostCards([3170, 3171, 3172], { round: 1, ids: [3170, 3171, 3172], seen: new Set([3170, 3171, 3172]), before: new Set([3170]) }, 4)).toEqual([]);
    expect(ghostCards([3171, 3172, 3173], { round: 1, ids: [1, 2, 3], seen: new Set([3171]), before: new Set() }, 4)).toEqual([]);
  });
});
