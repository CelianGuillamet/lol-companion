import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import type { GameData } from '../src/core/gamedata';
import { PUUID, startMockLcu } from './mock-lcu';

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
});
