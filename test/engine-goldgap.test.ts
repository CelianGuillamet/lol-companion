import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { PUUID, startMockLcu } from './mock-lcu';
import { ddFetcher } from './ddragon-fixture';

const fixtures = join(__dirname, 'fixtures');
let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
const flush = () => new Promise((r) => setTimeout(r, 30));

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-gap-'));
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

describe('écart d\'objets en partie', () => {
  it('lit le tableau des scores au prix total, pas au prix de recette du Live Client', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.selections = [{ puuid: PUUID, championId: 89 }];
    (mock.state as unknown as { live: object }).live = {
      gameTime: 620,
      me: { currentGold: 0, level: 9, riotId: 'Celian#EUW' },
      players: [
        { riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Leona', team: 'ORDER', level: 9, items: [{ itemID: 3084, price: 400, count: 1, consumable: false }] },
        { riotId: 'Rival#EUW', rawChampionName: 'game_character_displayname_Ahri', team: 'CHAOS', level: 11, items: [{ itemID: 3111, price: 550, count: 1, consumable: false }] },
      ],
    };
    await engine.tick();
    await flush();
    const g = engine.state.goldGap!;
    expect(g.allyGold).toBe(3000);
    expect(g.enemyGold).toBe(1250);
    expect(g.gap).toBe(1750);
    expect(g.levelGap).toBe(-2);
    expect(g.richest.championName).toBe('Ahri');
    expect((engine as unknown as { goldSamples: Map<number, object> }).goldSamples.get(2)).toEqual({ t: 620, gap: 1750, levels: -2 });
  });

  it('garde la version lancée et ce qui attend sur le disque', async () => {
    engine.setAppVersion('v1.78');
    engine.setUpdate({ latest: 'v1.79', count: 1, news: [{ version: 'v1.79', title: 'titre' }] });
    await flush();
    expect(engine.state.appVersion).toBe('v1.78');
    expect(engine.state.update?.latest).toBe('v1.79');
    expect(engine.state.log[0]?.text ?? '').not.toBe('');
    expect(engine.state.log.some((l) => l.text === 'Version v1.78 lancée')).toBe(true);
    engine.setUpdate(null);
    expect(engine.state.update).toBeNull();
  });
});
