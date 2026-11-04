// Faille de l'invocateur (classée solo) contre le faux client, avec OP.GG remplacé par la vraie analyse Ahri
// enregistrée (le conteneur de test n'a pas accès à OP.GG) : rôle, matchup, build, runes et sorts importés.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../src/core/engine';
import { Balance } from '../src/core/balance';
import { Arammeta } from '../src/core/arammeta';
import { readAnalysis } from '../src/core/opgg';
import { startMockLcu } from './mock-lcu';
import { PATCHES } from '../src/core/patchchanges';

const fixtures = join(__dirname, 'fixtures');
const ahri = readAnalysis(JSON.parse(readFileSync(join(fixtures, 'opgg', 'opgg-sample-analysis.json'), 'utf8')).result, 'mid')!;
const lux = ahri.losesTo[0];

// Méta des rôles : Darius fort en haut, Syndra forte au milieu, Lux (counter d'Ahri) jouée au milieu
const rows = (champion: string, lane: string, games: number, winRate: number) => [{ champion, lane, games, winRate, roleRate: 0.9, tier: 1 }];
const banMeta = new Map([
  ['darius', rows('Darius', 'top', 300_000, 0.54)],
  ['syndra', rows('Syndra', 'mid', 200_000, 0.53)],
  ['lux', rows('Lux', 'mid', 150_000, 0.5)],
  ['jinx', rows('Jinx', 'adc', 200_000, 0.53)],
]);

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
const asked: string[] = [];
const guideCalls: string[] = [];

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-sr-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(mkdtempSync(join(tmpdir(), 'bal-')), async () => { throw new Error('hors ligne'); }),
    augInfoFetcher: async () => { throw new Error('hors ligne : descriptions Mayhem hors périmètre de ce test Faille'); },
    live: { port: 1 },
  });
  (engine as unknown as { opggData: object }).opggData = {
    analysis: async (name: string, _alias: string, lane: string, mode: string) => {
      asked.push(`${name}|${lane}|${mode}`);
      return ahri;
    },
    mainLane: async () => 'mid',
    guessLanes: async (enemies: { id: number }[]) => new Map(enemies.map((e) => [e.id, e.id === lux.id ? 'mid' : 'top'])),
    laneMeta: async () => banMeta,
    matchupGuide: async (my: { name: string }, _opp: { name: string }, lane: string) => {
      guideCalls.push(`${my.name}|${lane}`);
      const early = my.name === 'Ahri';
      return { data: { summary: { positions: [{ name: 'MID', stats: { play: 200_000 } }] }, game_lengths: [0, 25, 30, 35, 40].map((game_length, i) => ({ game_length, rate: early ? 0.54 - i * 0.015 : 0.48 + i * 0.015 })), opponent_champion_tip: ['Garde ton charme pour son engagement'] } };
    },
  };
  await engine.refreshData(false);
});

afterAll(async () => {
  engine.stop();
  await mock.close();
});

