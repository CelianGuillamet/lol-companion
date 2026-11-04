import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGuide, edgeOf, guideRate, paceOf, readGuide, type GuideData, guideCounters } from '../src/core/laneguide';

const sample = JSON.parse(readFileSync('test/fixtures/opgg/opgg-sample-matchup.json', 'utf8')).result;
const data = (rates: number[], games = 200_000, extra: Partial<GuideData> = {}): GuideData => ({
  championId: null,
  games,
  lengths: [0, 25, 30, 35, 40].map((from, i) => ({ from, rate: rates[i] })),
  counters: [],
  tips: [],
  style: null,
  laneAdvantage: null,
  soloKillAdvantage: null,
  ...extra,
});
const me = { id: 1, names: ['Ahri'] };
const them = { id: 2, names: ['Zed'], name: 'Zed' };

describe('guideCounters', () => {
  const guide = { championId: 103, games: 1000, lengths: [], counters: [{ id: 7, games: 500, myWinRate: 0.45 }], tips: [], style: null, laneAdvantage: null, soloKillAdvantage: null };
  it('rend les matchups au format de l’analyse', () => expect(guideCounters(guide, 103)).toEqual([{ id: 7, name: '', games: 500, myWinRate: 0.45 }]));
  it('rien si la réponse parle d’un autre champion, ou sans réponse', () => {
    expect(guideCounters(guide, 99)).toEqual([]);
    expect(guideCounters(null, 103)).toEqual([]);
  });
  it('champion non précisé par la réponse : accepté, comme guideRate', () => expect(guideCounters({ ...guide, championId: null }, 99)).toHaveLength(1));
});

describe('lecture de la réponse OP.GG', () => {
  it('vraie capture : durées lues, parties du rôle, champs du guide à null sans erreur', () => {
    const g = readGuide(sample, 'mid')!;
    expect(g.championId).toBe(103);
    expect(g.games).toBe(142656);
    expect(g.lengths.map((l) => l.from)).toEqual([0, 25, 30, 35, 40]);
    expect(g.tips).toEqual([]);
    expect(g.style).toBeNull();
  });

  it('vraie capture : 56 matchups, win = le champion demandé (mêmes parties et même winrate que strong_counters)', () => {
    const g = readGuide(sample, 'mid')!;
    expect(g.counters.length).toBe(56);
    const lux = g.counters.find((c) => c.id === 99)!;
    expect(lux.games).toBe(2515);
    expect(lux.myWinRate).toBeCloseTo(1189 / 2515, 5);
  });

  it('réponse vide ou absente : rien', () => {
    expect(readGuide(null, 'mid')).toBeNull();
    expect(readGuide({}, 'mid')).toBeNull();
  });

  it('conseils sous n’importe quelle forme, sans doublon ni balise, 3 au plus', () => {
    const tip = 'Évite ses échanges quand son ombre est prête';
    const texts = ['a <b>retenir</b> en début de lane', tip, tip, { text: 'Achète Zhonya avant sa 6e minute' }, 'https://op.gg/quelque chose', 'court', 'Quatrième conseil bien trop nombreux'];
    const g = readGuide({ data: { opponent_champion_tip: texts, recommended_play_style: { label: 'Joue en poke à distance' } } }, 'mid')!;
    expect(g.tips).toEqual(['a retenir en début de lane', tip, 'Achète Zhonya avant sa 6e minute']);
    expect(g.style).toBe('Joue en poke à distance');
  });
});

describe('avantage de lane', () => {
  it('id, nom ou objet ; sinon rien', () => {
    expect(edgeOf(1, me, them)).toBe('me');
    expect(edgeOf('Zed', me, them)).toBe('them');
    expect(edgeOf({ champion_id: 2 }, me, them)).toBe('them');
    expect(edgeOf({ champion_name: 'ahri' }, me, them)).toBe('me');
    expect(edgeOf('Lux', me, them)).toBeNull();
    expect(edgeOf(true, me, them)).toBeNull();
    expect(edgeOf(null, me, them)).toBeNull();
  });
});

