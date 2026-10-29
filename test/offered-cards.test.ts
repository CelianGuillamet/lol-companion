import { describe, expect, it } from 'vitest';
import type { AugmentRow, OfferedCards } from '../src/core/types';
import { presentOfferedCards } from '../src/renderer/offered-cards';

const rows = new Map<number, AugmentRow>([0.5, 0.6, 0.55].map((winrate, i) => [i + 1, {
  id: i + 1, name: `Carte ${i + 1}`, winrate, games: 1000, lift: 0, icon: null, personal: null,
}]));
const offer = (patch: Partial<OfferedCards> = {}): OfferedCards => ({
  ids: [1, 2, 3], names: ['Gauche', 'Milieu', 'Droite'], rarity: 'kGold', unsure: null, at: 1, ...patch,
});

describe('cartes proposées : décision et position dans le jeu', () => {
  it('classe les cartes complètes sans perdre leur position d’origine', () => {
    const { cards, sure } = presentOfferedCards(offer(), rows, null);
    expect(sure).toBe(true);
    expect(cards.map((c) => [c.id, c.name, c.position])).toEqual([
      [2, 'Milieu', 'Au milieu'], [3, 'Droite', 'À droite'], [1, 'Gauche', 'À gauche'],
    ]);
  });

  it('garde la correction du build et la distingue du winrate', () => {
    const { cards } = presentOfferedCards(offer({ fit: { 1: { delta: 0.2, good: true, why: 'Build' } } }), rows, null);
    expect(cards[0]).toMatchObject({ id: 1, score: 0.7, adjusted: true });
    expect(cards[1].adjusted).toBe(false);
  });

  it('utilise le moment du choix et revient au global si le choix n’a pas de données', () => {
    const atRound = new Map(rows).set(1, { ...rows.get(1)!, rounds: [0.8, null] });
    expect(presentOfferedCards(offer(), atRound, 1).cards[0].id).toBe(1);
    expect(presentOfferedCards(offer(), atRound, 2).cards[0].id).toBe(2);
  });

  it('ne classe pas une lecture partielle et n’invente pas les positions manquantes', () => {
    const { cards, sure } = presentOfferedCards(offer({ ids: [1, 2], names: ['Gauche', 'Droite'], unsure: '2 cartes sur 3 reconnues' }), rows, null);
    expect(sure).toBe(false);
    expect(cards.map((c) => [c.id, c.position])).toEqual([[1, null], [2, null]]);
  });

  it('ne conseille pas quand une carte manque de statistiques, même avec une OCR complète', () => {
    const { sure, cards } = presentOfferedCards(offer(), new Map([...rows].slice(0, 2)), null);
    expect(sure).toBe(false);
    expect(cards[2].score).toBeNull();
  });

  it('refuse les doublons et les lectures incomplètes sans diagnostic', () => {
    expect(presentOfferedCards(offer({ ids: [1, 1, 2] }), rows, null).sure).toBe(false);
    expect(presentOfferedCards(offer({ ids: [1, 2] }), rows, null).sure).toBe(false);
  });

  it('accepte les estimations identifiées comme telles mais pas les valeurs invalides', () => {
    const estimated = new Map(rows).set(2, { ...rows.get(2)!, estimated: true });
    expect(presentOfferedCards(offer(), estimated, null).cards[0].a?.estimated).toBe(true);
    expect(presentOfferedCards(offer(), rows, null).cards[0].a?.estimated).toBeUndefined();
    expect(presentOfferedCards(offer(), new Map(rows).set(1, { ...rows.get(1)!, winrate: NaN }), null).sure).toBe(false);
  });

  it('revient à un état vide après disparition des cartes', () => {
    expect(presentOfferedCards(null, rows, null)).toEqual({ cards: [], sure: false });
  });
});
