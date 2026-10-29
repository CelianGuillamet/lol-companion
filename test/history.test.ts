import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { History, parseGame } from '../src/core/history';
import { game } from './mock-lcu';
import type { LcuClient } from '../src/core/lcu';

const PUUID = 'puuid-celian';

describe('historique', () => {
  it('ne garde que les champs de base quand la liste du client est partielle', () => {
    const raw = game(1, 2400, 157, true, [1, 2]);
    raw.participants = [raw.participants[0]];
    raw.participants[0].stats = { win: true, kills: 1, deaths: 2, assists: 3 } as never;
    const g = parseGame(raw, PUUID)!;
    expect(g.augments).toEqual([]);
    expect(g.items).toBeUndefined();
  });

  it('complète les anciennes parties depuis le client, une seule fois', async () => {
    const h = new History(join(mkdtempSync(join(tmpdir(), 'hist-')), 'h.json'));
    await h.add({ gameId: 5, queueId: 2400, mode: 'mayhem', createdAt: 2, durationSec: 900, championId: 157, win: true, kills: 1, deaths: 1, assists: 1, augments: [] });
    await h.add({ gameId: 6, queueId: 450, mode: 'aram', createdAt: 1, durationSec: 900, championId: 89, win: false, kills: 1, deaths: 1, assists: 1, augments: [] });
    let calls = 0;
    const lcu = { get: async (path: string) => (calls++, path.endsWith('/5') ? game(5, 2400, 157, true, [7]) : null) } as unknown as LcuClient;
    expect(await h.enrich(lcu, PUUID)).toBe(1);
    expect(h.games.find((g) => g.gameId === 5)?.items).toEqual([3031, 3006]);
    expect(h.games.find((g) => g.gameId === 6)?.noDetail).toBe(true);
    calls = 0;
    expect(await h.enrich(lcu, PUUID)).toBe(0);
    expect(calls).toBe(0);
  });

  it('stats par adversaire, allié et duo, triées sur un winrate lissé', async () => {
    const h = new History(join(mkdtempSync(join(tmpdir(), 'hist-')), 'h.json'));
    let id = 100;
    const add = (win: boolean, enemies: number[], allies: number[], allyNames: string[]) =>
      h.add({ gameId: id++, queueId: 2400, mode: 'mayhem', createdAt: id, durationSec: 900, championId: 157, win, kills: 1, deaths: 1, assists: 1, augments: [], enemies, allies, allyNames });
    for (let i = 0; i < 4; i++) await add(false, [22], [89], ['Pote#EUW']); // 0/4 contre Ashe
    for (let i = 0; i < 14; i++) await add(i < 4, [25], [12], ['Autre#EUW']); // 4/14 contre Morgana
    for (let i = 0; i < 6; i++) await add(true, [103], [89], ['Pote#EUW']);
    const st = h.stats((c) => `#${c}`, (a) => `#${a}`);
    expect(st.vsEnemies[0].championId).toBe(22);
    expect(st.vsEnemies.find((m) => m.championId === 25)).toMatchObject({ games: 14, wins: 4 });
    expect(st.withAllies[0].championId).toBe(89); // 6V 4D
    expect(st.duos.find((d) => d.name === 'Pote#EUW')).toMatchObject({ games: 10, wins: 6, champions: [89] });
  });
});

import { GameData } from '../src/core/gamedata';
describe('augments retirés du jeu', () => {
  it('ne filtre que si le client a une liste complète', () => {
    const g = new GameData();
    expect(g.augmentExists(1)).toBe(true);
    for (let i = 0; i < 150; i++) g.augments.set(1000 + i, { id: 1000 + i });
    expect(g.augmentExists(1001)).toBe(true);
    expect(g.augmentExists(1)).toBe(false);
  });
});

import { isRawKey, prettyKey } from '../src/core/gamedata';
describe('noms d’augments non traduits', () => {
  it('reconnaît les clés internes et les rend lisibles', () => {
    expect(isRawKey('GoH_PentakillAug_Generic_BlankName')).toBe(true);
    expect(isRawKey('Scopier Weapons')).toBe(false);
    expect(prettyKey('GoH_PentakillAug_Generic_BlankName')).toBe('Pentakill (headliner)');
    const g = new GameData();
    g.augments.set(9, { id: 9, nameTRA: 'GoH_PentakillAug_Generic_BlankName' });
    expect(g.augmentName(9)).toBe('Pentakill (headliner)');
    expect(g.augmentName(9, 'Power Chord')).toBe('Power Chord');
  });
});

import { laneOfTimeline } from '../src/core/history';
describe('rôle Faille dans l’historique', () => {
  it('lit la timeline du client sans inventer', () => {
    expect(laneOfTimeline({ lane: 'MIDDLE', role: 'SOLO' })).toBe('mid');
    expect(laneOfTimeline({ lane: 'BOTTOM', role: 'DUO_SUPPORT' })).toBe('support');
    expect(laneOfTimeline({ lane: 'BOTTOM', role: 'DUO_CARRY' })).toBe('adc');
    expect(laneOfTimeline({ lane: 'BOTTOM', role: 'DUO' })).toBeNull();
    expect(laneOfTimeline(undefined)).toBeNull();
  });
});
