// Collection : le banc ne classe que ce que tu peux prendre, et Préparer dit quoi débloquer.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { startMockLcu } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
let probeDir: string;

// 157 (Yasuo) et le 22 à toi, 89 (Leona) dans la rotation, 54 (Malphite) absent. Remplissage : ids hors tier list.
const entry = (id: number, owned = true, freeToPlay = false) => ({ id, freeToPlay, ownership: { owned } });
const filler = Array.from({ length: 30 }, (_, i) => entry(5000 + i));
const collection = (rows: ReturnType<typeof entry>[]) => {
  (mock.state as unknown as { collection: unknown }).collection = rows;
  (engine as unknown as { collectionCache: null }).collectionCache = null;
};
const select = async (bench: number[], me: number) => {
  mock.state.phase = 'ChampSelect';
  mock.state.queue = { id: 2400, gameMode: 'KIWI' };
  mock.state.subset = null;
  mock.state.session = {
    localPlayerCellId: 0,
    myTeam: [{ cellId: 0, championId: me }, { cellId: 1, championId: 222 }],
    benchEnabled: true,
    benchChampions: bench.map((championId) => ({ championId })),
    actions: [],
    timer: { phase: 'FINALIZATION' },
  };
  await engine.tick();
  return engine.state.champSelect!;
};
const has = (ids: { championId: number }[], id: number) => ids.some((c) => c.championId === id);

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-pool-'));
  probeDir = mkdtempSync(join(tmpdir(), 'aram-pool-probe-'));
  engine = new Engine({
    dataDir,
    probeDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
  });
  await engine.refreshData(false);
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

describe('collection de champions', () => {
  it('sans collection lisible, rien n’est filtré ni conseillé', async () => {
    const cs = await select([54], 157);
    expect(has(cs.candidates, 54)).toBe(true);
    expect(cs.notOwned).toBeUndefined();
    expect(await engine.poolReport()).toBeNull();
  });

  it('retire du banc ce que tu ne peux pas prendre et garde la rotation', async () => {
    collection([...filler, entry(157), entry(22), entry(89, false, true)]);
    const cs = await select([54, 89, 22], 157);
    expect(has(cs.candidates, 54)).toBe(false);
    expect(has(cs.candidates, 89)).toBe(true);
    expect(has(cs.candidates, 22)).toBe(true);
    expect(cs.notOwned).toHaveLength(1);
  });

  it('un champion proposé hors de la liste compte comme à toi et se note', async () => {
    collection([...filler, entry(22)]);
    const cs = await select([157], 54);
    expect(has(cs.candidates, 54)).toBe(true);
    expect(has(cs.candidates, 157)).toBe(false);
    const again = await select([54], 22); // Malphite revient au banc : déjà proposé, donc tirable
    expect(has(again.candidates, 54)).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    const ev = JSON.parse(readFileSync(join(probeDir, 'usage.json'), 'utf8')).events;
    expect(ev.filter((e: { type: string }) => e.type === 'pool_outside').map((e: { championId: number }) => e.championId)).toContain(54);
    expect(ev.filter((e: { type: string }) => e.type === 'pool_seen')).toHaveLength(1);
  });

  it('Préparer classe ce qui manque, sans ce qui est à toi', async () => {
    collection([...filler, entry(157), entry(22), entry(89, false, true)]);
    const r = (await engine.poolReport())!;
    expect(r.owned).toBe(32);
    expect(r.free).toBe(1);
    expect(r.unlocks.length).toBeGreaterThan(0);
    expect(r.unlocks.some((u) => u.id === 157 || u.id === 22)).toBe(false);
    expect(r.unlocks.find((u) => u.id === 89)?.free ?? true).toBe(true);
  });

  it('la Faille n’est pas touchée', async () => {
    collection([...filler, entry(22)]);
    mock.state.queue = { id: 420, gameMode: 'CLASSIC' };
    mock.state.phase = 'ChampSelect';
    await engine.tick();
    expect(engine.state.champSelect?.notOwned).toBeUndefined();
  });
});
