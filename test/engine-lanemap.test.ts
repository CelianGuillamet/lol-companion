// Faille en partie : matchup complété par le guide OP.GG, jungler reconnu au Châtiment, fiche des duels.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { readAnalysis } from '../src/core/opgg';
import { PUUID, startMockLcu } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
const ahri = readAnalysis(JSON.parse(readFileSync(join(fixtures, 'opgg', 'opgg-sample-analysis.json'), 'utf8')).result, 'mid')!;
const [AHRI, YASUO, MALPHITE, LEONA] = [103, 157, 54, 89];
// Malphite n'est dans aucun des 6 matchups de l'analyse : seul le guide le connaît
const noCounters = { ...ahri, beats: [], losesTo: [] };

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
const guideCalls: string[] = [];

const smite = { summonerSpellOne: { rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerSmite_DisplayName', displayName: 'Smite' } };
const flash = { summonerSpellOne: { rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerFlash_DisplayName', displayName: 'Flash' } };
const player = (riotId: string, champ: string, team: string, summonerSpells: object) => ({ riotId, rawChampionName: `game_character_displayname_${champ}`, position: '', team, items: [], summonerSpells });

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-lanemap-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
  });
  (engine as unknown as { opggData: object }).opggData = {
    analysis: async () => noCounters,
    mainLane: async () => 'jungle',
    // Sans le Châtiment, Malphite irait en haut et Leona en jungle
    guessLanes: async (foes: { id: number }[], known = new Map()) => {
      const out = new Map(known);
      for (const f of foes) if (!out.has(f.id)) out.set(f.id, f.id === MALPHITE ? 'top' : [...out.values()].includes('jungle') ? 'top' : 'jungle');
      return out;
    },
    laneMeta: async () => new Map(),
    matchupGuide: async (my: { name: string }, opp: { name: string }, lane: string) => {
      guideCalls.push(`${my.name}|${opp.name}|${lane}`);
      const counters = my.name === 'Ahri' ? [{ champion_id: MALPHITE, play: 4000, win: 2200 }] : my.name === 'Yasuo' ? [{ champion_id: LEONA, play: 4000, win: 1760 }] : [];
      return { data: { summary: { positions: [] }, counters } };
    },
  };
  await engine.refreshData(false);
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

describe('Faille : duels de la partie', () => {
  it('Swiftplay jungle : Châtiment adverse, matchup hors des 6 de l’analyse, 2 duels chiffrés', async () => {
    mock.state.phase = 'ChampSelect';
    mock.state.queue = { id: 480, gameMode: 'SWIFTPLAY' };
    mock.state.subset = [];
    mock.state.session = {
      localPlayerCellId: 0, skipChampionSelect: true,
      myTeam: [{ cellId: 0, championId: AHRI, assignedPosition: 'jungle' }, { cellId: 1, championId: YASUO, assignedPosition: 'top' }],
      theirTeam: [], actions: [],
    };
    await engine.tick();
    mock.state.phase = 'InProgress';
    mock.state.session = null;
    const sel = [AHRI, YASUO, MALPHITE, LEONA].map((championId, i) => ({ puuid: i ? `p${championId}` : PUUID, championId }));
    mock.state.selections = sel;
    (mock.state as unknown as { teams: object }).teams = { teamOne: sel.slice(0, 2), teamTwo: sel.slice(2) };
    (mock.state as unknown as { live: object }).live = {
      gameTime: 200,
      me: { currentGold: 500, level: 3, riotId: 'Celian#EUW' },
      players: [player('Celian#EUW', 'Ahri', 'ORDER', smite), player('A#1', 'Yasuo', 'ORDER', flash), player('B#1', 'Malphite', 'CHAOS', smite), player('C#1', 'Leona', 'CHAOS', flash)],
    };
    await engine.tick();
    // Le jungler adverse est sûr, le guide arrive sans bloquer
    expect(engine.state.counters?.lane).toMatchObject({ opponent: { id: MALPHITE }, guessed: false, games: 0, verdict: 'incertain' });
    await vi.waitFor(() => expect(guideCalls).toContain('Ahri|Malphite|jungle'));
    await vi.waitFor(async () => {
      await engine.tick();
      expect(engine.state.laneMap).toBeTruthy();
      expect(engine.state.counters?.lane?.games).toBe(4000);
    });
    expect(engine.state.counters!.lane!.verdict).toBe('favorable');
    const m = engine.state.laneMap!;
    expect(m.rows.map((r) => [r.lane, r.enemy.name, r.mine, r.guessed])).toEqual([['top', 'Leona', false, true], ['jungle', 'Malphite', true, false]]);
    expect(m.rows[0].edge).toBe('enemy');
    expect(m.weak).toBe('haut, Yasuo contre Leona (44 %)');
  });

  it('une lecture par duel, même à chaque tick', async () => {
    const calls = guideCalls.length;
    await engine.tick();
    await engine.tick();
    expect(guideCalls.length).toBe(calls);
  });

  it('passé 15 min, le bloc se retire', async () => {
    (mock.state as unknown as { live: { gameTime: number } }).live.gameTime = 910;
    await engine.tick();
    await engine.tick();
    expect(engine.state.laneMap).toBeNull();
  });

  it('hors Faille : rien', async () => {
    mock.state.queue = { id: 450, gameMode: 'ARAM' };
    await engine.tick();
    expect(engine.state.laneMap ?? null).toBeNull();
    mock.state.phase = 'None';
    (mock.state as unknown as { teams?: object }).teams = undefined;
    await engine.tick();
  });
});
