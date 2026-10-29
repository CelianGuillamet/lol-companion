import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compositionScore, needsOf, pairLift, scoreCandidates, teamComposition } from '../src/core/advisor';
import { parseLockfile, parseProcessArgs } from '../src/core/lcu';
import { modeOf } from '../src/core/modes';
import type { TierList } from '../src/core/arammeta';

const meta = JSON.parse(readFileSync(join(__dirname, 'fixtures/tier-list.json'), 'utf8')) as TierList;
const names = (id: number) => meta.champs[String(id)]?.name_en ?? `#${id}`;

describe('identifiants LCU', () => {
  it('lit les arguments du process LeagueClientUx', () => {
    const ps = '/Applications/League of Legends.app/Contents/LoL/LeagueClient.app/Contents/Frameworks/LeagueClientUx Helper --type=renderer\n' +
      '/Applications/League of Legends.app/Contents/LoL/LeagueClient.app/Contents/MacOS/LeagueClientUx --riotclient-auth-token=x --app-port=54321 --remoting-auth-token=AbC-12_3 --other';
    expect(parseProcessArgs(ps)).toEqual({ port: 54321, token: 'AbC-12_3' });
  });
  it('lit le lockfile', () => {
    expect(parseLockfile('LeagueClient:1234:61234:pa55word:https')).toEqual({ port: 61234, token: 'pa55word' });
    expect(parseLockfile('')).toBeNull();
  });
});

describe('modes', () => {
  it('reconnaît ARAM et Mayhem', () => {
    expect(modeOf(450)).toBe('aram');
    expect(modeOf(2400)).toBe('mayhem');
    expect(modeOf(null, 'KIWI')).toBe('mayhem');
    expect(modeOf(420)).toBe('sr');
    expect(modeOf(480)).toBe('sr'); // Swiftplay
    expect(modeOf(1700)).toBeNull(); // Arena : pas en 5v5
  });
});

describe('composition (portage arammeta)', () => {
  it('détecte une équipe sans frontline et à dominante physique', () => {
    const comp = teamComposition([157, 22, 222], meta); // Yasuo, Ashe, Jinx
    expect(comp.adShare).toBeGreaterThan(0.65);
    expect(comp.frontCount).toBe(0);
  });
  it('un tank améliore la compo d’une équipe sans frontline', () => {
    const base = compositionScore([157, 22, 222, 103], meta);
    const withLeona = compositionScore([157, 22, 222, 103, 89], meta);
    const withJinxLike = compositionScore([157, 22, 222, 103, 32], meta);
    expect(withLeona).toBeGreaterThan(base);
    expect(withLeona).toBeGreaterThanOrEqual(withJinxLike);
    expect(Math.abs(withLeona)).toBeLessThanOrEqual(0.05); // borné comme arammeta
  });
  it('needsOf liste les manques en français', () => {
    const n = needsOf([157, 22, 222], meta);
    expect(n.lacks).toContain('frontline');
    expect(n.frontliners).toBe(0);
  });
  it('pairLift est symétrique', () => {
    expect(pairLift(meta, 157, 89)).toBe(pairLift(meta, 89, 157));
  });
});

describe('classement des candidats', () => {
  const allies = [157, 22, 222, 103];
  it('classe, explique et ne duplique pas', () => {
    const out = scoreCandidates(
      {
        mode: 'mayhem',
        allies,
        candidates: [
          { championId: 222, source: 'current', actionable: false },
          { championId: 89, source: 'card', actionable: true },
          { championId: 89, source: 'bench', actionable: true },
          { championId: 54, source: 'card', actionable: true },
        ],
        personal: new Map(),
        names,
      },
      meta,
    );
    expect(out.map((c) => c.championId).sort((a, b) => a - b)).toEqual([54, 89, 222]);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    const leona = out.find((c) => c.championId === 89)!;
    expect(leona.reasons.some((r) => r.label.startsWith('Winrate Mayhem'))).toBe(true);
    expect(leona.reasons.some((r) => r.label.startsWith('Compo'))).toBe(true);
    // Le total est la somme des raisons (arrondies)
    const sum = leona.reasons.reduce((s, r) => s + r.points, 0);
    expect(Math.abs(sum - leona.score)).toBeLessThan(0.2);
  });
  it('prend en compte tes stats perso (à partir de 3 parties)', () => {
    const run = (personal: Map<number, { games: number; wins: number }>) =>
      scoreCandidates({ mode: 'mayhem', allies, candidates: [{ championId: 54, source: 'card', actionable: true }], personal, names }, meta)[0];
    const none = run(new Map());
    const good = run(new Map([[54, { games: 10, wins: 9 }]]));
    const two = run(new Map([[54, { games: 2, wins: 2 }]]));
    expect(good.score).toBeGreaterThan(none.score);
    expect(two.score).toBe(none.score);
    expect(good.reasons.at(-1)!.label).toBe('Toi : 9V / 1D');
  });
  it('pondère moins les winrates Mayhem en ARAM classique', () => {
    const c = [{ championId: 157, source: 'card' as const, actionable: true }];
    const may = scoreCandidates({ mode: 'mayhem', allies: [], candidates: c, personal: new Map(), names }, meta)[0];
    const aram = scoreCandidates({ mode: 'aram', allies: [], candidates: c, personal: new Map(), names }, meta)[0];
    expect(Math.abs(aram.score)).toBeLessThan(Math.abs(may.score));
  });
  it('fonctionne sans données globales', () => {
    const out = scoreCandidates({ mode: 'aram', allies, candidates: [{ championId: 89, source: 'bench', actionable: true }], personal: new Map(), names }, null);
    expect(out[0].score).toBe(0);
    expect(out[0].reasons[0].label).toMatch(/Pas de données/);
  });
});
