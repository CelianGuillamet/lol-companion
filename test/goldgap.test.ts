import { describe, expect, it } from 'vitest';
import { goldGap, itemValue, playerGold, sampleSlot, type GapInput } from '../src/core/goldgap';

const PRICES: Record<number, number> = { 3084: 3000, 3111: 1250, 3430: 2800, 3075: 2450, 2003: 50 };
const price = (id: number) => PRICES[id] ?? null;
const p = (over: Partial<GapInput>): GapInput => ({ championId: 1, championName: 'A', ally: true, me: false, level: 10, position: '', items: [], ...over });

describe('valeur des objets', () => {
  it('compte le prix total, sans les consommables, et signale les inconnus', () => {
    expect(playerGold([{ itemID: 3084 }, { itemID: 2003, consumable: true, count: 3 }, { itemID: 777 }], price)).toEqual({ gold: 3000, unknown: 1 });
  });

  it('objet de mode absent du catalogue : prend le prix du jeu, 0 compris (valeurs lues dans les captures)', () => {
    expect(playerGold([{ itemID: 228002, price: 6000 }, { itemID: 220013, price: 0 }], () => null)).toEqual({ gold: 6000, unknown: 0 });
  });

  it('objet du catalogue : ignore le prix de la dernière recette', () => {
    expect(playerGold([{ itemID: 3084, price: 400 }], (id) => (id === 3084 ? 3000 : null))).toEqual({ gold: 3000, unknown: 0 });
  });
  it('retrouve l\'objet de base des ids Mayhem à préfixe', () => {
    expect(itemValue(123430, price)).toBe(2800);
    expect(itemValue(323075, price)).toBe(2450);
    expect(itemValue(9999, price)).toBeNull();
  });
});

describe('écart d\'objets', () => {
  it('rien tant qu\'un camp manque ou que personne n\'a d\'objet', () => {
    expect(goldGap([p({ items: [{ itemID: 3084 }] })], price, 'mayhem')).toBeNull();
    expect(goldGap([p({}), p({ ally: false })], price, 'mayhem')).toBeNull();
  });

  it('additionne les équipes, compare les niveaux, trouve le plus riche en face', () => {
    const g = goldGap([
      p({ me: true, level: 12, items: [{ itemID: 3084 }, { itemID: 3111 }] }),
      p({ ally: false, championId: 2, championName: 'Jinx', level: 11, items: [{ itemID: 3111 }] }),
      p({ ally: false, championId: 3, championName: 'Lux', level: 9, items: [] }),
    ], price, 'mayhem')!;
    expect(g.gap).toBe(3000);
    expect(g.levelGap).toBe(-8);
    expect(g.state).toBe('ahead');
    expect(g.richest.championName).toBe('Jinx');
    expect(g.byRole).toBe(false);
    expect(g.rows[0].ally?.gold).toBe(4250);
    expect(g.rows[1].ally).toBeNull();
  });

  it('un petit écart reste « à égalité », même tôt dans la partie', () => {
    const early = goldGap([p({ items: [{ itemID: 3111 }] }), p({ ally: false, items: [] })], price, 'aram')!;
    expect(early.gap).toBe(1250);
    expect(early.state).toBe('ahead');
    const tiny = goldGap([p({ items: [{ itemID: 2003 }] }), p({ ally: false, items: [] })], price, 'aram')!;
    expect(tiny.state).toBe('even');
    const late = Array.from({ length: 16 }, () => ({ itemID: 3084 }));
    const three = goldGap([p({ items: [...late, { itemID: 3111 }] }), p({ ally: false, items: late })], price, 'aram')!;
    expect(three.gap).toBe(1250);
    expect(three.state).toBe('even');
  });

  it('un retard se dit « behind »', () => {
    expect(goldGap([p({}), p({ ally: false, items: [{ itemID: 3084 }] })], price, 'sr')!.state).toBe('behind');
  });

  const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
  it('Faille : compare rôle contre rôle quand les 5 rôles sont connus', () => {
    const team = (ally: boolean) => ROLES.map((position, i) => p({ ally, position, me: ally && i === 2, championId: i + (ally ? 10 : 20), items: i === 2 && ally ? [{ itemID: 3084 }] : [] }));
    const g = goldGap([...team(true), ...team(false)], price, 'sr')!;
    expect(g.byRole).toBe(true);
    expect(g.rows.map((r) => r.role)).toEqual(['Haut', 'Jungle', 'Milieu', 'Tireur', 'Soutien']);
    expect(g.rows[2].mine).toBe(true);
    expect(g.rows[2].gap).toBe(3000);
  });

  it('Faille sans rôles complets (Swiftplay, jungle partie) : retombe sur le classement', () => {
    const g = goldGap([p({ position: 'TOP', items: [{ itemID: 3084 }] }), p({ ally: false, position: 'MIDDLE' })], price, 'sr')!;
    expect(g.byRole).toBe(false);
  });

  it('prend un échantillon par tranche de 5 minutes', () => {
    expect(sampleSlot(299)).toBe(0);
    expect(sampleSlot(300)).toBe(1);
    expect(sampleSlot(901)).toBe(3);
  });
});
