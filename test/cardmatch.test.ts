import { describe, expect, it } from 'vitest';
import { matchCards, similarity, normText, dropCovered, type CardCandidate, type OcrLine } from '../src/core/cardmatch';

const pool: CardCandidate[] = [
  { id: 1, name: 'Infinite Recursion', rarity: 'kGold' },
  { id: 2, name: 'Scopier Weapons', rarity: 'kGold' },
  { id: 3, name: 'Phenomenal Evil', rarity: 'kGold' },
  { id: 4, name: 'Goliath', rarity: 'kGold' },
  { id: 5, name: 'Tank It Or Leave It', rarity: 'kSilver' },
  { id: 6, name: "Witchful Thinking", rarity: 'kGold' },
];

const line = (text: string, x: number, y: number, h = 0.04, w = 0.18): OcrLine => ({ text, conf: 0.9, x, y, w, h });

describe('matchCards', () => {
  it('reconnaît 3 cartes de gauche à droite, avec fautes de lecture et descriptions', () => {
    const r = matchCards(
      [
        line('Phenomenal Evi1', 0.62, 0.3),
        line('Gain stacks of AP when you hit', 0.6, 0.5, 0.025, 0.25),
        line('lnfinite Recursion', 0.08, 0.3),
        line('Witchful Thinking', 0.35, 0.3),
        line('Goliath', 0.35, 0.55, 0.025, 0.1), // mentionné dans une description : même colonne, plus petit
      ],
      pool,
    );
    expect(r?.ids).toEqual([1, 6, 3]);
    expect(r?.unsure).toBeNull();
    expect(r?.rarity).toBe('kGold');
  });

  it('recolle un nom coupé sur deux lignes', () => {
    const r = matchCards([line('Tank It Or', 0.1, 0.3), line('Leave It', 0.1, 0.345), line('Goliath', 0.4, 0.3), line('Scopier Weapons', 0.7, 0.3)], pool);
    expect(r?.ids).toEqual([5, 4, 2]);
  });

  it('dit son doute quand une carte manque, et note le texte presque reconnu', () => {
    const r = matchCards([line('Goliath', 0.1, 0.3), line('Scopier Weapons', 0.4, 0.3), line('Unknown Shiny Thing', 0.7, 0.3)], pool);
    expect(r?.ids).toEqual([4, 2]);
    expect(r?.unsure).toBe('2 cartes sur 3 reconnues');
  });

  it('ne reconnaît rien hors de l’écran d’augments', () => {
    expect(matchCards([line('ENEMY SLAIN', 0.4, 0.2), line('Ranged minion', 0.1, 0.8)], pool)).toBeNull();
  });

  it('refuse les ressemblances faibles', () => {
    expect(similarity(normText('Goliath'), normText('Gold rush'))).toBeLessThan(0.84);
    expect(matchCards([line('Goliaths Den Big', 0.4, 0.3)], pool)).toBeNull();
  });
});

describe('dropCovered', () => {
  it('ignore le texte lu sur le panneau de l’app, garde les cartes', () => {
    const area = { x: 150, y: 100, width: 1200, height: 600 };
    const panel = { x: 1186, y: 80, width: 310, height: 600 };
    const kept = dropCovered([line('Goliath', 0.05, 0.3), line('Goliath', 0.92, 0.3, 0.03, 0.06)], area, [panel]);
    expect(kept).toHaveLength(1);
    expect(kept[0].x).toBe(0.05);
  });
});
