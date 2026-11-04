import { describe, expect, it } from 'vitest';
import { bannerOpen, extraDrawAt, isSkinText, headlinerFromCards, headlinerFromText, headlinerNearMisses, cardRarity, historyHeadliner, rarityJump, HEADLINERS } from '../src/core/headliner';

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

  it('tolère une lettre mal lue sur les noms longs, pas sur les courts', () => {
    expect(headlinerFromText(['HEARTSTEE1'])?.info.key).toBe('heartsteel');
    expect(headlinerFromText(['Command Lime'])?.info.key).toBe('commandline');
    expect(headlinerFromText(['Space Gr0ove'])?.info.key).toBe('disco');
    expect(headlinerFromText(['True Darnage'])).toBeNull(); // 2 lettres d'écart
    expect(headlinerFromText(['Disko'])).toBeNull(); // nom court : exact seulement
    expect(headlinerFromText(['KDB'])).toBeNull();
    expect(headlinerFromText(['Pentakil!'])).toBeNull();
  });

  it('« Bees » seul : seulement pendant la bannière, hors écran de cartes', () => {
    expect(headlinerFromText(['Bees'], { bareBees: true })?.info.key).toBe('bees');
    expect(headlinerFromText(['BEES'], { bareBees: true })?.info.key).toBe('bees');
    expect(headlinerFromText(['BEES!!!'], { bareBees: true })).toBeNull();
    expect(headlinerFromText(['Bees'], { bareBees: false })).toBeNull();
  });

  it('garde les textes proches d’un headliner non reconnus, pour régler la lecture', () => {
    expect(headlinerNearMisses(['Heartsteal Rising', 'HARTSTEL', 'Bes', 'gain a Snowball.', 'Headliner Bees', 'Command Line'])).toEqual(['HARTSTEL', 'Bes']);
    expect(headlinerNearMisses(['Headliner: Rockz'])).toEqual(['Headliner: Rockz']);
    expect(headlinerNearMisses(['x'.repeat(40)])).toEqual([]);
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

  it('Command Line : une carte d’un cran au-dessus de 2 autres, et rien d’autre', () => {
    expect(rarityJump(['kGold', 'kGold', 'kPrismatic'])).toBe(2);
    expect(rarityJump(['kSilver', 'kGold', 'kSilver'])).toBe(1);
    // parties réelles : Disco (Or, Or, Argent), tirages purs, carte inconnue, 2 crans
    expect(rarityJump(['kGold', 'kGold', 'kSilver'])).toBeNull();
    expect(rarityJump(['kGold', 'kGold', 'kGold'])).toBeNull();
    expect(rarityJump(['kPrismatic', 'kPrismatic', 'kPrismatic'])).toBeNull();
    expect(rarityJump(['kGold', null, 'kPrismatic'])).toBeNull();
    expect(rarityJump(['kSilver', 'kSilver', 'kPrismatic'])).toBeNull();
    expect(rarityJump(['kSilver', 'kGold', 'kPrismatic'])).toBeNull();
    expect(rarityJump(['kGold', 'kPrismatic'])).toBeNull();
  });

  it('rareté d’une carte : celle de la tier list, sauf si le wiki la contredit, jamais le wiki seul', () => {
    expect(cardRarity('kGold', 'kGold')).toBe('kGold');
    expect(cardRarity('kGold', null)).toBe('kGold');
    expect(cardRarity(undefined, 'kSilver')).toBeNull();
    expect(cardRarity('kSilver', 'kGold')).toBeNull();
    expect(cardRarity(null, undefined)).toBeNull();
  });

  it('historique : 2 tirages à un cran d’écart = Command Line probable, sans passer devant ce qui est noté', () => {
    const at = Date.UTC(2026, 9, 25);
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4] }, null, 2)).toBe('Command Line (probable)');
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4] }, null, 1)).toBeNull();
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4], headliner: 'disco' }, null, 3)).toBe('Disco');
  });

  it('Superfans : lu à l’écran, et deviné après coup à 5 augments au niveau 21', () => {
    expect(headlinerFromText(['Superfans'])?.info.key).toBe('superfans');
    expect(headlinerFromText(['SUPERFANS'])?.info.name).toBe('Superfans');
    expect(headlinerFromText(['Superfams'])?.info.key).toBe('superfans'); // une lettre d'écart
    const at = Date.UTC(2026, 10, 5);
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4, 5], level: 21 }, null)).toBe('Superfans (probable)');
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4, 5], level: 18 }, null)).toBe('K/DA (probable)');
    // Niveau 21 sans 5e augment : déjà vu en oct. (8021825913), ça ne dit rien du headliner
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4], level: 21 }, null)).toBeNull();
    expect(historyHeadliner({ mode: 'mayhem', createdAt: at, augments: [1, 2, 3, 4, 5], level: 21, headliner: 'kda' }, null)).toBe('K/DA');
  });

  it('réveille le lecteur de cartes aux tirages hors paliers', () => {
    expect(extraDrawAt(20, 21)).toBe(true); // bannière ratée : le niveau 21 suffit
    expect(extraDrawAt(20, 21, 'superfans')).toBe(true);
    expect(extraDrawAt(19, 22)).toBe(true);
    expect(extraDrawAt(21, 21)).toBe(false);
    expect(extraDrawAt(null, 21)).toBe(false); // app lancée en cours de partie
    expect(extraDrawAt(20, null)).toBe(false);
    expect(extraDrawAt(17, 18, 'pentakill')).toBe(true);
    expect(extraDrawAt(17, 18, 'kda')).toBe(false);
    expect(extraDrawAt(17, 18)).toBe(false);
    expect(extraDrawAt(18, 19, 'pentakill')).toBe(false);
  });

  it('chaque headliner a au moins un conseil', () => {
    expect(HEADLINERS).toHaveLength(9);
    for (const h of HEADLINERS) expect(h.tips.length).toBeGreaterThan(0);
  });
});

describe('bannerOpen', () => {
  const start = 1_000_000;
  it('garde les vraies bannières du 3 nov. (lues 45 s après le début, avant les cartes)', () => {
    expect(bannerOpen(start + 45_000, start, null)).toBe(true);
    expect(bannerOpen(start + 90_000, start, start + 50_000)).toBe(true);
  });
  it('ferme la bannière avant « Heartsteel » lu 121 s après le début (Rell, 8035073521, cartes à 34 s)', () => {
    expect(bannerOpen(start + 121_000, start, start + 34_000)).toBe(false);
  });
  it('ne ferme pas sur un écran de chargement long : marge après les 1res cartes', () => {
    expect(bannerOpen(start + 95_000, start, null)).toBe(false);
    expect(bannerOpen(start + 115_000, start, start + 100_000)).toBe(true);
    expect(bannerOpen(start + 131_000, start, start + 100_000)).toBe(false);
  });
});

describe('isSkinText', () => {
  it('reconnaît un nom de skin, pas un headliner', () => {
    expect(isSkinText('Space Groove', ['Rell', 'Space Groove Rell'])).toBe(true);
    expect(isSkinText('HEARTSTEEL', ['Heartsteel Sett'])).toBe(true);
    expect(isSkinText('True Damage', ['Mecha Kingdoms Jax', 'Ziggs'])).toBe(false);
    expect(isSkinText('', ['Ziggs'])).toBe(false);
  });
});
