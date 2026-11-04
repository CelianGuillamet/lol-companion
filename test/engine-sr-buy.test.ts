// Faille en partie : le conseil d'achat et la revue comparent les items au même rang (fourth_items, fifth_items d'OP.GG).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { readAnalysis } from '../src/core/opgg';
import type { GameData } from '../src/core/gamedata';
import { PUUID, game, startMockLcu } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
const ahri = readAnalysis(JSON.parse(readFileSync(join(fixtures, 'opgg', 'opgg-sample-analysis.json'), 'utf8')).result, 'mid')!;
const VOID = 3135;
const RABADON = 3089;
const OTHER = 3102; // Banshee : hors plan, présent au 4e rang dans cette analyse de test
const analysis = { ...ahri, fourth: [...ahri.fourth, { ids: [OTHER], names: ['Banshee'], games: 900, winrate: 0.44, pick: 0.03 }, { ids: [3100], names: ['Lich Bane'], games: 800, winrate: 0.5, pick: 0.03 }, { ids: [3102 + 1000], names: ['X'], games: 700, winrate: 0.49, pick: 0.03 }] };

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
let probeDir: string;

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-sr-buy-'));
  probeDir = join(dataDir, 'probe');
  engine = new Engine({
    dataDir,
    probeDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
  });
  (engine as unknown as { opggData: object }).opggData = {
    analysis: async () => analysis,
    mainLane: async () => 'mid',
    guessLanes: async (foes: { id: number }[]) => new Map(foes.map((f) => [f.id, f.id === 99 ? 'mid' : 'top'])),
    laneMeta: async () => new Map(),
  };
  await engine.refreshData(false);
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

describe('Faille : jungle et dégâts adverses', () => {
  it('nomme le jungler adverse et donne la part de leurs dégâts', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 480, gameMode: 'SWIFTPLAY' };
    const foes = [54, 89, 157];
    const sel = [{ puuid: PUUID, championId: 103 }, ...foes.map((championId) => ({ puuid: `e${championId}`, championId }))];
    mock.state.selections = sel;
    (mock.state as unknown as { teams: object }).teams = { teamOne: sel.slice(0, 1), teamTwo: sel.slice(1) };
    (mock.state as unknown as { live: object }).live = {
      me: { currentGold: 500, level: 6, riotId: 'Celian#EUW' },
      players: [
        { riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Ahri', position: 'JUNGLE', team: 'ORDER', items: [] },
        { riotId: 'A#1', rawChampionName: 'game_character_displayname_Malphite', position: 'JUNGLE', team: 'CHAOS', items: [] },
        { riotId: 'B#1', rawChampionName: 'game_character_displayname_Leona', position: 'UTILITY', team: 'CHAOS', items: [] },
        { riotId: 'C#1', rawChampionName: 'game_character_displayname_Yasuo', position: 'TOP', team: 'CHAOS', items: [] },
      ],
    };
    await engine.tick();
    const c = engine.state.counters!;
    expect(c.jungle).toBe(true);
    expect(c.lane?.opponent.id).toBe(54);
    expect(c.damage!.phys + c.damage!.magic + c.damage!.true).toBeCloseTo(1);
    mock.state.phase = 'None';
    (mock.state as unknown as { teams?: object }).teams = undefined;
    await engine.tick();
  });
});

