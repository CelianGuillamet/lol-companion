import { describe, it, expect } from 'vitest';
import { buildRole, enemiesFromSession, enemyThreats, fedWeight } from '../src/core/counters';

const comp = (o: Partial<Record<string, number>>) => ({ phys: 500, magic: 500, true: 0, front: 1, damage: 1, engage: 1, wave: 1, poke: 1, sustain: 1, cc: 1, ...o });

describe('items contre l’équipe adverse', () => {
  it('détecte le rôle de build', () => {
    expect(buildRole(comp({ front: 2.9, damage: 0.3 }))).toBe('tank');
    expect(buildRole(comp({ phys: 1800, magic: 100 }))).toBe('ad');
    expect(buildRole(comp({ phys: 100, magic: 1400 }))).toBe('ap');
    expect(buildRole(null)).toBe('ad');
  });

  it('anti-soins seulement face à plusieurs gros soigneurs', () => {
    const team = [comp({ sustain: 3 }), comp({ sustain: 2.9 }), comp({}), comp({}), comp({})].map((c, i) => ({ id: i + 1, comp: c }));
    const t = enemyThreats(team, 'ap');
    expect(t.find((x) => x.key === 'antiheal')?.champions).toEqual([1, 2]);
    expect(t.find((x) => x.key === 'antiheal')?.items[0]).toBe(3916); // Oblivion Orb pour un AP
    const calm = [comp({ sustain: 3 }), comp({}), comp({}), comp({}), comp({})].map((c, i) => ({ id: i + 1, comp: c }));
    expect(enemyThreats(calm, 'ap').some((x) => x.key === 'antiheal')).toBe(false);
  });

  it('armure contre une équipe physique, rien pour un tank en pénétration', () => {
    const team = [1, 2, 3, 4, 5].map((id) => ({ id, comp: comp({ phys: 1500, magic: 100, front: 2.5 }) }));
    const t = enemyThreats(team, 'tank');
    expect(t.map((x) => x.key)).toContain('armor');
    expect(t.map((x) => x.key)).not.toContain('pen');
  });

  it('ignore les champions inconnus et une session sans toi', () => {
    expect(enemyThreats([{ id: 1, comp: null }], 'ad')).toEqual([]);
    expect(enemiesFromSession({ teamOne: [{ puuid: 'x', championId: 1 }], teamTwo: [{ puuid: 'y', championId: 2 }] }, 'me')).toEqual([]);
    expect(enemiesFromSession({ teamOne: [{ puuid: 'me', championId: 1 }], teamTwo: [{ puuid: 'y', championId: 2 }] }, 'me')).toEqual([2]);
  });
});

describe('ennemis en avance', () => {
  it('un ennemi AP très en avance fait basculer vers la résistance magique', () => {
    const ad = () => comp({ phys: 1400, magic: 100 });
    const ap = () => comp({ phys: 100, magic: 1400 });
    const team = [ad(), ad(), ap(), ap(), ap()].map((c, i) => ({ id: i + 1, comp: c }));
    expect(enemyThreats(team, 'ad').map((t) => t.key)).not.toContain('mr'); // 59 % magique : sous le seuil
    const fed = team.map((e) => (e.id === 3 ? { ...e, weight: fedWeight(11, 1) } : e));
    expect(enemyThreats(fed, 'ad').map((t) => t.key)).toContain('mr');
    expect(fedWeight(10, 2)).toBeCloseTo(2.2);
    expect(fedWeight(1, 5)).toBe(1);
    expect(fedWeight(30, 0)).toBe(2.5);
  });
});

import { readTeams } from '../src/core/counters';
describe('readTeams', () => {
  const comp = (o: Partial<{ phys: number; magic: number; front: number; sustain: number; cc: number }>) => ({ phys: 1, magic: 1, true: 0, front: 1, sustain: 1, cc: 1, damage: 1, ...o }) as never;
  const cat = (id: number) => (id === 1 ? ['Armor'] : id === 2 ? ['SpellBlock'] : []);
  it('pénétration quand ils empilent l’armure, anti-soins déjà chez un allié, ennemi en avance', () => {
    const r = readTeams(
      'ad',
      [{ id: 10, name: 'Kalista', comp: comp({}), items: [3033] }],
      [
        { id: 20, name: 'Sejuani', comp: comp({ front: 3 }), items: [1, 1], kills: 1, deaths: 5 },
        { id: 21, name: 'Kayn', comp: comp({ phys: 5, magic: 0 }), items: [1, 1], kills: 9, deaths: 2 },
      ],
      [{ key: 'antiheal', title: 'Anti-soins', why: '', champions: [], items: [] }],
      cat,
      () => 'Mortal Reminder',
    );
    expect(r.extra[0]?.key).toBe('pen');
    expect(r.notes.join(' ')).toContain('Kalista a déjà de l’anti-soins');
    expect(r.notes.join(' ')).toContain('Kayn est en avance (9/2) : l’armure compte double');
  });
});

describe('readTeams : items achetés en face', () => {
  const comp = () => ({ phys: 1, magic: 1, true: 0, front: 1, sustain: 1, cc: 1, damage: 1 }) as never;
  const cat = (id: number) => (id === 1 ? ['CriticalStrike', 'Damage'] : id === 2 ? ['LifeSteal'] : []);
  it('critiques et vol de vie vus au tableau des scores', () => {
    const r = readTeams('tank', [], [{ id: 1, name: 'Quinn', comp: comp(), items: [1, 1, 1, 2] }, { id: 2, name: 'Yi', comp: comp(), items: [2] }], [], cat, () => '');
    expect(r.extra.map((t) => t.key)).toEqual(['crit', 'antiheal']);
    expect(r.extra[0].items[0]).toBe(3143);
  });
});

import { compFromItems } from '../src/core/counters';
describe('compFromItems', () => {
  it('un champion « AD » qui construit AP compte comme magique', () => {
    const comp = { phys: 6, magic: 2, true: 0, front: 1, sustain: 1, cc: 1, damage: 1 } as never;
    const r = compFromItems(comp, [1, 2, 3], () => ['SpellDamage']);
    expect(r.built).toBe('AP');
    expect((r.comp as { magic: number }).magic).toBe(8);
    expect(compFromItems(comp, [1], () => ['SpellDamage']).built).toBeNull();
  });
});

import { counterItemsFor } from '../src/core/counters';
describe('counterItemsFor', () => {
  it('préfère l’item du build du champion qui répond à la menace', () => {
    const cat = (id: number) => (id === 6333 ? ['Armor', 'Damage'] : []);
    expect(counterItemsFor('crit', [3026, 3047], [{ id: 2517, winrate: 0.58 }, { id: 6333, winrate: 0.565 }], cat)).toEqual([6333, 3026, 3047]);
  });
});
