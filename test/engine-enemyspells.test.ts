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
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-spells-'));
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

describe('sorts ennemis en partie', () => {
  it('liste les ennemis seulement, calcule les cooldowns, démarre au signalement', async () => {
    mock.state.phase = 'InProgress';
    mock.state.queue = { id: 2400, gameMode: 'KIWI' };
    mock.state.selections = [{ puuid: PUUID, championId: 89 }];
    const flash = { rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerFlash_DisplayName' };
    const ghost = { rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerHaste_DisplayName' };
    const live = {
      gameTime: 300,
      me: { currentGold: 0, level: 9, riotId: 'Celian#EUW' },
      players: [
        { riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Leona', team: 'ORDER', level: 9, items: [], summonerSpells: { summonerSpellOne: flash, summonerSpellTwo: ghost } },
        { riotId: 'Allie#EUW', rawChampionName: 'game_character_displayname_Lux', team: 'ORDER', level: 9, items: [], summonerSpells: { summonerSpellOne: flash, summonerSpellTwo: ghost } },
        { riotId: 'Rival#EUW', rawChampionName: 'game_character_displayname_Ahri', team: 'CHAOS', level: 11, items: [{ itemID: 3158 }], runes: null, summonerSpells: { summonerSpellOne: flash, summonerSpellTwo: ghost } },
      ],
    };
    (mock.state as unknown as { live: typeof live }).live = live;
    for (let i = 0; i < 4; i++) {
      await engine.tick();
      await flush();
    }
    const panel = engine.state.enemySpells!;
    expect(panel.enemies.map((e) => e.championName)).toEqual(['Ahri']);
    const [r, d] = panel.enemies[0].spells;
    expect(r).toMatchObject({ slot: 'R', name: 'Spirit Rush', readyAt: null });
    expect(r.cooldown).toBeCloseTo((120 * 100) / 110, 1);
    expect(d).toMatchObject({ slot: 'D', name: 'Flash', readyAt: null });

    live.gameTime = 310;
    const res = await engine.markEnemySpell(103, 'D', 'cast');
    expect(res.ok).toBe(true);
    const flashT = engine.state.enemySpells!.enemies[0].spells[1];
    expect(flashT.readyAt).toBeCloseTo(310 + (300 * 100) / 180, 1); // 10 des bottes + 70 du mode
    expect(flashT.earliest).toBeNull(); // pas de runes en Mayhem
    expect(mock.calls.filter((c) => c.path === '/liveclientdata/gamestats').length).toBeGreaterThan(0);

    expect((await engine.markEnemySpell(103, 'X' as 'R', 'cast')).ok).toBe(false);
    expect((await engine.markEnemySpell(89, 'D', 'cast')).ok).toBe(false); // allié : pas suivi
  });

  it('compte l\'accélération d\'équilibrage du champion sur l\'ultime', async () => {
    const balance = (engine as unknown as { balance: { map: Map<string, unknown> } }).balance;
    balance.map.set('ahri', { aram: { ability_haste: 20 } });
    await engine.tick();
    await flush();
    balance.map.delete('ahri');
    const [r] = engine.state.enemySpells!.enemies[0].spells;
    expect(r.cooldown).toBeCloseTo((120 * 100) / 130, 1); // 10 de l'objet + 20 du mode
    expect(r.detail).toContain('+20 d’équilibrage du mode');
  });

  it('remis à zéro au champ select suivant', async () => {
    mock.state.phase = 'ChampSelect';
    await engine.tick();
    expect(engine.state.enemySpells).toBeNull();
  });
});
