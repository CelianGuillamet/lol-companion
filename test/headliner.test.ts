import { describe, expect, it } from 'vitest';
import { headlinerFromCards, headlinerFromText, historyHeadliner, HEADLINERS } from '../src/core/headliner';

describe('headliners Mayhem', () => {
  it('reconnaît le nom du headliner lu à l’écran, strictement', () => {
    expect(headlinerFromText(['Command Line'])?.info.key).toBe('commandline');
    expect(headlinerFromText(['xx', 'K/DA'])?.info.key).toBe('kda');
    expect(headlinerFromText(['HEADLINER: TRUE DAMAGE'])?.info.key).toBe('truedamage');
    expect(headlinerFromText(['Café Cuties'])?.info.name).toBe('Cafe Cuties');
    expect(headlinerFromText(['Tête d’affiche : Pentakill'])?.text).toBe('Tête d’affiche : Pentakill');
    expect(headlinerFromText(['Headliner Bees'])?.info.key).toBe('bees');
    // ni annonces du jeu, ni augments, ni morceaux de phrase
    expect(headlinerFromText(['PENTAKILL!'])).toBeNull();
    expect(headlinerFromText(['BEES!!!'])).toBeNull();
    expect(headlinerFromText(['Bees'])).toBeNull();
    expect(headlinerFromText(['Disco Inferno', 'gain a Snowball.', 'Command Line Interface'])).toBeNull();
  });

  it('déduit Pentakill de ses cartes (3170-3173), pas d’un augment ordinaire', () => {
    expect(headlinerFromCards([3170, 3171, 3172])?.key).toBe('pentakill');
    expect(headlinerFromCards([3170, 3172, 3173])?.key).toBe('pentakill');
    expect(headlinerFromCards([3170, 1060, 3172])).toBeNull();
    expect(headlinerFromCards([3172])).toBeNull();
  });

  it('historique : noté en direct, sinon marqueur, sinon 5 augments depuis le 26.21 = K/DA probable', () => {
    const at = Date.UTC(2026, 9, 25);
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4], headliner: 'commandline' }, null)).toBe('Command Line');
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [3176, 3170, 1, 2, 3, 4] }, 'Pentakill')).toBe('Pentakill');
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4, 5] }, null)).toBe('K/DA (probable)');
    expect(historyHeadliner({ mode: 'mayhem', createdAt: Date.UTC(2026, 8, 28), augments: [1, 2, 3, 4, 5] }, null)).toBeNull();
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4] }, null)).toBeNull();
    expect(historyHeadliner({ mode: 'aram', createdAt: at, augments: [1, 2, 3, 4, 5] }, null)).toBeNull();
  });

  it('chaque headliner a au moins un conseil', () => {
    expect(HEADLINERS).toHaveLength(8);
    for (const h of HEADLINERS) expect(h.tips.length).toBeGreaterThan(0);
  });
});
