// Faille en partie : le conseil d'achat et la revue comparent les items au même rang (fourth_items, fifth_items d'OP.GG).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
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

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-sr-buy-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
  });
  (engine as unknown as { opggData: object }).opggData = {
    analysis: async () => analysis,
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
});
