// Mayhem en partie : l'item d'un augment lié arrive dans le conseil d'achat, et la carte est notée selon ton plan.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { PUUID, startMockLcu } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
const IMMOLATE = 1319;
const COLLECTOR = 1320;
const SUNFIRE = 3068;

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
const live = {
  me: { currentGold: 1000, level: 3, riotId: 'Celian#EUW' },
  players: [{ riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Malphite', position: '', team: 'ORDER', items: [] as { itemID: number }[] }],
};

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-bound-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
  });
  (engine as unknown as { opggData: object }).opggData = { analysis: async () => null, mainLane: async () => null, guessLanes: async () => new Map(), laneMeta: async () => new Map() };
  await engine.refreshData(false);
  mock.state.phase = 'InProgress';
  mock.state.queue = { id: 2400, gameMode: 'KIWI' };
  mock.state.selections = [{ puuid: PUUID, championId: 54 }];
  (mock.state as unknown as { live: typeof live }).live = live;
  await engine.tick();
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

const read = (ids: number[], names: string[]) => engine.setOffered({ ids, names, rarity: 'kSilver', unsure: null, misses: [] }, engine.readContext());

describe('augments liés à un item', () => {
  it('signale une fois un « Upgrade X » inconnu, jamais sur une lecture partielle', () => {
    const count = () => engine.usage.events.filter((e) => e.type === 'bound_unknown').length;
    engine.setOffered({ ids: [1, 2], names: ['Upgrade Riftmaker', 'Goredrink'], rarity: 'kSilver', unsure: '2 cartes sur 3 reconnues', misses: [] }, engine.readContext());
    expect(count()).toBe(0);
    read([IMMOLATE, COLLECTOR, 1], ['Upgrade Immolate', 'Upgrade Collector', 'Upgrade Riftmaker']);
    read([IMMOLATE, COLLECTOR, 2], ['Upgrade Immolate', 'Upgrade Collector', 'Upgrade Riftmaker']);
    expect(engine.usage.events.filter((e) => e.type === 'bound_unknown')).toMatchObject([{ name: 'Upgrade Riftmaker' }]);
    engine.setOffered(null);
    (engine as unknown as { draw: null }).draw = null;
    (engine as unknown as { offersThisGame: Map<string, unknown> }).offersThisGame.clear();
  });

  it('note la carte selon le plan, sans que le conseil la justifie', async () => {
    expect(engine.state.mode).toBe('mayhem');
    expect(engine.state.nextBuy).not.toBeNull();
    expect(engine.state.nextBuy!.rows[0].why).not.toContain('Immolate');
    read([IMMOLATE, COLLECTOR, 2076], ['Upgrade Immolate', 'Upgrade Collector', 'Quelconque']);
    const fit = engine.state.offered!.fit!;
    expect(fit[COLLECTOR]).toMatchObject({ good: false, delta: -0.02 });
    expect(fit[COLLECTOR].why).toContain('hors de ton plan');
    expect(fit[IMMOLATE]).toMatchObject({ good: true, delta: 0.015 }); // Sunfire : option du build Tank de Malphite
  });

  it('met l’item en tête quand la carte est conseillée, puis l’oublie une fois acheté', async () => {
    const offers = (engine as unknown as { offersThisGame: Map<string, { kind: string; best: number | null }> }).offersThisGame;
    [...offers.values()][0].best = IMMOLATE;
    await engine.tick();
    const row = engine.state.nextBuy!.rows[0];
    expect(row.item.id).toBe(SUNFIRE);
    expect(row.why).toBe("pour Upgrade Immolate, si tu l'as pris");

    live.players[0].items = [{ itemID: SUNFIRE }];
    await engine.tick();
    expect(engine.state.nextBuy!.rows[0].why).not.toContain('Immolate');
    const fit = engine.state.offered!.fit!;
    expect(fit[IMMOLATE]).toMatchObject({ good: true, delta: 0.02 });

    (engine as unknown as { recordPicks(g: number, a: number[], w: boolean): void }).recordPicks(77, [IMMOLATE], true);
    expect(engine.usage.events.filter((e) => e.type === 'item_bound').at(-1)).toMatchObject({ gameId: 77, augment: IMMOLATE, item: SUNFIRE, picked: true, bought: true, win: true });
  });

  it('suit un build proche poussé par un augment, tant que rien n’est acheté', async () => {
    const internals = engine as unknown as { augInfo: object; offersThisGame: Map<string, unknown>; recordPicks(g: number, a: number[], w: boolean): void };
    mock.state.itemData = [[3084, ['Health']], [2502, ['Health', 'Armor']], [3118, ['SpellDamage']], [4645, ['SpellDamage']], [6655, ['SpellDamage']]].map(([id, categories]) => ({ id, name: `Objet ${id}`, priceTotal: 3000, categories }));
    const game = (engine as unknown as { game: { items: Map<number, unknown> } }).game;
    for (const row of mock.state.itemData as { id: number }[]) game.items.set(row.id, row);
    internals.augInfo = { size: 1, tags: () => new Set(['ap']) };
    const build = engine.state.build!;
    const tank = build.cores[0];
    const apCore = build.cores[1];
    const oldWr = apCore.winrate;
    apCore.winrate = tank.winrate - 0.01;
    live.players[0].items = [];
    internals.offersThisGame.clear();
    await engine.tick();
    expect(engine.state.nextBuy!.buildName).toBe(tank.name);

    internals.offersThisGame.set('1:augment:0', { kind: 'augment', best: 1041, round: 1, ids: [1041], cards: [] });
    await engine.tick();
    expect(engine.state.nextBuy!.buildName).toBe(apCore.name);
    expect(engine.state.nextBuy!.rows[0].why).toContain("si tu l'as pris");

    live.players[0].items = [{ itemID: apCore.core[0].id }];
    await engine.tick();
    internals.recordPicks(78, [1041], false);
    expect(engine.usage.events.filter((e) => e.type === 'build_lean').at(-1)).toMatchObject({ gameId: 78, from: tank.name, to: apCore.name, picked: true, bought: true, win: false });

    live.players[0].items = [];
    apCore.winrate = oldWr;
  });

  it('n’ajoute rien hors Mayhem', async () => {
    mock.state.queue = { id: 420, gameMode: 'CLASSIC' };
    const b = (engine as unknown as { boundBuys(o: Set<number>, c: unknown[]): unknown[] });
    engine.state.mode = 'sr';
    expect(b.boundBuys(new Set(), [])).toEqual([]);
    engine.state.mode = 'mayhem';
  });
});
