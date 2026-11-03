import { describe, expect, it } from 'vitest';
import { adviseReroll, reviewDraw, thin, MIN_POOL, RISKY_MIN, type RerollCard } from '../src/core/reroll';
import type { ReviewCard } from '../src/core/review';
import { rerollLine } from '../src/renderer/offered-cards';

// Pool centré sur 50 % : 0,45 → 0,55
const pool = Array.from({ length: 21 }, (_, i) => 0.45 + i * 0.005);
const card = (id: number, value: number, rolled = false): RerollCard => ({ id, value, rolled });

describe('conseiller de reroll', () => {
  it('relance d’abord ce que tu ne prendrais pas, la moins bonne en tête', () => {
    const a = adviseReroll([card(1, 0.5), card(2, 0.47), card(3, 0.53)], pool, null)!;
    expect(a.kind).toBe('free');
    expect(a.targets).toEqual([2, 1]);
    expect(a.gain).toBeGreaterThan(0.001);
    expect(a.left).toBe(3);
  });

  it('ne relance jamais une carte déjà relancée', () => {
    const a = adviseReroll([card(1, 0.5, true), card(2, 0.47), card(3, 0.53)], pool, null)!;
    expect(a.targets).toEqual([2]);
  });

  it('garde la meilleure carte si la relancer ne vaut pas 1 point', () => {
    const a = adviseReroll([card(1, 0.51, true), card(2, 0.5, true), card(3, 0.53)], pool, null)!;
    expect(a.kind).toBe('keep');
  });

  it('propose de relancer la meilleure carte seulement si le risque paie, avec la carte qui reste', () => {
    const a = adviseReroll([card(1, 0.46, true), card(2, 0.455, true), card(3, 0.4725)], pool, null)!;
    expect(a.kind).toBe('risky');
    expect(a.targets).toEqual([3]);
    expect(a.fallback).toBe(1);
    expect(a.gain).toBeCloseTo(pool.reduce((s, v) => s + Math.max(v, 0.46), 0) / pool.length - 0.4725, 3);
    expect(a.better).toBeCloseTo(16 / 21, 2);
  });

  it('ne dit plus rien de faux quand plus aucune relance ne reste', () => {
    const a = adviseReroll([card(1, 0.46, true), card(2, 0.47, true), card(3, 0.48, true)], pool, null)!;
    expect(a).toMatchObject({ kind: 'keep', left: 0 });
    expect(rerollLine(a, [])).toBeNull();
  });

  it('Command Line : la 1re relance vise le cran du dessus, sur la seule moins bonne carte', () => {
    const up = pool.map((v) => v + 0.03);
    const without = adviseReroll([card(1, 0.5), card(2, 0.48), card(3, 0.53)], pool, null)!;
    const withUp = adviseReroll([card(1, 0.5), card(2, 0.48), card(3, 0.53)], pool, up)!;
    expect(withUp).toMatchObject({ kind: 'free', upgrade: true, targets: [2] });
    expect(withUp.gain).toBeGreaterThan(without.gain);
  });

  it('se tait si la rareté est mal connue', () => {
    const cards = [card(1, 0.5), card(2, 0.47), card(3, 0.53)];
    expect(adviseReroll(cards, pool.slice(0, MIN_POOL - 1), null)).toBeNull();
    expect(adviseReroll(cards, pool, pool.slice(0, MIN_POOL - 1))).toBeNull();
    expect(adviseReroll(cards.slice(0, 2), pool, null)).toBeNull();
  });

  it('résume un grand pool sans déplacer sa moyenne', () => {
    const big = Array.from({ length: 200 }, (_, i) => 0.4 + (i * i) / 400000);
    const t = thin(big);
    expect(t).toHaveLength(24);
    const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
    expect(m(t)).toBeCloseTo(m(big), 3);
    const start = performance.now();
    adviseReroll([card(1, 0.5), card(2, 0.47), card(3, 0.53)], big, big.map((v) => v + 0.01));
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('phrase de relance', () => {
  const cards = [
    { id: 3, name: 'Firebrand', position: 'À droite' },
    { id: 1, name: 'Apex', position: 'À gauche' },
    { id: 2, name: 'Grit', position: 'Au milieu' },
  ];
  const base = { upgrade: false, left: 2, gain: 0.0123 };

  it('dit quelles cartes relancer, par position', () => {
    expect(rerollLine({ ...base, kind: 'free', targets: [2, 1] }, cards)).toEqual({
      text: 'Relance les cartes au milieu et à gauche : tu ne les prendrais pas, ça ne coûte rien (+1,2 pt en moyenne).',
      targets: [2, 1],
    });
    expect(rerollLine({ ...base, kind: 'free', targets: [2] }, cards)?.text).toContain('Relance la carte au milieu : tu ne la prendrais pas');
  });

  it('chiffre le risque et nomme ce qui reste', () => {
    expect(rerollLine({ ...base, kind: 'risky', targets: [3], better: 0.38, fallback: 1 }, cards)?.text).toBe(
      'Tu peux aussi relancer la carte à droite : 38 % de trouver mieux, +1,2 pt en moyenne. Sinon, il te reste Apex.',
    );
  });

  it('annonce la montée de rareté et le cas où relancer n’apporte rien', () => {
    expect(rerollLine({ ...base, kind: 'free', upgrade: true, targets: [1] }, cards)?.text).toContain('Command Line : relance d’abord la carte à gauche');
    expect(rerollLine({ ...base, kind: 'keep', targets: [], gain: 0 }, cards)).toEqual({ text: 'Relancer n’apporterait rien : garde ces cartes.', targets: [] });
  });

  it('se tait sans conseil ou sans position connue', () => {
    expect(rerollLine(null, cards)).toBeNull();
    expect(rerollLine({ ...base, kind: 'free', targets: [9] }, cards)).toBeNull();
  });
});

describe('reviewDraw', () => {
  const card = (id: number, value: number, games = 20_000, estimated = false): ReviewCard => ({ id, name: `C${id}`, value, games, estimated });
  // pool moyen à 50 %, de 44 à 56 %
  const pool = Array.from({ length: 25 }, (_, i) => 0.44 + i * 0.005);

  it('juge le pari, pas la carte reçue : relancer 60 % reste coûteux même si la nouvelle carte est meilleure', () => {
    const steps = [[card(1, 0.6), card(2, 0.5), card(3, 0.49)], [card(4, 0.62), card(2, 0.5), card(3, 0.49)]];
    expect(reviewDraw(steps, pool, null)?.verdict).toBe('costly');
  });

  it('coûteux : relancer une carte bien au-dessus du pool, avec une 2e carte faible', () => {
    const steps = [[card(1, 0.6), card(2, 0.5), card(3, 0.49)], [card(4, 0.56), card(2, 0.5), card(3, 0.49)]];
    const note = reviewDraw(steps, pool, null)!;
    expect(note).toMatchObject({ verdict: 'costly', name: 'C1', value: 0.6 });
    expect(note.delta).toBeGreaterThan(0.03);
  });

  it('ne dit rien quand les relances sont sur les cartes qu’on ne prendrait pas', () => {
    const steps = [[card(1, 0.6), card(2, 0.46), card(3, 0.45)], [card(1, 0.6), card(4, 0.5), card(3, 0.45)], [card(1, 0.6), card(4, 0.5), card(5, 0.47)]];
    expect(reviewDraw(steps, pool, null)).toBeNull();
  });

  it('bon pari : la meilleure carte est faible et les autres relances sont faites', () => {
    const steps = [[card(1, 0.45), card(2, 0.44), card(3, 0.44)], [card(1, 0.45), card(4, 0.44), card(5, 0.44)], [card(6, 0.47), card(4, 0.44), card(5, 0.44)]];
    expect(reviewDraw(steps, pool, null)).toMatchObject({ verdict: 'good', name: 'C1' });
  });

  it('signale une relance gratuite laissée, sur la carte la moins bonne', () => {
    const note = reviewDraw([[card(1, 0.47), card(2, 0.45), card(3, 0.44)]], pool, null)!;
    expect(note).toMatchObject({ verdict: 'unused', name: 'C3' });
    expect(note.delta).toBeGreaterThanOrEqual(RISKY_MIN);
  });

  it('une carte relancée n’est plus une relance laissée', () => {
    const steps = [[card(1, 0.56), card(2, 0.45), card(3, 0.44)], [card(1, 0.56), card(4, 0.46), card(5, 0.45)]];
    expect(reviewDraw(steps, pool, null)).toBeNull();
  });

  it('deux cartes changées d’un coup : ordre le plus favorable, pas d’erreur inventée', () => {
    // la carte faible a pu être relancée d'abord et donner 0,62 : relancer 0,6 ne faisait alors rien perdre
    const steps = [[card(1, 0.6), card(2, 0.5), card(3, 0.5)], [card(4, 0.62), card(5, 0.5), card(3, 0.5)]];
    expect(reviewDraw(steps, pool, null)?.verdict).not.toBe('costly');
  });

  it('ne juge pas une carte estimée, ni un écart sous le bruit, ni un pool trop petit', () => {
    const steps = (a: ReviewCard) => [[a, card(2, 0.5), card(3, 0.49)], [card(4, 0.56), card(2, 0.5), card(3, 0.49)]];
    expect(reviewDraw(steps(card(1, 0.6, 20_000, true)), pool, null)).toBeNull();
    expect(reviewDraw(steps(card(1, 0.6, 30)), pool, null)?.verdict).not.toBe('costly');
    expect(reviewDraw(steps(card(1, 0.6)), pool.slice(0, 5), null)).toBeNull();
  });

  it('Command Line : la 1re relance monte, le gain laissé compte avec la rareté du dessus', () => {
    const hand = [[card(1, 0.5), card(2, 0.49), card(3, 0.48)]];
    const high = pool.map((v) => v + 0.12);
    expect(reviewDraw(hand, pool, high)!.delta).toBeGreaterThan(reviewDraw(hand, pool, null)!.delta + 0.05);
    // déjà relancé une fois : la montée de rareté est passée, on retombe sur le pool normal
    const rolled = [[card(1, 0.5), card(2, 0.49), card(3, 0.48)], [card(1, 0.5), card(2, 0.49), card(4, 0.47)]];
    expect(reviewDraw(rolled, pool, high)!.delta).toBeCloseTo(reviewDraw(rolled, pool, null)!.delta);
  });
});
