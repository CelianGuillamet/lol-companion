import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import type { CounterPanel } from '../src/core/types';
import { PUUID, startMockLcu } from './mock-lcu';
import { ddFetcher } from './ddragon-fixture';

const fixtures = join(__dirname, 'fixtures');
let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
let probeDir: string;

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-threat-'));
  probeDir = join(dataDir, 'probe');
  engine = new Engine({
    dataDir,
    probeDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
    augInfoFetcher: async () => readFileSync(join(fixtures, 'mayhem-augments-wiki.lua'), 'utf8'),
    ddragonFetcher: ddFetcher(),
  });
  await engine.refreshData(false);
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

describe('menace plus coûteuse que le build', () => {
  it('passe après le build, le dit, et note une seule ligne par partie', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.selections = [{ puuid: PUUID, championId: 89 }];
    const live = {
      me: { currentGold: 3000, level: 12, riotId: 'Celian#EUW' },
      players: [{ riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Leona', items: [{ itemID: 3084 }, { itemID: 3111 }] }],
    };
    (mock.state as unknown as { live: typeof live }).live = live;
    await engine.tick();
    const plan = engine.state.nextBuy!.rows[0].item;

    const threat: CounterPanel['threats'][number] = { key: 'armor', title: 'Armure', why: 'test', champions: [], urgent: true, items: [{ id: 6662, name: 'Iceborn Gauntlet', icon: null }] };
    engine.state.build!.itemStats = [{ id: 6662, winrate: 0.5064, games: 1090 }, { id: plan.id, winrate: 0.5693, games: 22411 }];
    const panel = { gameKey: 't', role: 'tank', enemies: [], threats: [threat] } as CounterPanel;
    (engine as unknown as { counterPanel: () => Promise<CounterPanel> }).counterPanel = async () => panel;
    await engine.tick();
    await engine.tick();

    const nb = engine.state.nextBuy!;
    expect(nb.rows[0].item.id).toBe(plan.id);
    expect(nb.deferred).toMatchObject([{ key: 'armor', item: { id: 6662 }, by: { id: plan.id }, value: 0.5064, byValue: 0.5693 }]);
    expect(engine.usage.events.filter((e) => e.type === 'threat_deferred')).toHaveLength(1);
  });
});

describe('texte des augments', () => {
  it('copié dans probe-output pour les sessions', () => {
    const copy = join(probeDir, 'wiki-mayhem-augments.lua');
    expect(existsSync(copy)).toBe(true);
    expect(readFileSync(copy, 'utf8')).toBe(readFileSync(join(fixtures, 'mayhem-augments-wiki.lua'), 'utf8'));
  });
});
