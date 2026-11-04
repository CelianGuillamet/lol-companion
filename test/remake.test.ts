// Partie annulée : gardée dans la liste, jamais dans un chiffre. Rôle Faille des parties courtes.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { endFlags, History, laneOfGame, parseGame } from '../src/core/history';
import { isRemake, played, REMAKE_MAX_SEC } from '../src/core/remake';
import type { HistoryGame } from '../src/core/types';
import { game, PUUID } from './mock-lcu';

const base = (over: Partial<HistoryGame>): HistoryGame => ({
  gameId: 1, queueId: 2400, mode: 'mayhem', createdAt: 1, durationSec: 900, championId: 157, win: true, kills: 1, deaths: 1, assists: 1, augments: [], ...over,
});
const newHistory = () => new History(join(mkdtempSync(join(tmpdir(), 'hist-')), 'h.json'));

describe('partie annulée', () => {
  it('se lit à la durée, sur les durées réelles', () => {
    for (const s of [88, 101, 105, 131]) expect(isRemake({ durationSec: s })).toBe(true);
    for (const s of [REMAKE_MAX_SEC, 498, 1515]) expect(isRemake({ durationSec: s })).toBe(false);
  });

  it('durée inconnue : la partie compte', () => {
    expect(isRemake({ durationSec: 0 })).toBe(false);
    expect(played([{ durationSec: 0 }, { durationSec: 90 }])).toEqual([{ durationSec: 0 }]);
  });

  it('reste enregistrée mais ne compte dans aucun chiffre perso', async () => {
    const h = newHistory();
    await h.add(base({ gameId: 1, durationSec: 101, win: true, augments: [7], allies: [22], enemies: [33], allyNames: ['A#1'] }));
    await h.add(base({ gameId: 2, durationSec: 900, win: false, augments: [7] }));
    await h.add(base({ gameId: 3, durationSec: 88, mode: 'sr', queueId: 480, championId: 876, win: true }));
    expect(h.games).toHaveLength(3);
    expect(h.personal(null).get(157)).toEqual({ games: 1, wins: 0 });
    expect(h.personal('sr').get(876)).toBeUndefined();
    expect(h.augmentRecord().get(7)).toEqual({ games: 1, wins: 0 });
    const st = h.stats(String, String);
    expect(st.total).toBe(1);
    expect(st.recorded).toBe(3);
    expect(st.byMode.mayhem).toEqual({ games: 1, wins: 0 });
    expect(st.byMode.sr).toEqual({ games: 0, wins: 0 });
    expect(st.champions[0]).toMatchObject({ games: 1, wins: 0 });
  });

  it('une partie de Faille fait bouger `recorded`, pas `total`', async () => {
    const h = newHistory();
    await h.add(base({ gameId: 1 }));
    const before = h.stats(String, String);
    await h.add(base({ gameId: 2, mode: 'sr', queueId: 480 }));
    const after = h.stats(String, String);
    expect(after.total).toBe(before.total);
    expect(after.recorded).toBe(before.recorded + 1);
  });
});

describe('rôle des parties courtes', () => {
  it('Châtiment = jungle quand la timeline ne dit rien', () => {
    expect(laneOfGame({ timeline: { lane: 'NONE', role: 'NONE' }, spells: [11, 4] })).toBe('jungle');
    expect(laneOfGame({ spells: [4, 14] })).toBeNull();
  });

  it('la timeline passe avant les sorts', () => {
    expect(laneOfGame({ timeline: { lane: 'MIDDLE', role: 'SOLO' }, spells: [11, 4] })).toBe('mid');
  });

  it('parseGame remplit le rôle en Faille, jamais en Mayhem', () => {
    const sr = game(9, 480, 876, true);
    Object.assign(sr.participants[0], { spell1Id: 11, spell2Id: 4 });
    expect(parseGame(sr, PUUID)?.position).toBe('jungle');
    const may = game(10, 2400, 876, true);
    Object.assign(may.participants[0], { spell1Id: 11 });
    expect(parseGame(may, PUUID)?.position).toBeUndefined();
  });

  it('les anciennes parties le retrouvent au chargement', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'hist-')), 'h.json');
    writeFileSync(file, JSON.stringify({ version: 1, games: [base({ gameId: 1, mode: 'sr', queueId: 480, spells: [11, 4] }), base({ gameId: 2, mode: 'sr', queueId: 480, spells: [4, 14] }), base({ gameId: 3, mode: 'sr', queueId: 480, position: 'mid', spells: [11, 4] })] }));
    const h = new History(file);
    await h.load();
    expect(h.games.map((g) => g.position)).toEqual(['jungle', undefined, 'mid']);
  });
});

describe('fin de partie selon le client', () => {
  const raw = (stats: Record<string, number | boolean>) => ({ ...game(9, 480, 876, true), participantIdentities: [{ participantId: 1, player: { puuid: PUUID } }], participants: [{ participantId: 1, teamId: 100, championId: 876, stats }] });

  it('donne les champs qui existent, rien pour ceux qui manquent', () => {
    const f = endFlags(raw({ gameEndedInEarlySurrender: true, teamEarlySurrendered: false }), PUUID);
    expect(f).toEqual({ early: true, surrender: undefined, teamEarly: false });
    expect(JSON.parse(JSON.stringify(endFlags(raw({ kills: 1 }), PUUID)))).toEqual({});
  });

  it('joueur introuvable : rien', () => {
    expect(endFlags(raw({}), 'autre')).toBeNull();
  });
});

describe('tes parties par rôle', () => {
  it('compte le bon champion dans le bon rôle, sans les parties annulées', async () => {
    const h = newHistory();
    await h.add(base({ gameId: 1, mode: 'sr', queueId: 480, championId: 876, position: 'jungle', win: true }));
    await h.add(base({ gameId: 2, mode: 'sr', queueId: 480, championId: 876, position: 'jungle', win: false }));
    await h.add(base({ gameId: 3, mode: 'sr', queueId: 480, championId: 876, position: 'top', win: true }));
    await h.add(base({ gameId: 4, mode: 'sr', queueId: 480, championId: 876, position: 'jungle', win: true, durationSec: 88 }));
    await h.add(base({ gameId: 5, championId: 876, win: true }));
    expect(h.roleRecord(876, 'jungle')).toEqual({ games: 2, wins: 1 });
  });
});
