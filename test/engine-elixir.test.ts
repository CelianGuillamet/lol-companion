import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import type { GameData } from '../src/core/gamedata';
import { PUUID, startMockLcu } from './mock-lcu';
import { ddFetcher } from './ddragon-fixture';

const fixtures = join(__dirname, 'fixtures');
let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-elixir-'));
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
  vi.restoreAllMocks();
  engine?.stop();
  await mock?.close();
});

describe('élixir quand il ne reste rien à acheter', () => {
  it('sac plein d’items finis : conseille, voit l’achat, suit l’effet, repropose', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.selections = [{ puuid: PUUID, championId: 89 }];
    const live = {
      me: { currentGold: 3000, level: 15, riotId: 'Celian#EUW' } as { currentGold: number; level: number; riotId: string },
      players: [{ riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Leona', isDead: true, respawnTimer: 0, items: [] as { itemID: number; slot: number }[] }],
    };
    (mock.state as unknown as { live: typeof live }).live = live;
    await engine.tick();
    const game = (engine as unknown as { game: GameData }).game;
    const six = [990001, 990002, 990003, 990004, 990005, 990006];
    for (const id of six) game.items.set(id, { id, name: `Item fini ${id}`, priceTotal: 3000, categories: ['Health'] });
    live.players[0].items = six.map((itemID, slot) => ({ itemID, slot }));
    await engine.tick();
    await new Promise((r) => setTimeout(r, 30)); // Data Dragon se charge sans bloquer le tick
    await engine.tick();

    const shown = engine.state.nextBuy!;
    expect(shown.rows[0].room?.sell ?? null).toBeNull();
    expect(shown.elixir).toMatchObject({ item: { id: 2138 }, price: 500, left: null, buy: true }); // Leona : tank
    expect(engine.usage.events.filter((e) => e.type === 'elixir')).toMatchObject([{ id: 2138, bought: false, level: 15 }]);

    live.me.currentGold = 2510;
    live.players[0].respawnTimer = 20;
    const t0 = Date.now();
    await engine.tick();
    expect(engine.usage.events.filter((e) => e.type === 'elixir').pop()).toMatchObject({ bought: true, gold: 2510 });
    expect(engine.state.nextBuy!.elixir).toMatchObject({ buy: false });
    expect(engine.state.nextBuy!.elixir!.left).toBeGreaterThan(195); // 20 s de mort + 180 s

    const spy = vi.spyOn(Date, 'now').mockReturnValue(t0 + 170_000);
    await engine.tick();
    expect(engine.state.nextBuy!.elixir).toMatchObject({ buy: true });
    spy.mockRestore();
  });

  it('enclume : passe avant l’élixir, vue à l’or, comptée, jamais hors Mayhem', async () => {
    const live = (mock.state as unknown as { live: { me: { currentGold: number; level: number }; players: { items: { itemID: number; slot: number }[]; isDead: boolean; respawnTimer: number }[] } }).live;
    (engine as unknown as { elixirEnd: number | null; elixirTick: null }).elixirEnd = null;
    (engine as unknown as { elixirTick: null }).elixirTick = null;

    live.me.currentGold = 1000;
    await engine.tick();
    expect(engine.state.nextBuy!.anvil).toMatchObject({ price: 750, buy: true, missing: 0, bought: 0, item: { name: 'Enclume de stats' } });
    expect(engine.state.nextBuy!.anvil!.pick).toContain('Côté défense'); // Leona : tank
    expect(engine.state.nextBuy!.elixir).toBeNull(); // 1 000 - 750 : pas de quoi prendre les deux
    expect(engine.usage.events.filter((e) => e.type === 'anvil')).toMatchObject([{ bought: false, gold: 3000, level: 15 }]);

    live.me.currentGold = 260;
    await engine.tick();
    expect(engine.state.nextBuy!.anvil).toMatchObject({ buy: false, missing: 490, bought: 1 });
    expect(engine.state.nextBuy!.elixir).toBeNull();
    expect(engine.usage.events.filter((e) => e.type === 'anvil').pop()).toMatchObject({ bought: true, count: 1, gold: 260 });

    live.me.currentGold = 1300;
    await engine.tick();
    expect(engine.state.nextBuy!.anvil).toMatchObject({ buy: true, bought: 1 });
    expect(engine.state.nextBuy!.elixir).toMatchObject({ buy: true }); // assez pour les deux
    expect(engine.usage.events.filter((e) => e.type === 'anvil' && !e.bought)).toHaveLength(1);

    const was = engine.state.mode;
    engine.state.mode = 'aram';
    await engine.tick();
    expect(engine.state.nextBuy?.anvil ?? null).toBeNull();
    engine.state.mode = was;
    live.me.currentGold = 3000;
  });

  it('niveau 8, ou un achat reste possible : rien', async () => {
    const live = (mock.state as unknown as { live: { me: { level: number }; players: { items: { itemID: number; slot: number }[] }[] } }).live;
    live.me.level = 8;
    await engine.tick();
    expect(engine.state.nextBuy!.elixir).toBeNull();
    expect(engine.state.nextBuy!.anvil).toBeNull();
    live.me.level = 15;
    live.players[0].items = live.players[0].items.slice(0, 3);
    await engine.tick();
    expect(engine.state.nextBuy!.rows.length).toBeGreaterThan(0);
    expect(engine.state.nextBuy!.elixir).toBeNull();
    expect(engine.state.nextBuy!.anvil).toBeNull();
  });
});
