import { describe, it, expect } from 'vitest';
import { aggregate, recap } from '../src/renderer/insights';
import type { HistoryEntry } from '../src/core/types';

let id = 0;
const g = (o: Partial<HistoryEntry>): HistoryEntry => ({
  gameId: ++id, queueId: 2400, mode: 'mayhem', createdAt: id, durationSec: 600, championId: 1, win: true,
  kills: 5, deaths: 5, assists: 10, augments: [], championName: 'X', championWr: null, headliner: null, augmentIcons: [], itemIcons: [],
  damage: 20000, teamKills: 30, ...o,
});

describe('bilan et agrégats perso', () => {
  it('ne signale que les écarts nets par rapport au même champion', () => {
    const ref = [g({}), g({}), g({})];
    const cur = g({ damage: 40000, deaths: 15 }); // les morts ne comptent pas
    const r = recap(cur, [cur, ...ref])!;
    expect(r.base).toBe(3);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ good: true });
    expect(r.lines[0].text).toContain('Dégâts/min');
  });

  it('pas de bilan sans 3 parties de comparaison', () => {
    const cur = g({ championId: 99, mode: 'aram' });
    expect(recap(cur, [cur, g({ mode: 'aram' })])).toBeNull();
  });

  it('agrège les augments avec victoires / défaites', () => {
    const a = { id: 7, name: 'A', icon: null };
    const res = aggregate([g({ augmentIcons: [a] }), g({ augmentIcons: [a], win: false })], (x) => x.augmentIcons);
    expect(res[0]).toMatchObject({ games: 2, wins: 1 });
  });
});