describe('Faille : achats comparés au même rang', () => {
  it('classe les options au rang à acheter et note le rang de l’achat', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 420, gameMode: 'CLASSIC' };
    mock.state.selections = [{ puuid: PUUID, championId: 103 }];
    const live = {
      me: { currentGold: 4000, level: 14, riotId: 'Celian#EUW' },
      players: [{ riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Ahri', position: 'MIDDLE', team: 'ORDER', items: [] as { itemID: number }[] }],
    };
    (mock.state as unknown as { live: typeof live }).live = live;
    await engine.tick();
    const data = (engine as unknown as { game: GameData }).game;
    for (const [id, name] of [[3118, 'Malignance'], [4645, 'Shadowflame'], [3157, 'Zhonya'], [RABADON, 'Rabadon'], [VOID, 'Void Staff'], [OTHER, 'Banshee']] as const) data.items.set(id, { id, name, priceTotal: 3000 });
    data.items.set(3020, { id: 3020, name: 'Sorcerer', priceTotal: 1100, categories: ['Boots'] });

    live.players[0].items = [3118, 4645, 3157, 3020].map((itemID) => ({ itemID }));
    await engine.tick();
    const rows = engine.state.nextBuy!.rows;
    expect(rows[0]).toMatchObject({ item: { id: RABADON } });
    expect(rows[0].why).toBe('4e item (58 %)');

    // 4e item acheté : Banshee, hors des 3 conseils, 14 points sous le conseil au même rang
    live.players[0].items = [3118, 4645, 3157, 3020, OTHER].map((itemID) => ({ itemID }));
    await engine.tick();
    const buy = engine.usage.events.filter((e) => e.type === 'item_bought').pop();
    expect(buy).toMatchObject({ id: OTHER, reco: RABADON, slot: 4, value: 0.44, games: 900, recoGames: 10558 });
    // Le conseil suivant passe au 5e rang : Rabadon y vaut 64 %, pas 58 %
    expect(engine.state.nextBuy!.rows[0]).toMatchObject({ item: { id: RABADON } });
    expect(engine.state.nextBuy!.rows[0].why).toBe('5e item (64 %)');

    mock.state.eogGameId = 92;
    mock.state.phase = 'EndOfGame';
    mock.state.games[92] = game(92, 420, 103, true, []);
    await engine.tick();
    const line = engine.getHistory().find((g) => g.gameId === 92)?.buys?.lines.find((l) => l.id === OTHER);
    expect(line).toMatchObject({ verdict: 'costly', slot: 4 });
  });

  it('rien d’acheté : le départ OP.GG, Gardien à la place de Doran en Swiftplay seulement', async () => {
    const usage = () => (engine as unknown as { usage: { events: { type: string }[] } }).usage.events.filter((e) => e.type === 'starter');
    const ids = () => engine.state.nextBuy?.starter?.items.map((x) => x.id);
    const live = { gameTime: 5, me: { currentGold: 1400, level: 3, riotId: 'Celian#EUW' }, players: [{ riotId: 'Celian#EUW', championName: 'Ahri', position: 'MIDDLE', team: 'ORDER', items: [{ itemID: 3340, slot: 6 }] as { itemID: number; slot: number }[] }] };

    mock.state.phase = 'ChampSelect';
    mock.state.queue = { id: 420, gameMode: 'CLASSIC' };
    await engine.tick();
    mock.state.phase = 'InProgress';
    mock.state.selections = [{ puuid: PUUID, championId: 103 }];
    (mock.state as unknown as { live: typeof live }).live = live;
    await engine.tick();
    await engine.tick();
    expect(ids()).toEqual([1056, 2003, 2003]);
    expect(engine.state.nextBuy?.starter?.swapped).toBe(false);

    mock.state.queue = { id: 480, gameMode: 'SWIFTPLAY' };
    mock.state.phase = 'ChampSelect';
    await engine.tick();
    mock.state.phase = 'InProgress';
    await engine.tick();
    await engine.tick();
    expect(ids()).toEqual([3112, 2003, 2003]); // cache séparé : la classée de tout à l'heure ne ressert pas Doran
    expect(engine.state.nextBuy?.starter?.swapped).toBe(true);
    expect(engine.state.build?.starterSwapped).toBe(true);

    live.players[0].items.push({ itemID: 3112, slot: 0 });
    const before = usage().length;
    await engine.tick();
    expect(engine.state.nextBuy?.starter).toBeNull();
    expect(usage().slice(before)).toMatchObject([{ advised: [3112, 2003, 2003], owned: [3340, 3112], swapped: true, queueId: 480 }]);
    await engine.tick();
    expect(usage()).toHaveLength(before + 1); // une fois par partie
  });

  it('Swiftplay sans `position` en partie : rôle du salon, adversaire deviné et affiché comme tel', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 480, gameMode: 'SWIFTPLAY' };
    mock.state.selections = [{ puuid: PUUID, championId: 103 }];
    (engine as unknown as { lane: string }).lane = 'mid';
    (mock.state as unknown as { teams: object }).teams = { teamOne: [{ puuid: PUUID, championId: 103 }], teamTwo: [{ puuid: 'a', championId: 99 }, { puuid: 'b', championId: 122 }] };
    (mock.state as unknown as { live: object }).live = {
      me: { currentGold: 500, level: 6, riotId: 'Celian#EUW' },
      players: [
        { riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Ahri', position: '', team: 'ORDER', items: [] },
        { riotId: 'A#1', rawChampionName: 'game_character_displayname_Lux', position: '', team: 'CHAOS', items: [] },
        { riotId: 'B#1', rawChampionName: 'game_character_displayname_Darius', position: '', team: 'CHAOS', items: [] },
      ],
    };
    await engine.tick();
    expect(engine.state.counters?.lane).toMatchObject({ opponent: { id: 99 }, guessed: true });
    delete (mock.state as unknown as { teams?: object }).teams;
  });

  it('capture les 10 joueurs et la session en Faille, sans identifiants', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 480, gameMode: 'SWIFTPLAY' };
    mock.state.selections = [{ puuid: PUUID, championId: 103 }];
    const live = {
      gameTime: 60,
      me: { currentGold: 500, level: 6, riotId: 'Celian#EUW', riotIdGameName: 'Celian' },
      players: [{ riotId: 'Celian#EUW', riotIdGameName: 'Celian', summonerName: 'Celian', championName: 'Ahri', position: 'JUNGLE', team: 'ORDER', items: [{ itemID: 3020, slot: 0 }] }],
    };
    (mock.state as unknown as { live: object }).live = live;
    await engine.tick();
    await engine.tick();
    await new Promise((r) => setTimeout(r, 30));
    expect(readdirSync(probeDir).filter((f) => f.startsWith('liveclient-faille'))).toEqual([]); // 1 min : rôles pas encore utiles
    live.gameTime = 130;
    await engine.tick();
    await engine.tick();
    await engine.tick();
    await new Promise((r) => setTimeout(r, 30));
    const files = readdirSync(probeDir).filter((f) => f.startsWith('liveclient-faille1-'));
    expect(files).toHaveLength(1); // une seule capture par moment
    const raw = readFileSync(join(probeDir, files[0]), 'utf8');
    expect(raw).not.toContain('Celian');
    expect(JSON.parse(raw)).toMatchObject({ round: 1, gameTime: 130, players: [{ champion: 'Ahri', position: 'JUNGLE', items: [3020] }] });
    live.gameTime = 905;
    await engine.tick();
    await engine.tick();
    await new Promise((r) => setTimeout(r, 30));
    expect(readdirSync(probeDir).filter((f) => f.startsWith('liveclient-faille2-'))).toHaveLength(1);
  });

  it('CS de lane : face à l\'adversaire de lane, deviné en Swiftplay, et rien pour un soutien', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 480, gameMode: 'SWIFTPLAY' };
    mock.state.selections = [{ puuid: PUUID, championId: 103 }];
    (engine as unknown as { lane: string }).lane = 'mid';
    (mock.state as unknown as { teams: object }).teams = { teamOne: [{ puuid: PUUID, championId: 103 }], teamTwo: [{ puuid: 'a', championId: 99 }, { puuid: 'b', championId: 122 }] };
    (mock.state as unknown as { live: object }).live = {
      gameTime: 600,
      me: { currentGold: 500, level: 8, riotId: 'Celian#EUW' },
      players: [
        { riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Ahri', position: '', team: 'ORDER', items: [], scores: { creepScore: 70 } },
        { riotId: 'A#1', rawChampionName: 'game_character_displayname_Lux', position: '', team: 'CHAOS', items: [], scores: { creepScore: 50 } },
        { riotId: 'B#1', rawChampionName: 'game_character_displayname_Darius', position: '', team: 'CHAOS', items: [], scores: { creepScore: 90 } },
      ],
    };
    await engine.tick();
    await engine.tick();
    expect(engine.state.laneCs).toMatchObject({ mine: 70, theirs: 50, gap: 20, perMin: 7, opponent: { id: 99 }, guessed: true });
    expect((engine as unknown as { csSamples: Map<number, object> }).csSamples.get(2)).toEqual({ t: 600, mine: 70, theirs: 50 });
    (engine as unknown as { lane: string }).lane = 'support';
    await engine.tick();
    expect(engine.state.laneCs).toBeNull();
    (engine as unknown as { lane: string | null }).lane = null;
    delete (mock.state as unknown as { teams?: object }).teams;
  });

  it('League Classic : aucune donnée ni stat en partie', async () => {
    mock.state.phase = 'None';
    await engine.tick();
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 4100, gameMode: 'CLASSIC', description: 'League Classic' } as typeof mock.state.queue;
    await engine.tick();
    expect(engine.state.mode).toBeNull();
    expect(engine.state.intelligence).toBeNull();
    expect(engine.state.laneCs ?? null).toBeNull();
    mock.state.phase = 'None';
    mock.state.queue = { id: 480, gameMode: 'SWIFTPLAY' };
    await engine.tick();
  });
});
