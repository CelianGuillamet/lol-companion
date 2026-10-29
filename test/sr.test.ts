import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { counterPicksFrom, laneOf, matchupFrom, readAnalysis, type OpggAnalysis } from '../src/core/opgg';
import { verdictOf, wilson } from '../src/core/stats';
import { modeOf, opggModeOf } from '../src/core/modes';

const sample = JSON.parse(readFileSync(new URL('./fixtures/opgg/opgg-sample-analysis.json', import.meta.url), 'utf8'));
const ahri = readAnalysis(sample.result, 'mid')!;

describe('Wilson et verdicts', () => {
  it('intervalle connu (50 % sur 100 parties ≈ 40,4–59,6 %)', () => {
    const w = wilson(0.5, 100);
    expect(w.lo).toBeCloseTo(0.404, 2);
    expect(w.hi).toBeCloseTo(0.596, 2);
  });
  it('0 partie : on ne sait rien', () => expect(wilson(0.7, 0)).toEqual({ lo: 0, hi: 1 }));
  it('un écart sur un petit échantillon ne tranche pas', () => {
    expect(verdictOf(0.6, 50)).toBe('incertain');
    expect(verdictOf(0.53, 300)).toBe('serré');
    expect(verdictOf(0.53, 20000)).toBe('favorable');
    expect(verdictOf(0.46, 5000)).toBe('défavorable');
  });
});

describe('Matchups Faille (vraie analyse Ahri)', () => {
  const lux = ahri.losesTo[0];
  it('lit le matchup dans ta propre analyse', () => {
    const m = matchupFrom(ahri, null, 103, lux.id)!;
    expect(m.myWinRate).toBeCloseTo(0.47, 2);
    expect(m.games).toBe(lux.games);
  });
  it('sinon le déduit de l’analyse de l’adversaire', () => {
    const fake: OpggAnalysis = { ...ahri, championId: 999, beats: [{ id: 7, name: 'X', games: 1000, myWinRate: 0.55 }], losesTo: [] };
    const m = matchupFrom(null, fake, 7, 999)!;
    expect(m.myWinRate).toBeCloseTo(0.45, 5);
  });
  it('inconnu → null (pas de chiffre inventé)', () => expect(matchupFrom(ahri, null, 103, 424242)).toBeNull());
  it('counter-picks : uniquement si la borne basse dépasse 50 %', () => {
    const cps = counterPicksFrom(ahri, (wr, n) => wilson(wr, n).lo);
    for (const c of cps) expect(wilson(c.winRate, c.games).lo).toBeGreaterThan(0.5);
    const weak: OpggAnalysis = { ...ahri, losesTo: [{ id: 1, name: 'A', games: 60, myWinRate: 0.4 }, { id: 2, name: 'B', games: 30000, myWinRate: 0.46 }] };
    expect(counterPicksFrom(weak, (wr, n) => wilson(wr, n).lo).map((c) => c.id)).toEqual([2]);
  });
});

describe('Files 5v5', () => {
  it('classe les files Faille', () => {
    for (const q of [400, 420, 430, 440, 480, 490, 700]) expect(modeOf(q)).toBe('sr');
    expect(modeOf(450)).toBe('aram');
    expect(modeOf(2400)).toBe('mayhem');
    expect(modeOf(1700)).toBeNull(); // Arena : pas du 5v5
  });
  it('stats OP.GG par file', () => {
    expect(opggModeOf(420)).toBe('ranked');
    expect(opggModeOf(440)).toBe('flex');
    expect(opggModeOf(1900)).toBe('urf');
  });
  it('rôles client → OP.GG', () => {
    expect(laneOf('MIDDLE')).toBe('mid');
    expect(laneOf('BOTTOM')).toBe('adc');
    expect(laneOf('UTILITY')).toBe('support');
    expect(laneOf('')).toBeNull();
  });
});
