import { describe, expect, it } from 'vitest';
import { compareLoadout, nothingBought, readPerks, readSlots, slotFit, swiftplayStarter } from '../src/core/quickplay';
import type { Lane, LaneMetaRow } from '../src/core/opgg';

const perks = JSON.stringify({ perkIds: [8010, 9111, 9104, 8299, 8444, 8451, 5005, 5008, 5001], perkStyle: 8000, perkSubStyle: 8400, unknown: true });
const lobby = (queueId: number, slots: unknown) => ({ gameConfig: { queueId }, partyId: 'x', localMember: { playerSlots: slots } });
const slot = { championId: 876, skinId: 876000, positionPreference: 'JUNGLE', spell1: 11, spell2: 4, perks };
const page = { primary: 8000, sub: 8400, perks: [8010, 9111, 9104, 8299, 8444, 8451, 5007, 5008, 5001] };

describe('salon Swiftplay', () => {
  it('lit les 2 choix, perks en chaîne JSON, champs inconnus ignorés', () => {
    const r = readSlots(lobby(480, [slot, { ...slot, championId: 238, positionPreference: 'MIDDLE', spell1: 4, spell2: 14 }]));
    expect(r?.queueId).toBe(480);
    expect(r?.slots.map((s) => [s.championId, s.lane])).toEqual([[876, 'jungle'], [238, 'mid']]);
    expect(r?.slots[0].runes).toEqual({ primary: 8000, sub: 8400, perks: [8010, 9111, 9104, 8299, 8444, 8451, 5005, 5008, 5001] });
  });

  it('ne lit que les files à emplacements', () => {
    for (const q of [0, 400, 420, 440, 450, 2400]) expect(readSlots(lobby(q, [slot]))).toBeNull();
    expect(readSlots(lobby(480, []))).toBeNull();
    expect(readSlots(lobby(480, [{ ...slot, championId: 0 }]))).toBeNull();
    expect(readSlots(null)).toBeNull();
  });

  it('rôle non choisi et perks illisibles : rien de supposé', () => {
    const r = readSlots(lobby(480, [{ ...slot, positionPreference: 'UNSELECTED', perks: 'pas du json' }]));
    expect(r?.slots[0].lane).toBeNull();
    expect(r?.slots[0].runes).toBeNull();
    expect(readPerks('[]')).toBeNull();
    expect(readPerks(JSON.stringify({ perkIds: [], perkStyle: 8000, perkSubStyle: 8400 }))).toBeNull();
    expect(compareLoadout(r!.slots[0], { spells: [11, 4], runes: page }).runes).toBe('unknown');
  });

  it('compare sorts sans regarder la touche, runes sans les éclats', () => {
    const s = readSlots(lobby(480, [slot]))!.slots[0];
    expect(compareLoadout(s, { spells: [4, 11], runes: page })).toEqual({ spellsOk: true, smiteMissing: false, runes: 'same', runesOff: 0 });
  });

  it('gradue les écarts de runes', () => {
    const s = readSlots(lobby(480, [slot]))!.slots[0];
    const gap = (p: typeof page) => compareLoadout(s, { spells: [], runes: p });
    expect(gap({ ...page, perks: [8010, 9111, 9104, 8014, 8444, 8451] })).toMatchObject({ runes: 'minor', runesOff: 1 });
    expect(gap({ ...page, sub: 8300 }).runes).toBe('minor');
    expect(gap({ ...page, perks: [8005, 9111, 9104, 8299, 8444, 8451] }).runes).toBe('keystone');
    expect(gap({ ...page, primary: 8100, perks: [8112, 8143, 8138, 8135, 8444, 8451] }).runes).toBe('style');
  });

  it('signale la jungle sans Châtiment, même sans données OP.GG', () => {
    const s = readSlots(lobby(480, [{ ...slot, spell1: 4, spell2: 14 }]))!.slots[0];
    expect(compareLoadout(s, null)).toMatchObject({ smiteMissing: true, spellsOk: null, runes: 'unknown' });
    const mid = readSlots(lobby(480, [{ ...slot, positionPreference: 'MIDDLE', spell1: 4, spell2: 14 }]))!.slots[0];
    expect(compareLoadout(mid, null).smiteMissing).toBe(false);
  });
});

describe('départ Swiftplay', () => {
  it('remplace Doran par le Gardien, le reste ne bouge pas', () => {
    expect(swiftplayStarter([1056, 2003, 2003])).toEqual([3112, 2003, 2003]);
    expect(swiftplayStarter([1055])).toEqual([3177]);
    expect(swiftplayStarter([1054])).toEqual([2051]);
    expect(swiftplayStarter([1102, 2031])).toEqual([1102, 2031]); // familier de jungle, potion
    expect(swiftplayStarter([])).toEqual([]);
  });

  it('une balise seule ne compte pas comme un achat', () => {
    expect(nothingBought([])).toBe(true);
    expect(nothingBought([3340])).toBe(true);
    expect(nothingBought([3340, 2003])).toBe(false);
  });
});

describe('place du choix dans le rôle', () => {
  const row = (champion: string, lane: Lane, winRate: number, roleRate = 0.9, games = 50_000): LaneMetaRow => ({ champion, lane, roleRate, winRate, tier: 2, games });
  const jungle = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => [row(n, 'jungle', 0.54 - i * 0.01)]);

  it('bien placé : le rang, sans alternatives', () => {
    expect(slotFit(jungle[1], jungle, 'jungle')).toEqual({ rank: 2, of: 6, main: null, stronger: [] });
  });

  it('dernier tiers : les 3 plus forts, nettement au-dessus', () => {
    const fit = slotFit(jungle[5], jungle, 'jungle')!;
    expect(fit.rank).toBe(6);
    expect(fit.stronger.map((c) => c.champion)).toEqual(['A', 'B', 'C']);
  });

  it('un écart dans le bruit ne donne pas de « plus fort »', () => {
    const near = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => [row(n, 'jungle', 0.5 + (5 - i) * 0.0001)]);
    expect(slotFit(near[5], near, 'jungle')!.stronger).toEqual([]);
  });

  it('hors de son rôle : rôle principal et alternatives, vraies formes du 3 nov. (Malphite)', () => {
    const malphite = [row('Malphite', 'top', 0.5155, 0.78, 173_872), row('Malphite', 'jungle', 0.4868, 0.09, 20_702), row('Malphite', 'mid', 0.5011, 0.09, 19_300)];
    const fit = slotFit(malphite, [malphite, ...jungle], 'jungle')!;
    expect(fit.rank).toBe(7);
    expect(fit.main).toEqual({ lane: 'top', share: 0.78, winRate: 0.5155 });
    expect(fit.stronger).toHaveLength(3);
  });

  it('presque jamais joué ici : pas de rang', () => {
    const lux = [row('Lux', 'support', 0.51, 0.7), row('Lux', 'jungle', 0.45, 0.01, 800)];
    const fit = slotFit(lux, [lux, ...jungle], 'jungle')!;
    expect(fit.rank).toBeNull();
    expect(fit.main?.lane).toBe('support');
    expect(fit.stronger).toHaveLength(3);
  });

  it('rien sur un rôle trop mince ou un champion inconnu : pas de ligne', () => {
    expect(slotFit(jungle[0], jungle.slice(0, 3), 'jungle')).toBeNull();
    expect(slotFit([], jungle, 'jungle')).toBeNull();
  });
});
