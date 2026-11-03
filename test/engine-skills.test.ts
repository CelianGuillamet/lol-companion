// En partie : le prochain sort à monter, en Mayhem (ordre ARAM d'OP.GG) comme en Faille, et l'ordre réel gardé dans usage.json.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { readAnalysis } from '../src/core/opgg';
import { game, startMockLcu } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
const aram = readAnalysis(JSON.parse(readFileSync(join(fixtures, 'opgg', 'opgg-sample-aram.json'), 'utf8')).result, 'top')!;

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
let probeDir: string;
const calls: { lane: string; mode: string }[] = [];

const abilities = (Q: number, W: number, E: number, R: number) => ({
  Passive: { displayName: 'Passif' },
  Q: { abilityLevel: Q, displayName: 'Steel Tempest' },
  W: { abilityLevel: W, displayName: 'Wind Wall' },
  E: { abilityLevel: E, displayName: 'Sweeping Blade' },
  R: { abilityLevel: R, displayName: 'Last Breath' },
});
const setLive = (level: number, ab: ReturnType<typeof abilities>) => {
  (mock.state as unknown as { live: object }).live = {
    me: { currentGold: 500, level, riotId: 'Celian#EUW', abilities: ab },
    players: [{ riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Yasuo', items: [] }],
  };
};

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-skills-'));
  probeDir = mkdtempSync(join(tmpdir(), 'aram-skills-probe-'));
  engine = new Engine({
    dataDir,
    probeDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
  });
  (engine as unknown as { opggData: object }).opggData = {
    analysis: async (_n: string, _a: string, lane: string, mode: string) => {
      calls.push({ lane, mode });
      return aram;
    },
    mainLane: async () => 'mid',
    guessLanes: async () => new Map(),
    laneMeta: async () => new Map(),
  };
  await engine.refreshData(false);
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

describe('prochain sort', () => {
  it('l’analyse ARAM réelle donne un ordre et une priorité', () => {
    expect(aram.skillOrder).toHaveLength(15);
    expect(aram.skillMax).toEqual(['Q', 'W', 'E']);
  });

  it('Mayhem : suit le niveau, nomme le sort, cite la source', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.selections = [{ puuid: 'puuid-celian', championId: 157 }];
    setLive(1, abilities(0, 0, 0, 0));
    await engine.tick();
    await engine.tick(); // l'ordre arrive sans bloquer le build
    expect(calls).toContainEqual({ lane: 'top', mode: 'aram' });
    expect(engine.state.build?.skills?.source).toBe('OP.GG, ARAM');
    expect(engine.state.skillNext).toMatchObject({ key: 'Q', name: 'Steel Tempest', rank: 1, pending: true, source: 'OP.GG, ARAM' });

    setLive(1, abilities(1, 0, 0, 0));
    await engine.tick();
    expect(engine.state.skillNext).toMatchObject({ key: 'W', pending: false });

    setLive(2, abilities(1, 1, 0, 0));
    await engine.tick();
    setLive(3, abilities(1, 1, 0, 0));
    await engine.tick();
    expect(engine.state.skillNext).toMatchObject({ key: 'E', pending: true });
    setLive(3, abilities(2, 1, 0, 0)); // Q au lieu de E
    await engine.tick();
    expect(engine.state.skillNext?.key).toBe('E');
  });

  it('garde les points réellement pris à la fin de la partie', async () => {
    mock.state.games[88] = game(88, 2400, 157, true, []);
    mock.state.phase = 'EndOfGame';
    mock.state.eogGameId = 88;
    await engine.tick();
    await new Promise((r) => setTimeout(r, 50));
    const ev = (engine as unknown as { usage: { events: { type: string }[] } }).usage.events.find((e) => e.type === 'skills_taken');
    expect(ev).toMatchObject({ taken: 'QWQ', partial: false, off: 1, gameId: 88, championId: 157 });
  });

  it('sans capacités dans l’API, rien ne casse', async () => {
    mock.state.phase = 'InProgress';
    (engine as unknown as { state: { skillNext: null } }).state.skillNext = null;
    (mock.state as unknown as { live: object }).live = { me: { currentGold: 500, level: 3, riotId: 'Celian#EUW' }, players: [] };
    await engine.tick();
    expect(engine.state.skillNext).toBeNull();
    (mock.state as unknown as { live?: object }).live = undefined;
  });
});
