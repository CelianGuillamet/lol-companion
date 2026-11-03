import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { banOptions } from '../src/core/bans';
import { readAnalysis, type Lane, type LaneMetaRow, type OpggAnalysis } from '../src/core/opgg';

const sample = JSON.parse(readFileSync(new URL('./fixtures/opgg/opgg-sample-analysis.json', import.meta.url), 'utf8'));
const ahri = readAnalysis(sample.result, 'mid')!;

const row = (champion: string, lane: Lane, games: number, winRate: number): LaneMetaRow => ({ champion, lane, games, winRate, roleRate: 0.9, tier: 1 });
const IDS: Record<string, number> = { Lux: 99, Tristana: 18, Syndra: 134, Yasuo: 157, Darius: 122, Filler: 1, Zed: 238 };
const metaOf = (rows: LaneMetaRow[]) => {
  const m = new Map<string, LaneMetaRow[]>();
  for (const r of rows) m.set(r.champion, [...(m.get(r.champion) ?? []), r]);
  return m;
};
const base = { myLane: 'mid' as Lane, lanes: ['mid'] as Lane[], mine: null as OpggAnalysis | null, excluded: new Set<number>(), idOf: (n: string) => IDS[n] };

describe('bans conseillés', () => {
  const meta = metaOf([row('Syndra', 'mid', 200_000, 0.53), row('Zed', 'mid', 100_000, 0.48), row('Filler', 'mid', 700_000, 0.5), row('Darius', 'top', 300_000, 0.54), row('Filler', 'top', 700_000, 0.5)]);

  it('gain = part du rôle × avantage, borne basse comprise', () => {
    const [s] = banOptions({ ...base, meta });
    expect(s.name).toBe('Syndra');
    expect(s.share).toBeCloseTo(0.2, 5);
    expect(s.gain).toBeGreaterThan(0.2 * 0.02);
    expect(s.gain).toBeLessThan(0.2 * 0.03);
  });

  it('champion perdant : jamais conseillé', () => {
    expect(banOptions({ ...base, meta }).map((o) => o.name)).not.toContain('Zed');
  });

  it('rôle dont l’allié n’a rien montré : pas compté, il pourrait le prendre', () => {
    expect(banOptions({ ...base, meta }).map((o) => o.name)).not.toContain('Darius');
    expect(banOptions({ ...base, meta, lanes: ['mid', 'top'] }).map((o) => o.name)).toContain('Darius');
  });

  it('exclus : bannis, pris ou survolés', () => {
    expect(banOptions({ ...base, meta, excluded: new Set([134]) })).toEqual([]);
  });

  it('counter de ton champion : le matchup remplace le winrate global', () => {
    const m = metaOf([row('Lux', 'mid', 150_000, 0.49), row('Filler', 'mid', 850_000, 0.5)]);
    const [o] = banOptions({ ...base, meta: m, mine: { ...ahri, winRate: 0.53, losesTo: [{ id: 99, name: 'Lux', games: 20_000, myWinRate: 0.46 }] } });
    expect(o.id).toBe(99);
    expect(o.myWinRate).toBe(0.46);
    expect(o.gain).toBeGreaterThan(0.15 * 0.05);
  });

  it('champion que tu bats : pas de ban, même fort', () => {
    const m = metaOf([row('Tristana', 'mid', 150_000, 0.54), row('Filler', 'mid', 850_000, 0.5)]);
    expect(banOptions({ ...base, meta: m, mine: { ...ahri, winRate: 0.5, beats: [{ id: 18, name: 'Tristana', games: 20_000, myWinRate: 0.56 }] } })).toEqual([]);
  });

  it('matchup trop court : retour au winrate du rôle', () => {
    const m = metaOf([row('Lux', 'mid', 150_000, 0.53), row('Filler', 'mid', 850_000, 0.5)]);
    const [o] = banOptions({ ...base, meta: m, mine: { ...ahri, winRate: 0.53, losesTo: [{ id: 99, name: 'Lux', games: 40, myWinRate: 0.4 }] } });
    expect(o.myWinRate).toBeNull();
  });

  it('gains sous le seuil ou petits échantillons : rien plutôt qu’un ban au hasard', () => {
    const m = metaOf([row('Syndra', 'mid', 400, 0.7), row('Lux', 'mid', 2000, 0.51), row('Filler', 'mid', 997_600, 0.5)]);
    expect(banOptions({ ...base, meta: m })).toEqual([]);
  });

  it('champion inconnu du client ignoré, 3 options maximum triées', () => {
    const m = metaOf([row('Inconnu', 'mid', 300_000, 0.6), row('Syndra', 'mid', 200_000, 0.52), row('Lux', 'mid', 200_000, 0.54), row('Yasuo', 'mid', 100_000, 0.53), row('Zed', 'mid', 100_000, 0.52), row('Filler', 'mid', 100_000, 0.5)]);
    const o = banOptions({ ...base, meta: m });
    expect(o.map((x) => x.name)).toEqual(['Lux', 'Syndra', 'Yasuo']);
  });
});
