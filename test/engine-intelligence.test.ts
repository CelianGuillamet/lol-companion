import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { PUUID, startMockLcu } from './mock-lcu';
import { intelligenceFixture } from './intelligence-fixture';
import { ddFetcher } from './ddragon-fixture';

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
afterEach(async () => { engine?.stop(); await mock?.close(); });

async function setup(canDiscover = () => true) {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-intelligence-'));
  engine = new Engine({
    dataDir, discover: async () => canDiscover() ? { port: mock.port, token: mock.token } : null, live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) =>
      readFileSync(join(__dirname, 'fixtures', url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
    augInfoFetcher: async () => readFileSync(join(__dirname, 'fixtures/mayhem-augments.lua'), 'utf8'),
    ddragonFetcher: ddFetcher(),
  });
  await engine.refreshData(false);
  mock.state.phase = 'InProgress';
  mock.state.selections = [{ puuid: PUUID, championId: 89 }];
  mock.state.allGameData = intelligenceFixture();
}

describe('observations ennemies : transport HTTPS → moteur → état IPC', () => {
  it('acquiert le roster et les événements sans créer de positions ou de timers', async () => {
    await setup();
    let serialized = '';
    engine.on('state', (state) => { serialized = JSON.stringify(state); });
    await engine.tick();
    const intelligence = JSON.parse(serialized).intelligence;
    expect(intelligence.sourceStatus).toBe('connected');
    expect(intelligence.gameTime).toBe(120);
    expect(intelligence.enemies).toHaveLength(5);
    expect(intelligence.enemies[0]).toMatchObject({ championId: 103, visibility: 'unknown', position: { x: null, y: null, quality: 'unknown' } });
    expect(intelligence.enemies[0].spells[0]).toEqual({ slot: 'D', name: 'Flash' }); // équipé, aucun cooldown suivi
    expect('enemySpells' in engine.state).toBe(false);
    expect(intelligence.events[1]).toMatchObject({ gameTime: 100.125, enemyIds: ['Enemy0#TEST'], visibility: 'unknown' });
    expect(mock.calls.filter((c) => c.path === '/liveclientdata/allgamedata')).toHaveLength(1);
    await engine.tick();
    expect(engine.state.intelligence?.events).toHaveLength(3);
  });

  it('invalide la fraîcheur à la perte Live Client puis efface les données hors partie', async () => {
    await setup();
    await engine.tick();
    mock.state.allGameData = undefined;
    await engine.tick();
    expect(engine.state.intelligence).toMatchObject({ sourceStatus: 'unavailable', gameTime: null });
    expect(engine.state.intelligence?.enemies.every((enemy) => enemy.freshness === 'stale')).toBe(true);
    mock.state.phase = 'Lobby';
    await engine.tick();
    expect(engine.state.intelligence).toBeNull();
    mock.state.phase = 'InProgress';
    mock.state.allGameData = { ...intelligenceFixture(10), events: { Events: [] } };
    await engine.tick();
    expect(engine.state.intelligence?.events).toEqual([]);
    expect(engine.state.intelligence?.gameTime).toBe(10);
  });

  it('continue les observations sans dépendre de la méta du mode ou du build', async () => {
    await setup();
    mock.state.queue = { id: 999999, gameMode: 'UNKNOWN' };
    await engine.tick();
    expect(engine.state.mode).toBeNull();
    expect(engine.state.intelligence?.enemies).toHaveLength(5);
  });

  it('acquiert Live Client même lorsque les identifiants LCU ne sont pas découverts', async () => {
    mock = await startMockLcu();
    mock.state.allGameData = intelligenceFixture();
    const dataDir = mkdtempSync(join(tmpdir(), 'aram-live-only-'));
    engine = new Engine({ dataDir, discover: async () => null, live: { port: mock.port } });
    engine.state.augRound = 3;
    engine.state.headliner = { key: 'test', name: 'Ancien headliner', tips: [], source: 'écran' };
    await engine.tick();
    expect(engine.state.connection).toBe('searching');
    expect(engine.state.phase).toBe('InProgress');
    expect(engine.state.intelligence?.enemies).toHaveLength(5);
    expect(engine.state.headliner).toBeNull();
    expect(engine.state.augRound).toBeNull();
    expect(mock.calls.map((c) => c.path)).toEqual(['/liveclientdata/allgamedata']);
  });

  it('relit la session quand LCU rejoint une acquisition Live Client déjà en partie', async () => {
    let available = false;
    await setup(() => available);
    await engine.tick();
    expect(engine.state.phase).toBe('InProgress');
    expect(engine.state.mode).toBeNull();
    available = true;
    await engine.tick();
    expect(engine.state.mode).toBe('mayhem');
    expect(engine.state.intelligence?.enemies[0].championId).toBe(103);
    expect(engine.state.build?.championId).toBe(89);
  });
});
