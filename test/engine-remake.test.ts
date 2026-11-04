// Fin de partie : une partie annulée n'entre dans aucune mesure, le rôle donné remplit une timeline vide.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { game, PUUID, startMockLcu } from './mock-lcu';

const fixtures = join(__dirname, 'fixtures');
let mock: Awaited<ReturnType<typeof startMockLcu>>;
let engine: Engine;
type Inside = {
  offersThisGame: Map<string, unknown>;
  lane: string | null;
  recordFinishedGame(): Promise<boolean>;
};
const inside = () => engine as unknown as Inside;
const offer = { round: 1, ids: [1058, 3078, 3170], best: 1058, choice: 0, cards: [] };

beforeAll(async () => {
  mock = await startMockLcu();
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-remake-'));
  engine = new Engine({
    dataDir,
    discover: async () => ({ port: mock.port, token: mock.token }),
    live: { port: mock.port },
    arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(fixtures, url.replace('https://arammeta.com/api/', '')), 'utf8')),
    balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
  });
  await engine.refreshData(false);
  mock.state.phase = 'Lobby';
  await engine.tick();
});

afterAll(async () => {
  engine?.stop();
  await mock?.close();
});

async function finish(id: number, raw: ReturnType<typeof game>): Promise<void> {
  mock.state.eogGameId = id;
  mock.state.games[id] = raw;
  expect(await inside().recordFinishedGame()).toBe(true);
}

describe('fin de partie annulée', () => {
  it('enregistre la partie, sans carte notée ni chiffre perso', async () => {
    inside().offersThisGame.set('1:kGold:0', offer);
    const before = engine.state.stats.total;
    await finish(201, { ...game(201, 2400, 54, false, [1058]), gameDuration: 105 });
    expect(engine.rawHistory().some((g) => g.gameId === 201)).toBe(true);
    expect(engine.usage.events.filter((e) => e.type === 'card_picked')).toHaveLength(0);
    expect(engine.usage.events.some((e) => e.type === 'game_end' && e.gameId === 201)).toBe(true); // annulée ou non : c'est elle qui éprouve le seuil
    expect(inside().offersThisGame.size).toBe(0);
    expect(engine.state.stats.total).toBe(before);
    expect(engine.state.stats.recorded).toBe(1);
    expect(engine.state.log[0]?.text ?? '').toContain('annulée');
  });

  it('une vraie partie reste notée', async () => {
    inside().offersThisGame.set('1:kGold:0', offer);
    await finish(202, game(202, 2400, 54, true, [1058]));
    expect(engine.usage.events.filter((e) => e.type === 'card_picked')).toHaveLength(1);
    expect(engine.state.stats.recorded).toBe(2);
  });
});

describe('rôle en Faille', () => {
  it('le rôle donné remplit une timeline vide', async () => {
    inside().lane = 'mid';
    await finish(203, game(203, 480, 54, true));
    expect(engine.rawHistory().find((g) => g.gameId === 203)?.position).toBe('mid');
  });

  it('la timeline garde la main', async () => {
    inside().lane = 'mid';
    const raw = game(204, 480, 54, true);
    Object.assign(raw.participants[0], { timeline: { lane: 'TOP', role: 'SOLO' } });
    await finish(204, raw);
    expect(engine.rawHistory().find((g) => g.gameId === 204)?.position).toBe('top');
  });

  it('jamais en Mayhem', async () => {
    inside().lane = 'mid';
    await finish(205, game(205, 2400, 54, true));
    expect(engine.rawHistory().find((g) => g.gameId === 205)?.position).toBeUndefined();
  });
});
