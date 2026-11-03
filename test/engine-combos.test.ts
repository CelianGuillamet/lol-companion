// Mayhem en partie : l'avis de la communauté arrive sur les cartes lues, sans toucher au classement.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { Combos, snapshotRows } from '../src/core/combos';
import { PUUID, startMockLcu } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
const tier = JSON.parse(readFileSync(join(fixtures, 'tier-list.json'), 'utf8')) as { augs: Record<string, { name_en: string }> };
const idOf = (name: string) => Number(Object.entries(tier.augs).find(([, a]) => a.name_en === name)![0]);
const REVOLUTION = idOf('Ultimate Revolution');
const GOLIATH = idOf('Goliath');
const SCIENTIST = idOf('Mad Scientist');
const FIRE = idOf('Firebrand');

let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
const offers = () => (engine as unknown as { offersThisGame: Map<string, unknown> }).offersThisGame;

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-combos-'));
  const combos = new Combos(join(dataDir, 'combos'), async () => {
    throw new Error('hors ligne');
  });
  combos.rows.push(...snapshotRows(['Malphite goliath|mad_scientist -', 'Malphite firebrand trap']));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => {
      throw new Error('hors ligne');
    }),
    combos,
  });
  (engine as unknown as { opggData: object }).opggData = { analysis: async () => null, mainLane: async () => null, guessLanes: async () => new Map(), laneMeta: async () => new Map() };
  await engine.refreshData(false);
  mock.state.phase = 'InProgress';
  mock.state.queue = { id: 2400, gameMode: 'KIWI' };
  mock.state.selections = [{ puuid: PUUID, championId: 54 }];
  (mock.state as unknown as { live: object }).live = {
    me: { currentGold: 1000, level: 3, riotId: 'Celian#EUW' },
    players: [{ riotId: 'Celian#EUW', rawChampionName: 'game_character_displayname_Malphite', position: '', team: 'ORDER', items: [] }],
  };
  await engine.tick();
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

const read = (ids: number[]) => engine.setOffered({ ids, names: ids.map((id) => tier.augs[id].name_en), rarity: 'kGold', unsure: null, misses: [] }, engine.readContext());

describe('combos en partie', () => {
  it('dit la source dans Réglages, instantané si le site ne répond pas', () => {
    expect(engine.state.data.combos).toContain('instantané');
    expect(engine.state.data.combos).toContain('459 combos');
  });

  it('le panneau porte les avis solo du pool', () => {
    const panel = engine.state.augments!;
    expect(Object.values(panel.all!).flat().some((a) => a.id === REVOLUTION)).toBe(true);
    expect(panel.combos?.[REVOLUTION]).toMatchObject({ kind: 'good' });
    expect(panel.combos?.[GOLIATH]).toBeUndefined();
  });

  it('marque les cartes lues sans changer le conseil, et le note dans usage.json', () => {
    read([REVOLUTION, FIRE, GOLIATH]);
    const o = engine.state.offered!;
    expect(o.combos?.[REVOLUTION]).toMatchObject({ kind: 'good', good: true });
    expect(o.combos?.[FIRE]).toMatchObject({ kind: 'trap', good: false });
    expect(o.combos?.[GOLIATH]).toBeUndefined();
    const seen = engine.usage.events.filter((e) => e.type === 'cards_seen').at(-1) as unknown as { combos: Record<string, string>; best: number };
    expect(seen.combos).toEqual({ [REVOLUTION]: 'good', [FIRE]: 'trap' });
    expect(seen.best).toBe(engine.bestOffered([REVOLUTION, FIRE, GOLIATH]));
  });

  it('plan : la carte conseillée au choix d\'avant compte, pas celle du tirage en cours', () => {
    engine.setOffered(null);
    (engine as unknown as { draw: null }).draw = null;
    offers().clear();
    offers().set('1:augment:0', { round: 1, ids: [GOLIATH], best: GOLIATH, cards: [], choice: 0, kind: 'augment', draw: null });
    engine.state.augRound = 2;
    read([SCIENTIST, REVOLUTION, FIRE]);
    expect(engine.state.offered!.combos?.[SCIENTIST]).toMatchObject({ kind: 'plan', with: ['Goliath'] });
    offers().clear();
    offers().set('2:augment:0', { round: 2, ids: [GOLIATH], best: GOLIATH, cards: [], choice: 0, kind: 'augment', draw: null });
    engine.setOffered(null);
    read([SCIENTIST, REVOLUTION, FIRE]);
    expect(engine.state.offered!.combos?.[SCIENTIST]).toBeUndefined();
  });
});
