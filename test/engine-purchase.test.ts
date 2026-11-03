import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import type { GameData } from '../src/core/gamedata';
import { PUUID, game, startMockLcu } from './mock-lcu';
import { ddFetcher } from './ddragon-fixture';

const fixtures = join(__dirname, 'fixtures');
let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-purchase-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
    augInfoFetcher: async () => readFileSync(join(fixtures, 'mayhem-augments.lua'), 'utf8'),
    ddragonFetcher: ddFetcher(),
  });
  await engine.refreshData(false);
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

describe('achat en partie : coût du composant transmis à l’interface', () => {
  it('déduit les composants possédés, mappe leur nom et actualise après l’achat', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.selections = [{ puuid: PUUID, championId: 89 }];
    const live = {
      me: { currentGold: 600, level: 12, riotId: 'Celian#EUW' },
      players: [{ riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Leona', items: [{ itemID: 3084 }, { itemID: 3111 }, { itemID: 900003 }] }],
    };
    (mock.state as unknown as { live: typeof live }).live = live;
    await engine.tick(); // Charge les données statiques depuis le vrai faux client HTTPS.
    expect(engine.state.connection).toBe('connected');

    // Recette SYNTHÉTIQUE de régression : ne prétend pas décrire celle d’Unending Despair en jeu.
    // 2502 (2800) -> composant renforcé (1000) -> composant de base (400), plus composant secondaire (800).
    const { game } = engine as unknown as { game: GameData };
    game.items.set(2502, { ...game.items.get(2502)!, from: [900001, 900002] });
    game.items.set(900001, { id: 900001, name: 'Composant renforcé de test', priceTotal: 1000, from: [900003], to: [2502] });
    game.items.set(900002, { id: 900002, name: 'Composant secondaire de test', priceTotal: 800, to: [2502] });
    game.items.set(900003, { id: 900003, name: 'Composant de base de test', priceTotal: 400, to: [900001] });
    await engine.tick();

    expect(engine.state.nextBuy?.gold).toBe(600);
    expect(engine.state.nextBuy?.rows[0]).toMatchObject({
      item: { id: 2502, name: 'Unending Despair' },
      price: 2800, remaining: 2400, missing: 1800,
      step: { item: { id: 900001, name: 'Composant renforcé de test' }, price: 600 },
    });

    live.me.currentGold = 0;
    live.players[0].items = [{ itemID: 3084 }, { itemID: 3111 }, { itemID: 900001 }];
    await engine.tick();
    const next = engine.state.nextBuy!.rows[0];
    expect(next).toMatchObject({ item: { id: 2502 }, remaining: 1800, missing: 1800 });
    expect(next.step).toBeUndefined();
    expect(mock.calls.some((c) => c.path === '/liveclientdata/activeplayer')).toBe(true);
    expect(mock.calls.some((c) => c.path === '/liveclientdata/playerlist')).toBe(true);
  });

  it('garde la valeur de l’achat et du conseil, et note les achats avec la partie', async () => {
    const live = (mock.state as unknown as { live: { me: { currentGold: number }; players: { items: { itemID: number }[] }[] } }).live;
    const data = (engine as unknown as { game: GameData }).game;
    data.items.set(3110, { id: 3110, name: 'Frozen Heart', priceTotal: 2500 });
    live.me.currentGold = 3000;
    live.players[0].items = [{ itemID: 3084 }, { itemID: 3111 }];
    await engine.tick();
    const reco = engine.state.nextBuy!.rows[0];
    expect(reco.item.id).toBe(2502); // 51,61 % sur 14 924 parties dans la fixture
    live.players[0].items = [{ itemID: 3084 }, { itemID: 3111 }, { itemID: 3110 }]; // Frozen Heart : 53,93 %
    await engine.tick();
    const buy = engine.usage.events.filter((e) => e.type === 'item_bought').pop();
    expect(buy).toMatchObject({ id: 3110, reco: 2502, value: 0.5393, games: 1974, recoValue: 0.5161, recoGames: 14924, why: reco.why });

    mock.state.eogGameId = 91;
    mock.state.phase = 'EndOfGame';
    mock.state.games[91] = game(91, 2400, 89, true, [1058]);
    await engine.tick();
    const buys = engine.getHistory().find((g) => g.gameId === 91)?.buys;
    expect(buys?.lines.find((l) => l.id === 3110)).toMatchObject({ recoName: 'Unending Despair', value: 0.5393 });
    expect(buys?.approx).toBeUndefined();
  });

  it('sac plein : dit quoi vendre, et ne compte ni la relique ni le Poro-Snax', async () => {
    const live = (mock.state as unknown as { live: { me: { currentGold: number }; players: { items: { itemID: number; slot?: number }[] }[] } }).live;
    const game = (engine as unknown as { game: GameData }).game;
    mock.state.phase = 'InProgress';
    await engine.tick();
    game.items.set(900010, { id: 900010, name: 'Composant orphelin de test', priceTotal: 300 });
    live.me.currentGold = 9000;
    const others = [990001, 990002, 990003, 990004, 900010, 990005];
    for (const id of others) if (id !== 900010) game.items.set(id, { id, name: `Item fini ${id}`, priceTotal: 3000 });
    live.players[0].items = [...others.map((itemID, slot) => ({ itemID, slot })), { itemID: 3340, slot: 6 }];
    await engine.tick();
    const blocked = engine.state.nextBuy!.rows.filter((r) => r.room);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0].room?.sell?.name).toBe('Composant orphelin de test');

    // Or juste en dessous du prix : la revente (gold.sell de Data Dragon) comble l'écart
    const first = engine.state.nextBuy!.rows[0];
    live.me.currentGold = first.remaining! - 100;
    await engine.tick();
    await new Promise((r) => setTimeout(r, 50)); // Data Dragon se charge sans bloquer le tick
    await engine.tick();
    expect(engine.state.nextBuy!.rows[0].resale).toEqual({ items: [expect.objectContaining({ name: 'Composant orphelin de test' })], gain: 210 });
    expect(engine.usage.events.filter((e) => e.type === 'resale')).toHaveLength(1);
    live.me.currentGold = 9000;

    // Les 6 places : 5 prises + la relique = de la place
    live.players[0].items = [...others.slice(0, 5).map((itemID, slot) => ({ itemID, slot })), { itemID: 3340, slot: 6 }];
    await engine.tick();
    expect(engine.state.nextBuy!.rows.some((r) => r.room)).toBe(false);
  });
});
