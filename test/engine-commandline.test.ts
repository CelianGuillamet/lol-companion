// Mayhem en partie : bannière ratée, Command Line reconnu à la carte qui monte d'un cran.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import type { AugmentRow, Rarity } from '../src/core/types';
import { PUUID, startMockLcu } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
type Inside = { draw: { rolled: Set<number>; upgraded?: number[] | null } | null };
const inside = () => engine as unknown as Inside;

const rows = (r: Rarity): AugmentRow[] => [...(engine.state.augments?.all?.[r] ?? [])];
const read = (cards: AugmentRow[], rarity: Rarity) =>
  engine.setOffered({ ids: cards.map((c) => c.id), names: cards.map((c) => c.name), rarity, unsure: null, misses: [] }, engine.readContext());
const jumps = () => engine.usage.events.filter((e) => e.type === 'rarity_jump');

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-cl-'));
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
  await engine.tick();
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

beforeEach(() => {
  engine.state.headliner = null;
  engine.setOffered(null);
  inside().draw = null;
});

describe('Command Line sans bannière', () => {
  it('voit la relance monter, et la compte pour les tirages suivants', () => {
    const silver = rows('kSilver');
    const gold = rows('kGold');
    read(silver.slice(0, 3), 'kSilver');
    expect(engine.state.headliner).toBeNull();
    const before = jumps().length;
    read([gold[0], silver[1], silver[2]], 'kSilver');
    expect(engine.state.headliner).toMatchObject({ key: 'commandline', source: 'cartes' });
    expect(engine.usage.events.filter((e) => e.type === 'headliner_seen').at(-1)).toMatchObject({ key: 'commandline', source: 'cartes', text: gold[0].name });
    expect(jumps().slice(before)).toMatchObject([{ id: gold[0].id, roll: 1, known: null, round: engine.state.augRound }]);
    // la revue juge cette relance avec le cran du dessus, même si le 1er passage l'ignorait
    expect(inside().draw!.upgraded?.length).toBeGreaterThan(0);
    // la carte relancée n'est plus à relancer, et plus de « 1re relance monte » dans ce tirage
    expect(engine.state.offered?.reroll?.upgrade).toBeFalsy();
    expect(engine.state.offered?.reroll?.targets ?? []).not.toContain(gold[0].id);

    // même lecture relue : rien de plus
    read([silver[2], gold[0], silver[1]], 'kSilver');
    expect(jumps().length).toBe(before + 1);

    // tirage suivant, tout neuf : le conseil vise le cran du dessus
    read(silver.slice(-3), 'kSilver');
    expect(engine.state.offered?.reroll).toMatchObject({ upgrade: true });
  });

  it('montée avant la 1re lecture : le headliner connu ne promet plus une relance déjà faite', () => {
    engine.state.headliner = { key: 'commandline', name: 'Command Line', source: 'écran', tips: [] };
    const silver = rows('kSilver');
    const gold = rows('kGold');
    read(silver.slice(-3), 'kSilver');
    expect(engine.state.offered?.reroll).toMatchObject({ upgrade: true });
    engine.setOffered(null);
    inside().draw = null;
    read([silver[0], gold[1], silver[1]], 'kSilver');
    expect(engine.state.offered?.reroll?.upgrade).toBeFalsy();
    expect(inside().draw!.rolled.has(gold[1].id)).toBe(true);
    expect(jumps().at(-1)).toMatchObject({ roll: 0, known: 'commandline' });
  });

  it('ne remplace pas un headliner lu, et le note pour mesurer', () => {
    engine.state.headliner = { key: 'disco', name: 'Disco', source: 'écran', tips: [] };
    const silver = rows('kSilver');
    const gold = rows('kGold');
    read([silver[0], silver[1], gold[0]], 'kSilver');
    expect(engine.state.headliner).toMatchObject({ key: 'disco' });
    expect(jumps().at(-1)).toMatchObject({ id: gold[0].id, known: 'disco' });
    expect(inside().draw!.rolled.has(gold[0].id)).toBe(false);
  });

  it('une relance restée dans sa rareté interdit de conclure pour le reste de la partie (Xin Zhao, 3 nov.)', () => {
    const silver = rows('kSilver');
    const gold = rows('kGold');
    read(silver.slice(0, 3), 'kSilver');
    read([silver[3], silver[1], silver[2]], 'kSilver');
    expect(engine.state.headliner).toBeNull();
    read(silver.slice(4, 7), 'kSilver'); // tirage suivant
    read([silver[4], silver[5], gold[0]], 'kSilver');
    expect(engine.state.headliner).toBeNull();
    expect(jumps().at(-1)).toMatchObject({ id: gold[0].id, known: null, stayed: true });
  });

  it('un tirage de même rareté ne dit rien, ni un cran vers le bas', () => {
    const silver = rows('kSilver');
    const gold = rows('kGold');
    const before = jumps().length;
    read(gold.slice(0, 3), 'kGold');
    read([gold[0], gold[1], silver[0]], 'kGold');
    expect(engine.state.headliner).toBeNull();
    expect(jumps().length).toBe(before);
  });
});

describe('historique', () => {
  it('range en Command Line probable une partie aux cartes qui montent', () => {
    const silver = rows('kSilver');
    const gold = rows('kGold');
    const card = (a: AugmentRow) => ({ id: a.id, name: a.name, value: 0.5, games: 100, estimated: false });
    const choice = (round: number, cards: AugmentRow[]) => ({ round, cards: cards.map(card), picked: cards[0].id, best: cards[0].id, lost: 0, verdict: 'best' });
    const g = { gameId: 5, championId: 54, mode: 'mayhem', createdAt: Date.UTC(2026, 9, 25), win: true, augments: [1, 2, 3, 4], items: [], review: { choices: [choice(1, [gold[0], silver[0], silver[1]]), choice(2, [silver[2], silver[3], gold[1]])] } };
    (engine as unknown as { history: { games: unknown[] } }).history.games.push(g);
    expect(engine.getHistory().find((x) => x.gameId === 5)?.headliner).toBe('Command Line (probable)');
  });
});
