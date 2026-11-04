import { describe, expect, it } from 'vitest';
import { hasSmite, laneMapPanel, pairLanes, type LanePair, type LanePlayer } from '../src/core/lanemap';
import { OpggData } from '../src/core/opgg';

const p = (id: number, name: string, lane: LanePlayer['lane'], sure = true): LanePlayer => ({ id, name, lane, sure });
const allies = [p(1, 'Lillia', 'jungle'), p(2, 'Garen', 'top'), p(3, 'Ahri', 'mid'), p(4, 'Jinx', 'adc'), p(5, 'Nami', 'support')];
const enemies = [p(6, 'Darius', 'top', false), p(7, 'Vi', 'jungle'), p(8, 'Zed', 'mid', false), p(9, 'Ezreal', 'adc', false), p(10, 'Lulu', 'support', false)];
const rates: Record<string, { myWinRate: number; games: number } | null> = {
  top: { myWinRate: 0.46, games: 5000 },
  jungle: { myWinRate: 0.56, games: 5000 },
  mid: { myWinRate: 0.53, games: 5000 },
  adc: { myWinRate: 0.502, games: 5000 },
  support: { myWinRate: 0.6, games: 40 },
};
const rate = (x: LanePair) => rates[x.lane];

describe('Châtiment', () => {
  it('nom interne ou nom affiché, français compris', () => {
    expect(hasSmite({ summonerSpellOne: { rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerSmite_DisplayName' } })).toBe(true);
    expect(hasSmite({ summonerSpellTwo: { displayName: 'Châtiment' } })).toBe(true);
    expect(hasSmite({ summonerSpellOne: { displayName: 'Flash' }, summonerSpellTwo: { displayName: 'Ghost' } })).toBe(false);
    expect(hasSmite(undefined)).toBe(false);
  });
});

describe('duels par rôle', () => {
  it('dans l’ordre de la carte, deviné si un des deux rôles l’est, ta ligne marquée', () => {
    const pairs = pairLanes(allies, enemies, 1);
    expect(pairs.map((x) => x.lane)).toEqual(['top', 'jungle', 'mid', 'adc', 'support']);
    expect(pairs[1]).toMatchObject({ mine: true, guessed: false, enemy: { name: 'Vi' } });
    expect(pairs[0]).toMatchObject({ mine: false, guessed: true });
  });

  it('un rôle sans ennemi placé ne donne pas de duel', () => {
    expect(pairLanes(allies, enemies.slice(0, 2).concat(p(8, 'Zed', null, false)), 1).map((x) => x.lane)).toEqual(['top', 'jungle']);
  });
});

describe('fiche des duels', () => {
  const pairs = pairLanes(allies, enemies, 1);

  it('couleur seulement si l’écart sort du bruit, jamais sur 40 parties', () => {
    const m = laneMapPanel(pairs, rate)!;
    expect(m.rows.map((r) => r.edge)).toEqual(['enemy', 'ally', 'ally', 'even', null]);
  });

  it('point fort et point faible hors de ta ligne', () => {
    const m = laneMapPanel(pairs, rate)!;
    expect(m.strong).toBe('milieu, Ahri contre Zed (53 %)');
    expect(m.weak).toBe('haut, Garen contre Darius (46 %)');
    expect(m.guessed).toBe(true);
  });

  it('rien de net : ni point fort ni point faible', () => {
    const m = laneMapPanel(pairs, () => ({ myWinRate: 0.5, games: 5000 }))!;
    expect(m.strong).toBeNull();
    expect(m.weak).toBeNull();
  });

  it('moins de 2 duels chiffrés : rien à l’écran', () => {
    expect(laneMapPanel(pairs, (x) => (x.lane === 'top' ? rates.top : null))).toBeNull();
    expect(laneMapPanel([], rate)).toBeNull();
  });

  it('duel sans chiffre : gardé, sans couleur', () => {
    const m = laneMapPanel(pairs, (x) => (x.lane === 'adc' ? null : rate(x)))!;
    expect(m.rows[3]).toMatchObject({ rate: null, edge: null, games: 0 });
  });
});

describe('rôles devinés autour des rôles lus', () => {
  it('le Châtiment garde sa place, le reste se répartit autour', async () => {
    const data = new OpggData({ call: async () => null } as never);
    const row = (lane: string, roleRate: number) => ({ champion: 'x', lane, games: 1000, winRate: 0.5, roleRate, tier: 1 });
    (data as unknown as { laneMeta: () => Promise<unknown> }).laneMeta = async () => new Map([
      ['graves', [row('jungle', 0.99), row('top', 0.01)]],
      ['nidalee', [row('jungle', 0.9), row('mid', 0.05)]],
    ]);
    const out = await data.guessLanes([{ id: 1, name: 'Graves' }, { id: 2, name: 'Nidalee' }], new Map([[2, 'jungle']]));
    expect(out.get(2)).toBe('jungle');
    expect(out.get(1)).toBe('top');
  });
});
