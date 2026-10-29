// Faille de l'invocateur (classée solo) contre le faux client, avec OP.GG remplacé par la vraie analyse Ahri
// enregistrée (le conteneur de test n'a pas accès à OP.GG) : rôle, matchup, build, runes et sorts importés.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../src/core/engine';
import { Balance } from '../src/core/balance';
import { Arammeta } from '../src/core/arammeta';
import { readAnalysis } from '../src/core/opgg';
import { startMockLcu } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
const ahri = readAnalysis(JSON.parse(readFileSync(join(fixtures, 'opgg', 'opgg-sample-analysis.json'), 'utf8')).result, 'mid')!;
const lux = ahri.losesTo[0];

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
const asked: string[] = [];

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-sr-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(mkdtempSync(join(tmpdir(), 'bal-')), async () => { throw new Error('hors ligne'); }),
    live: { port: 1 },
  });
  (engine as unknown as { opggData: object }).opggData = {
    analysis: async (name: string, _alias: string, lane: string, mode: string) => {
      asked.push(`${name}|${lane}|${mode}`);
      return ahri;
    },
    mainLane: async () => 'mid',
    guessLanes: async (enemies: { id: number }[]) => new Map(enemies.map((e) => [e.id, e.id === lux.id ? 'mid' : 'top'])),
    laneMeta: async () => new Map(),
  };
  await engine.refreshData(false);
});

afterAll(async () => {
  engine.stop();
  await mock.close();
});

describe('Faille : champ select classée', () => {
  it('rôle, champion survolé, matchup contre le mid adverse', async () => {
    mock.state.phase = 'ChampSelect';
    mock.state.queue = { id: 420, gameMode: 'CLASSIC' };
    mock.state.subset = [];
    mock.state.session = {
      localPlayerCellId: 0,
      myTeam: [{ cellId: 0, championId: 0, championPickIntent: 103, assignedPosition: 'MIDDLE' }, { cellId: 1, championId: 157, assignedPosition: 'TOP' }],
      theirTeam: [{ cellId: 5, championId: lux.id }, { cellId: 6, championId: 22 }],
      actions: [[{ id: 9, actorCellId: 0, championId: 103, completed: false, isInProgress: true, type: 'pick' }]],
    };
    await engine.tick();
    const cs = engine.state.champSelect!;
    expect(engine.state.mode).toBe('sr');
    expect(cs.candidates).toEqual([]); // pas de classement arammeta (ARAM) sur la Faille
    const sr = cs.sr!;
    expect(sr.lane).toBe('mid');
    expect(sr.queueLabel).toBe('Classée solo');
    expect(sr.me?.id).toBe(103);
    expect(sr.me?.locked).toBe(false);
    expect(sr.me!.lo).toBeLessThan(sr.me!.winRate);
    expect(sr.matchup?.opponent.id).toBe(lux.id);
    expect(sr.matchup?.myWinRate).toBeCloseTo(lux.myWinRate, 5);
    expect(sr.matchup?.verdict).toBe(lux.games >= 100 && sr.matchup!.hi < 0.5 ? 'défavorable' : sr.matchup!.verdict);
    for (const c of sr.counterPicks) expect(c.lo).toBeGreaterThan(0.5);
    expect(asked.some((a) => a.endsWith('|mid|ranked'))).toBe(true);
  });

  it('build OP.GG : cœur, options, bottes, compétences', async () => {
    const b = engine.state.build!;
    expect(b.mode).toBe('sr');
    expect(b.source).toBe('OP.GG');
    expect(b.cores[0].core.map((i) => i.id)).toEqual([3118, 4645, 3157]);
    expect(b.cores[0].options.length).toBeGreaterThan(0);
    expect(b.boots.map((x) => x.id)).toEqual([3020]);
    expect(b.skills?.max).toEqual(['Q', 'W', 'E']);
    expect(b.balance).toEqual([]); // pas de modificateurs ARAM sur la Faille
    // Client sans noms (fermé) : noms anglais d'OP.GG plutôt que « #3118 »
    expect(b.cores[0].core.every((i) => !i.name.startsWith('#'))).toBe(true);
    expect(b.runes?.perks.every((p) => !p.name.startsWith('#'))).toBe(true);
  });

  it('importe les runes OP.GG (9 choix) et les sorts', async () => {
    const r = await engine.applyLoadout(true);
    expect(r.message).toContain('runes OP.GG');
    const page = mock.calls.filter((c) => c.path.startsWith('/lol-perks/v1/pages') && (c.method === 'POST' || c.method === 'PUT')).pop();
    expect((page?.body as { selectedPerkIds: number[] }).selectedPerkIds).toEqual(ahri.runes!.perks);
    expect((page?.body as { primaryStyleId: number }).primaryStyleId).toBe(ahri.runes!.primary);
    const sp = mock.calls.filter((c) => c.method === 'PATCH' && c.path === '/lol-champ-select/v1/session/my-selection').pop();
    expect((Object.values(sp?.body as object) as number[]).sort((a, b) => a - b)).toEqual([4, 14]);
  });
});
