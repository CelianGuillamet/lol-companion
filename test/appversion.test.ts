import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canRelaunch, compareVersions, NUDGE_EVERY_MS, parseChangelog, shouldNudge, updateFrom } from '../src/core/appversion';
import { probePlayers } from '../src/core/goldgap';

const LOG = `# Journal des versions

## v1.10 — 3 nov. 2026 — le build suit tes augments
- ## v9.9 — ceci n'est pas un titre

## v1.9 — 2 nov. 2026 — conseil — avec un tiret long

## v1.8 — 28 oct. 2026

## v1.7.1
`;

describe('parseChangelog', () => {
  it('lit la version et le titre après la date', () => {
    expect(parseChangelog(LOG)).toEqual([
      { version: 'v1.10', title: 'le build suit tes augments' },
      { version: 'v1.9', title: 'conseil — avec un tiret long' },
      { version: 'v1.8', title: '' },
      { version: 'v1.7.1', title: '' },
    ]);
  });

  it('lit le vrai CHANGELOG, version la plus récente en tête', () => {
    const entries = parseChangelog(readFileSync(join(__dirname, '..', 'CHANGELOG.md'), 'utf8'));
    expect(entries.length).toBeGreaterThan(70);
    for (let i = 1; i < entries.length; i++) expect(compareVersions(entries[i - 1].version, entries[i].version)).toBeGreaterThanOrEqual(0);
  });

  it('un fichier vide ne donne rien', () => expect(parseChangelog('')).toEqual([]));
});

describe('compareVersions', () => {
  it('compare nombre par nombre, pas comme du texte', () => {
    expect(compareVersions('v1.10', 'v1.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.9', 'v1.10')).toBeLessThan(0);
    expect(compareVersions('v1.7', 'v1.7')).toBe(0);
    expect(compareVersions('v1.7.1', 'v1.7')).toBeGreaterThan(0);
  });
});

describe('updateFrom', () => {
  const entries = parseChangelog(LOG);

  it('à jour : rien', () => expect(updateFrom('v1.10', entries)).toBeNull());
  it('version en cours plus récente que le fichier : rien', () => expect(updateFrom('v2.0', entries)).toBeNull());
  it('version inconnue : rien plutôt qu’un faux rappel', () => expect(updateFrom(null, entries)).toBeNull());

  it('compte les versions de retard, la plus récente en tête', () => {
    const u = updateFrom('v1.8', entries)!;
    expect(u.latest).toBe('v1.10');
    expect(u.count).toBe(2);
    expect(u.news.map((n) => n.version)).toEqual(['v1.10', 'v1.9']);
  });

  it('garde 5 titres, compte tout', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ version: `v1.${77 - i}`, title: `t${i}` }));
    const u = updateFrom('v1.63', many)!;
    expect(u.count).toBe(14);
    expect(u.news).toHaveLength(5);
    expect(u.news[0].version).toBe('v1.77');
  });
});

describe('canRelaunch', () => {
  it('hors partie', () => {
    for (const p of [null, undefined, 'None', 'Lobby', 'Matchmaking']) expect(canRelaunch(p)).toBe(true);
  });

  it('jamais pendant une partie ni avant son enregistrement', () => {
    for (const p of ['ReadyCheck', 'ChampSelect', 'GameStart', 'InProgress', 'Reconnect', 'WaitingForStats', 'PreEndOfGame', 'EndOfGame']) expect(canRelaunch(p)).toBe(false);
  });
});

describe('shouldNudge', () => {
  const update = { latest: 'v1.78', count: 1, news: [] };

  it('au salon, avec une mise à jour', () => {
    expect(shouldNudge('Lobby', update, 0, NUDGE_EVERY_MS)).toBe(true);
    expect(shouldNudge('Matchmaking', update, 0, NUDGE_EVERY_MS)).toBe(true);
  });

  it('pas sans mise à jour, pas en partie, pas deux fois en 6 h', () => {
    expect(shouldNudge('Lobby', null, 0, NUDGE_EVERY_MS)).toBe(false);
    expect(shouldNudge('InProgress', update, 0, NUDGE_EVERY_MS)).toBe(false);
    expect(shouldNudge('Lobby', update, 1000, 1000 + NUDGE_EVERY_MS - 1)).toBe(false);
    expect(shouldNudge('Lobby', update, 1000, 1000 + NUDGE_EVERY_MS)).toBe(true);
  });
});

describe('probePlayers', () => {
  it('garde objets, rôle, runes et CS, sans identifiant', () => {
    const out = probePlayers([{ championName: 'Jinx', team: 'CHAOS', level: 7, position: 'BOTTOM', items: [{ itemID: 3031 }, { itemID: 1055 }], runes: null, scores: { creepScore: 80 }, riotId: 'Secret#EUW', summonerName: 'Secret' } as never]);
    expect(out).toEqual([{ champion: 'Jinx', team: 'CHAOS', level: 7, position: 'BOTTOM', items: [3031, 1055], runes: null, cs: 80 }]);
    expect(JSON.stringify(out)).not.toContain('Secret');
  });
});
