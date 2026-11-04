// Champ select Faille : counter-picks, dangers et bans lisent tous les matchups du guide, pas les 6 de l'analyse.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
const LUX = ahri.losesTo[0].id;
const AHRI = 103;
const [DARIUS, SYNDRA, YASUO, XERATH, ZED, TALON] = [122, 134, 157, 101, 238, 91];

const row = (champion_id: number, play: number, rate: number) => ({ champion_id, play, win: Math.round(play * rate) });
// Du point de vue du champion demandé : Lux perd contre Xerath, Yasuo (allié) et Zed (pas à toi)
const lists: Record<number, object[]> = {
  [LUX]: [row(XERATH, 8000, 0.44), row(YASUO, 8000, 0.42), row(ZED, 8000, 0.4), row(TALON, 8000, 0.495)],
  [AHRI]: [row(SYNDRA, 8000, 0.43), row(TALON, 8000, 0.5), row(DARIUS, 8000, 0.42)],
};
const meta = new Map([['darius', [{ champion: 'Darius', lane: 'mid', games: 300_000, winRate: 0.5, roleRate: 0.9, tier: 1 }]]]);

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
const calls: string[] = [];
let down = false;
let open: () => void = () => undefined;
let gate: Promise<void> | null = new Promise((r) => { open = r; });

const events = (type: string) => (engine as unknown as { usage: { events: ({ type: string } & Record<string, unknown>)[] } }).usage.events.filter((e) => e.type === type);

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-srm-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(mkdtempSync(join(tmpdir(), 'bal-')), async () => { throw new Error('hors ligne'); }),
    augInfoFetcher: async () => { throw new Error('hors ligne'); },
    live: { port: 1 },
  });
  (engine as unknown as { opggData: object }).opggData = {
    analysis: async () => ahri,
    mainLane: async () => 'mid',
    guessLanes: async (enemies: { id: number }[]) => new Map(enemies.map((e) => [e.id, e.id === LUX ? 'mid' : 'top'])),
    laneMeta: async () => meta,
    matchupGuide: async (my: { id: number }) => {
      calls.push(String(my.id));
      await gate;
      if (down) return null;
      return { data: { summary: { id: my.id, positions: [] }, counters: lists[my.id] ?? [] } };
    },
  };
  await engine.refreshData(false);
  // Toute une collection, sauf Zed
  const ids = [...Array(40).keys()].map((i) => i + 300).concat(XERATH, YASUO, TALON, DARIUS, SYNDRA, LUX, AHRI);
  (mock.state as unknown as { collection: object[] }).collection = ids.map((id) => ({ id, freeToPlay: false, ownership: { owned: true } }));
  mock.state.phase = 'ChampSelect';
  mock.state.queue = { id: 420, gameMode: 'CLASSIC' };
  mock.state.subset = [];
  mock.state.session = {
    localPlayerCellId: 0,
    myTeam: [{ cellId: 0, championId: 0, championPickIntent: AHRI, assignedPosition: 'MIDDLE' }, { cellId: 1, championId: YASUO, assignedPosition: 'TOP' }],
    theirTeam: [{ cellId: 5, championId: LUX }, { cellId: 6, championId: SYNDRA }, { cellId: 7, championId: TALON }],
    actions: [[{ id: 9, actorCellId: 0, championId: AHRI, completed: false, isInProgress: true, type: 'pick' }]],
  };
});

afterAll(async () => {
  engine.stop();
  await mock.close();
});

describe('Matchups complets au champ select', () => {
  it('sans réponse d’OP.GG : la liste de l’analyse sert, rien ne bloque', async () => {
    await engine.tick();
    const sr = engine.state.champSelect!.sr!;
    expect(sr.me?.id).toBe(AHRI);
    expect(sr.counterPicks.map((c) => c.id)).not.toContain(XERATH);
    gate = null;
    open();
  });

  it('counter-picks : tout le rôle, sans ton équipe ni les champions que tu n’as pas', async () => {
    await vi.waitFor(async () => {
      await engine.tick();
      expect(engine.state.champSelect!.sr!.counterPicks.map((c) => c.id)).toEqual([XERATH]);
    });
    const sr = engine.state.champSelect!.sr!;
    expect(sr.counterPicks[0].winRate).toBeCloseTo(0.56, 2);
  });

  it('dangers : ennemis lus dans ta liste complète, pas ton adversaire, pas un matchup neutre', () => {
    expect(engine.state.champSelect!.sr!.dangers.map((d) => d.id)).toEqual([SYNDRA]);
  });

  it('pas d’appel en double, mesure notée une fois', async () => {
    const n = calls.length;
    expect(n).toBe(2); // toi contre lui, lui contre toi : ces 2 réponses suffisent
    await engine.tick();
    await engine.tick();
    expect(calls.length).toBe(n);
    expect(events('counter_picks')).toHaveLength(1);
    expect(events('counter_picks')[0]).toMatchObject({ opponentId: LUX, known: 4 });
    expect((events('counter_picks')[0].picks as { id: number }[]).map((p) => p.id)).toEqual([XERATH]);
  });

  it('bans : ton matchup vient de la liste complète, au tour de ban sans ennemi visible', async () => {
    const session = mock.state.session as { actions: object[][]; theirTeam: object[] };
    session.theirTeam = [];
    session.actions = [[{ id: 20, actorCellId: 0, championId: 0, completed: false, isInProgress: true, type: 'ban' }], [{ id: 9, actorCellId: 0, championId: AHRI, completed: false, isInProgress: false, type: 'pick' }]];
    await engine.tick();
    const darius = engine.state.champSelect!.sr!.bans!.options.find((o) => o.name === 'Darius')!;
    expect(darius.id).toBe(DARIUS);
    expect(darius.myWinRate).toBeCloseTo(0.42, 2); // winrate global de 50 % : sans le guide, aucun gain
    expect(darius.gain).toBeGreaterThan(0.005);
    expect(calls.length).toBe(2);
  });

  it('nouvelle partie : relu, et une panne d’OP.GG laisse la liste de l’analyse', async () => {
    down = true;
    mock.state.phase = 'None';
    await engine.tick();
    mock.state.phase = 'ChampSelect';
    const session = mock.state.session as { actions: object[][]; theirTeam: object[]; myTeam: { championId: number; championPickIntent?: number }[] };
    session.theirTeam = [{ cellId: 5, championId: LUX }];
    session.actions = [[{ id: 9, actorCellId: 0, championId: AHRI, completed: false, isInProgress: true, type: 'pick' }]];
    await engine.tick();
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(2));
    await engine.tick();
    expect(engine.state.champSelect!.sr!.counterPicks.map((c) => c.id)).not.toContain(XERATH);
  });
});
