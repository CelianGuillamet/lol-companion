import { describe, expect, it } from 'vitest';
import { laneCs, MIN_SEC } from '../src/core/lanecs';
import { isLeagueClassic, modeOf } from '../src/core/modes';

const lux = { id: 99, name: 'Lux' };
const base = { lane: 'mid' as const, mine: 90, theirs: 110, opponent: lux, guessed: false, gameTime: 840 };

describe('CS de lane', () => {
  it('compare au vis-à-vis et donne le rythme', () => {
    expect(laneCs(base)).toEqual({ mine: 90, theirs: 110, gap: -20, perMin: 6.4, opponent: lux, guessed: false });
  });

  it('se tait : soutien, rôle inconnu, début de partie, temps ou CS absents', () => {
    expect(laneCs({ ...base, lane: 'support' })).toBeNull();
    expect(laneCs({ ...base, lane: null })).toBeNull();
    expect(laneCs({ ...base, gameTime: MIN_SEC - 1 })).toBeNull();
    expect(laneCs({ ...base, gameTime: null })).toBeNull();
    expect(laneCs({ ...base, mine: undefined })).toBeNull();
  });

  it('sans adversaire connu : tes CS seuls, jamais d\'écart inventé', () => {
    expect(laneCs({ ...base, opponent: null, theirs: undefined })).toEqual({ mine: 90, theirs: null, gap: null, perMin: 6.4, opponent: null, guessed: false });
    // adversaire connu mais `creepScore` absent : pas de 0 fantôme
    expect(laneCs({ ...base, theirs: undefined })).toMatchObject({ gap: null, opponent: null });
  });

  it('garde la marque « deviné », et compte aussi pour le jungler', () => {
    expect(laneCs({ ...base, guessed: true })?.guessed).toBe(true);
    expect(laneCs({ ...base, lane: 'jungle', mine: 120, theirs: 100 })?.gap).toBe(20);
  });
});

describe('League Classic', () => {
  it('reconnue par le nom de la file, quel que soit l\'id', () => {
    expect(isLeagueClassic('League Classic')).toBe(true);
    expect(isLeagueClassic('League of Legends Classic')).toBe(true);
    expect(isLeagueClassic('Summoner\'s Rift')).toBe(false);
    expect(isLeagueClassic(null)).toBe(false);
    expect(modeOf(4100, 'CLASSIC', 'League Classic')).toBeNull();
    expect(modeOf(null, 'CLASSIC', 'League Classic')).toBeNull();
  });

  it('une file CLASSIC inconnue n\'est plus prise pour la Faille', () => {
    expect(modeOf(4100, 'CLASSIC')).toBeNull();
  });

  it('les vraies files de la Faille restent, personnalisées et contre l\'IA comprises', () => {
    expect(modeOf(420, 'CLASSIC', '5v5 Ranked Solo')).toBe('sr');
    expect(modeOf(480, 'SWIFTPLAY')).toBe('sr');
    expect(modeOf(870, 'CLASSIC')).toBe('sr');
    expect(modeOf(0, 'CLASSIC')).toBe('sr');
    expect(modeOf(null, 'CLASSIC')).toBe('sr');
  });
});
