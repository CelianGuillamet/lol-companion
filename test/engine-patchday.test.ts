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
const calls: string[] = [];
const flush = () => new Promise((r) => setTimeout(r, 30));

beforeAll(async () => {
  mock = await startMockLcu();
  (mock.state as unknown as { gameVersion: string }).gameVersion = '16.22.725.1234';
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-patchday-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
    augInfoFetcher: async () => readFileSync(join(fixtures, 'mayhem-augments.lua'), 'utf8'),
    ddragonFetcher: ddFetcher(calls),
  });
  await engine.refreshData(false);
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

describe('jour de patch', () => {
  it('les timers lisent le patch du client, pas celui, en retard, d’arammeta', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.selections = [{ puuid: PUUID, championId: 89 }];
    const spell = { rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerFlash_DisplayName' };
    (mock.state as unknown as { live: unknown }).live = {
      gameTime: 300,
      me: { currentGold: 0, level: 9, riotId: 'Celian#EUW' },
      players: [
        { riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Leona', team: 'ORDER', level: 9, items: [], summonerSpells: { summonerSpellOne: spell, summonerSpellTwo: spell } },
        { riotId: 'Rival#EUW', rawChampionName: 'game_character_displayname_Ahri', team: 'CHAOS', level: 11, items: [], summonerSpells: { summonerSpellOne: spell, summonerSpellTwo: spell } },
      ],
    };
    for (let i = 0; i < 4; i++) {
      await engine.tick();
      await flush();
    }
    expect(engine.state.data.clientPatch).toBe('16.22');
    expect(engine.state.data.patch).toBe('16.21');
    expect(calls.some((u) => u.includes('/cdn/16.22.1/'))).toBe(true);
    expect(calls.some((u) => u.includes('/cdn/16.21.1/'))).toBe(false);
  });
});
