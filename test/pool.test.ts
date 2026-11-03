import { describe, expect, it } from 'vitest';
import { expectedBest, parseCollection, poolReport, type Collection } from '../src/core/pool';

const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);
const rows = (owned: number[], free: number[] = []) => [
  { id: -1, ownership: { owned: false } },
  ...owned.map((id) => ({ id, freeToPlay: false, ownership: { owned: true } })),
  ...free.map((id) => ({ id, freeToPlay: true, ownership: { owned: false } })),
];

describe('parseCollection', () => {
  it('sépare les champions à toi de la rotation et ignore l’entrée -1', () => {
    const c = parseCollection(rows(ids(30), [99]))!;
    expect(c.owned.size).toBe(30);
    expect([...c.free]).toEqual([99]);
    expect(c.owned.has(-1)).toBe(false);
  });
  it('ne se fie pas à une lecture absente ou trop courte', () => {
    expect(parseCollection(null)).toBeNull();
    expect(parseCollection({ message: 'x' })).toBeNull();
    expect(parseCollection(rows(ids(5)))).toBeNull();
  });
  it('sans champ ownership, l’endpoint fait foi', () => {
    expect(parseCollection(ids(25).map((id) => ({ id })))!.owned.size).toBe(25);
  });
});

describe('expectedBest', () => {
  it('vaut la valeur unique si tout est égal', () => {
    expect(expectedBest([0.5, 0.5, 0.5], 3)).toBeCloseTo(0.5);
  });
  it('2 cartes seules : maximum de 2 tirages avec remise', () => {
    // 1 chance sur 4 de ne tirer que la valeur basse ; total = 2 mais les 4 tirages du banc jouent aussi
    const twoCards = expectedBest([0.4, 0.6], 1e9); // banc quasi toujours inaccessible
    expect(twoCards).toBeCloseTo(0.4 * 0.25 + 0.6 * 0.75, 3);
  });
  it('monte avec la part de champions accessibles au banc', () => {
    const v = ids(50).map((i) => 0.45 + i / 500);
    expect(expectedBest(v, 50)).toBeGreaterThan(expectedBest(v, 170));
  });
});

describe('poolReport', () => {
  const champs = ids(100).map((id) => ({ id, name: `C${id}`, winrate: 0.45 + id / 1000, games: 5000 }));
  const col = (n: number, free: number[] = []): Collection => ({ owned: new Set(ids(n)), free: new Set(free) });

  it('classe d’abord les meilleurs winrates et donne un gain positif', () => {
    const r = poolReport(col(60), champs);
    expect(r.owned).toBe(60);
    expect(r.total).toBe(100);
    expect(r.unlocks[0].id).toBe(100);
    expect(r.unlocks.map((u) => u.gain)).toEqual([...r.unlocks.map((u) => u.gain)].sort((a, b) => b - a));
    expect(r.unlocks.every((u) => u.gain > 0)).toBe(true);
    expect(r.topGain).toBeGreaterThan(r.unlocks[0].gain);
    expect(r.unlocks.length).toBeLessThanOrEqual(8);
  });
  it('un champion faible ne sort pas, même non débloqué', () => {
    const r = poolReport({ owned: new Set(ids(80, 21)), free: new Set() }, champs);
    expect(r.unlocks.some((u) => u.id < 21)).toBe(false);
  });
  it('ignore un winrate à trop peu de parties', () => {
    const list = champs.map((c) => (c.id === 100 ? { ...c, games: 50 } : c));
    expect(poolReport(col(60), list).unlocks.some((u) => u.id === 100)).toBe(false);
  });
  it('signale la rotation gratuite', () => {
    expect(poolReport(col(60, [100]), champs).unlocks.find((u) => u.id === 100)?.free).toBe(true);
  });
  it('rien à débloquer quand tout est à toi', () => {
    const r = poolReport(col(100), champs);
    expect(r.unlocks).toEqual([]);
    expect(r.topGain).toBe(0);
  });
  it('3e carte : 5 % + 0,15 % par champion, 30 % au plus', () => {
    expect(poolReport(col(100), champs).blessing).toBeCloseTo(0.2);
    expect(poolReport({ owned: new Set(ids(400)), free: new Set() }, champs).blessing).toBe(0.3);
  });
});