describe('Swiftplay', () => {
  const perks = JSON.stringify({ perkIds: ahri.runes!.perks, perkStyle: ahri.runes!.primary, perkSubStyle: ahri.runes!.sub });
  const tick = async () => {
    await engine.tick();
    await vi.waitFor(() => expect((engine as unknown as { slotsBusy: boolean }).slotsBusy).toBe(false));
  };

  it('au salon : 2 choix comparés à OP.GG, stats de classée, jungle sans Châtiment signalée', async () => {
    mock.state.phase = 'Lobby';
    mock.state.queue = { id: 480, gameMode: 'SWIFTPLAY' };
    mock.state.lobby = {
      gameConfig: { queueId: 480 },
      localMember: { playerSlots: [{ championId: 103, positionPreference: 'MIDDLE', spell1: ahri.spells[1], spell2: ahri.spells[0], perks }, { championId: 54, positionPreference: 'JUNGLE', spell1: 4, spell2: 14, perks }] },
    };
    await tick();
    const l = engine.state.swiftplay!;
    expect(l.queueLabel).toBe('Swiftplay');
    expect(l.queued).toBe(false);
    expect(l.slots[0]).toMatchObject({ championId: 103, lane: 'milieu', spellsOk: true, smiteMissing: false, runes: 'same' });
    expect(l.slots[1]).toMatchObject({ championId: 54, lane: 'jungle', smiteMissing: true });
    expect(l.slots[0].starter.length).toBe(ahri.starter?.ids.length ?? 0);
    expect(l.slots[0].fit).toBeNull(); // méta de test trop mince pour classer
    expect(l.slots[0].mine).toEqual({ games: 0, wins: 0 });
    expect(asked.some((a) => a.endsWith('|mid|ranked'))).toBe(true);
    const events = (engine as unknown as { usage: { events: { type: string }[] } }).usage.events.filter((e) => e.type === 'swiftplay_slots');
    expect(events).toHaveLength(1);
    await tick();
    expect((engine as unknown as { usage: { events: { type: string }[] } }).usage.events.filter((e) => e.type === 'swiftplay_slots')).toHaveLength(1);
  });

  it('en file : le panneau reste, marqué trop tard, sans nouvelle ligne', async () => {
    mock.state.phase = 'Matchmaking';
    await tick();
    expect(engine.state.swiftplay?.queued).toBe(true);
    expect((engine as unknown as { usage: { events: { type: string }[] } }).usage.events.filter((e) => e.type === 'swiftplay_slots')).toHaveLength(1);
  });

  it('méta assez large : rang dans le rôle, rôle principal, plus forts connus du client seulement', async () => {
    const extra = [['ahri', 'Ahri', 0.47, 'mid', 0.9], ['lux2', 'Lux', 0.56, 'mid', 0.9], ['p1', 'Inconnu', 0.57, 'mid', 0.9], ['p2', 'Autre', 0.51, 'mid', 0.9], ['p3', 'Encore', 0.5, 'mid', 0.9], ['p4', 'Dernier', 0.49, 'mid', 0.9]] as const;
    mock.state.phase = 'Lobby';
    const saved = new Map(banMeta);
    banMeta.clear();
    for (const [k, champion, winRate, lane, roleRate] of extra) banMeta.set(k, [{ champion, lane: lane as 'mid', roleRate, winRate, tier: 2, games: 100_000 }]);
    (engine as unknown as { slotsKey: string }).slotsKey = '';
    await tick();
    banMeta.clear();
    for (const [k, v] of saved) banMeta.set(k, v);
    const fit = engine.state.swiftplay!.slots[0].fit!;
    expect(fit).toMatchObject({ rank: 6, of: 6, main: null });
    expect(fit.stronger.map((c) => c.name)).toEqual(['Lux']); // « Inconnu » n'est pas un champion du client
    (engine as unknown as { slotsKey: string }).slotsKey = '';
    await tick();
    expect(engine.state.swiftplay!.slots[0].fit).toBeNull();
  });

  it('session sans choix : rien écrit, le bouton explique pourquoi, le panneau disparaît', async () => {
    mock.state.phase = 'ChampSelect';
    mock.state.subset = [];
    mock.calls.length = 0;
    mock.state.session = { localPlayerCellId: 0, skipChampionSelect: true, myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'middle' }], theirTeam: [], actions: [], timer: { phase: 'GAME_STARTING' } };
    await engine.tick();
    await engine.tick();
    await engine.tick();
    expect(engine.state.swiftplay).toBeNull();
    expect(engine.state.champSelect?.sr?.laneLabel).toBe('milieu');
    expect(mock.calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect((await engine.applyLoadout()).message).toContain('au salon');
    mock.state.lobby = undefined;
    mock.state.session = null;
    mock.state.phase = 'None';
    await engine.tick();
  });

  it('hors Swiftplay : pas de panneau', async () => {
    mock.state.phase = 'Lobby';
    mock.state.queue = { id: 420, gameMode: 'CLASSIC' };
    mock.state.lobby = { gameConfig: { queueId: 420 }, localMember: {} };
    await tick();
    expect(engine.state.swiftplay).toBeNull();
    mock.state.lobby = undefined;
  });
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

  it('patch : changement de l’adversaire tant qu’OP.GG est au patch d’avant, ensuite plus rien', async () => {
    expect(engine.state.data.opggPatch).toBe('16.21');
    PATCHES[0].champions.Lux = ['nerf', 'test'];
    const client = engine.state.data.clientPatch;
    engine.state.data.clientPatch = '16.22';
    try {
      await engine.tick();
      expect(engine.state.champSelect?.sr?.matchup?.opponent.change).toMatchObject({ dir: 'nerf', text: 'test' });
      engine.state.data.opggPatch = '16.22';
      await engine.tick();
      expect(engine.state.champSelect?.sr?.matchup?.opponent.change).toBeUndefined();
    } finally {
      delete PATCHES[0].champions.Lux;
      engine.state.data.clientPatch = client;
      engine.state.data.opggPatch = '16.21';
    }
  });

  it('guide de lane : arrive au tour suivant, sans retarder le matchup, rythme lu et conseils', async () => {
    await vi.waitFor(() => expect(guideCalls.length).toBeGreaterThanOrEqual(2));
    await engine.tick();
    const g = engine.state.champSelect!.sr!.matchup!.guide!;
    expect(g.pace?.text).toContain('Cherche ton avance tôt');
    expect(g.tips).toEqual(['Garde ton charme pour son engagement']);
    const calls = guideCalls.length;
    await engine.tick();
    expect(guideCalls.length).toBe(calls);
  });

  it('bans : aucune action de ban (Swiftplay, phase passée) → rien', () => {
    expect(engine.state.champSelect!.sr!.bans).toBeNull();
  });

  it('bans : conseil pendant ton tour, survol sans validation', async () => {
    const session = mock.state.session as { actions: object[][]; myTeam: object[]; theirTeam: object[] };
    const saved = { actions: session.actions, theirTeam: session.theirTeam };
    session.theirTeam = [];
    session.actions = [
      [{ id: 20, actorCellId: 0, championId: 0, completed: false, isInProgress: true, type: 'ban' }, { id: 21, actorCellId: 1, championId: 134, completed: false, isInProgress: true, type: 'ban' }],
      [{ id: 9, actorCellId: 0, championId: 103, completed: false, isInProgress: false, type: 'pick' }],
    ];
    await engine.tick();
    const bans = engine.state.champSelect!.sr!.bans!;
    expect(bans.myTurn).toBe(true);
    expect(bans.lanes).toBe(2); // ton rôle + le haut, où l'allié a Yasuo
    const names = bans.options.map((o) => o.name);
    expect(names).toContain('Darius');
    expect(names).not.toContain('Syndra'); // survolée au ban par un allié
    expect(names).not.toContain('Jinx'); // rôle dont l'allié n'a rien montré
    const luxBan = bans.options.find((o) => o.id === 99)!;
    expect(luxBan.myWinRate).toBeCloseTo(0.47, 2); // counter d'Ahri, malgré un winrate global de 50 %
    const darius = bans.options.find((o) => o.name === 'Darius')!;

    const r = await engine.hoverBan(darius.id);
    expect(r.ok).toBe(true);
    const call = mock.calls.filter((c) => c.method === 'PATCH' && c.path === '/lol-champ-select/v1/session/actions/20').pop();
    expect(call?.body).toEqual({ championId: darius.id, completed: false });
    expect(engine.state.champSelect!.sr!.bans!.hovered).toBe(darius.id);

    // Pas ton tour : le client n'est pas appelé
    (session.actions[0][0] as { isInProgress: boolean }).isInProgress = false;
    const patches = () => mock.calls.filter((c) => c.method === 'PATCH' && c.path.includes('/actions/')).length;
    const before = patches();
    expect((await engine.hoverBan(darius.id)).ok).toBe(false);
    expect(patches()).toBe(before);

    // Ban validé : le panneau disparaît
    (session.actions[0][0] as { completed: boolean }).completed = true;
    await engine.tick();
    expect(engine.state.champSelect!.sr!.bans).toBeNull();
    Object.assign(session, saved);
    await engine.tick();
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