describe('rythme', () => {
  it('devant tôt, dépassé tard', () => {
    const p = paceOf(data([0.53, 0.52, 0.51, 0.49, 0.48]), data([0.48, 0.5, 0.51, 0.53, 0.54]), 'Zed')!;
    expect(p.text).toBe('Rythme général : devant Zed avant 25 min et entre 25 et 35 min, derrière après 35 min. Cherche ton avance tôt.');
    expect(p.detail).toContain('avant 25 min : 53,0 % contre 48,0 %');
  });

  it('derrière tôt, devant tard', () => {
    const p = paceOf(data([0.47, 0.5, 0.5, 0.52, 0.54]), data([0.52, 0.5, 0.5, 0.49, 0.48]), 'Zed')!;
    expect(p.text).toBe('Rythme général : derrière Zed avant 25 min, devant après 35 min. Tiens jusque-là.');
  });

  it('un seul sens', () => {
    expect(paceOf(data([0.54, 0.54, 0.54, 0.54, 0.54]), data([0.5, 0.5, 0.5, 0.5, 0.5]), 'Zed')!.text).toContain('devant Zed');
    expect(paceOf(data([0.48, 0.5, 0.5, 0.5, 0.5]), data([0.53, 0.5, 0.5, 0.5, 0.5]), 'Zed')!.text).toBe('Rythme général : derrière Zed avant 25 min.');
  });

  it('sous 1 pt, rien', () => {
    expect(paceOf(data([0.505, 0.5, 0.5, 0.5, 0.5], 900_000), data([0.5, 0.5, 0.5, 0.5, 0.5], 900_000), 'Zed')).toBeNull();
  });

  it('peu de parties : même 3 pts d’écart restent du bruit', () => {
    expect(paceOf(data([0.53, 0.5, 0.5, 0.5, 0.5], 1000), data([0.5, 0.5, 0.5, 0.5, 0.5], 1000), 'Zed')).toBeNull();
    expect(paceOf(data([0.53, 0.5, 0.5, 0.5, 0.5], 0), data([0.5, 0.5, 0.5, 0.5, 0.5], 0), 'Zed')).toBeNull();
  });

  it('Swiftplay : la tranche après 35 min ne compte pas', () => {
    const late = data([0.5, 0.5, 0.5, 0.56, 0.56]);
    const flat = data([0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(paceOf(late, flat, 'Zed', true)).toBeNull();
    expect(paceOf(late, flat, 'Zed', false)).not.toBeNull();
  });

  it('sans la courbe adverse ou avec une tranche manquante', () => {
    expect(paceOf(data([0.53, 0.5, 0.5, 0.5, 0.5]), null, 'Zed')).toBeNull();
    const holed = { ...data([0.53, 0.5, 0.5, 0.5, 0.5]), lengths: [{ from: 0, rate: 0.53 }] };
    expect(paceOf(holed, data([0.5, 0.5, 0.5, 0.5, 0.5]), 'Zed')!.phases).toHaveLength(1);
  });
});

describe('guide complet', () => {
  it('rien de lisible : pas de guide', () => {
    expect(buildGuide(data([0.5, 0.5, 0.5, 0.5, 0.5]), data([0.5, 0.5, 0.5, 0.5, 0.5]), me, them)).toBeNull();
    expect(buildGuide(null, null, me, them)).toBeNull();
  });

  it('conseils sans rythme : gardés', () => {
    const g = buildGuide(data([0.5, 0.5, 0.5, 0.5, 0.5], 1, { tips: ['Un vrai conseil de lane'], laneAdvantage: 2, soloKillAdvantage: 'Ahri' }), null, me, them)!;
    expect(g).toMatchObject({ pace: null, tips: ['Un vrai conseil de lane'], laneEdge: 'them', killEdge: 'me' });
  });

  it('une réponse sur un autre champion ne donne pas de rythme', () => {
    const early = data([0.54, 0.5, 0.5, 0.5, 0.5]);
    const flat = data([0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(buildGuide({ ...early, championId: 99 }, flat, me, them)).toBeNull();
    expect(buildGuide(early, { ...flat, championId: 99 }, me, them)).toBeNull();
    expect(buildGuide({ ...early, championId: 1 }, { ...flat, championId: 2 }, me, them)!.pace).not.toBeNull();
  });
});

describe('winrate du matchup dans le guide', () => {
  const mine = data([0.5, 0.5, 0.5, 0.5, 0.5], 1000, { championId: 1, counters: [{ id: 2, games: 900, myWinRate: 0.53 }] });
  const theirs = data([0.5, 0.5, 0.5, 0.5, 0.5], 1000, { championId: 2, counters: [{ id: 1, games: 800, myWinRate: 0.46 }] });

  it('dans ta réponse, sinon déduit de la sienne', () => {
    expect(guideRate(mine, theirs, 1, 2)).toEqual({ myWinRate: 0.53, games: 900 });
    const r = guideRate({ ...mine, counters: [] }, theirs, 1, 2)!;
    expect(r.games).toBe(800);
    expect(r.myWinRate).toBeCloseTo(0.54);
  });

  it('une réponse sur un autre champion ou sans ce matchup ne dit rien', () => {
    expect(guideRate({ ...mine, championId: 7 }, null, 1, 2)).toBeNull();
    expect(guideRate(mine, null, 1, 3)).toBeNull();
    expect(guideRate(null, null, 1, 2)).toBeNull();
  });
});
