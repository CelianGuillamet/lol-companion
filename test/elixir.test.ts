import { describe, expect, it } from 'vitest';
import { ELIXIR_MS, ELIXIRS, elixirAdvice, elixirBought, elixirRole, elixirUntil } from '../src/core/elixir';
import { itemToSell } from '../src/core/nextbuy';

const base = { role: 'ad' as const, level: 15, gold: 2000, idle: true, price: 500, onMap: true, until: null, now: 1_000_000 };

describe('élixirs', () => {
  it('conseille celui du build quand il ne reste rien à acheter', () => {
    expect(elixirAdvice(base)).toMatchObject({ id: 2140, buy: true, left: null, price: 500 });
    expect(elixirAdvice({ ...base, role: 'ap' })?.id).toBe(2139);
    expect(elixirAdvice({ ...base, role: 'tank' })?.id).toBe(2138);
  });

  it('se tait tant qu’un achat reste, sous le niveau 9, sans l’or, ou si l’objet n’existe pas sur la carte', () => {
    expect(elixirAdvice({ ...base, idle: false })).toBeNull();
    expect(elixirAdvice({ ...base, level: 8 })).toBeNull();
    expect(elixirAdvice({ ...base, level: null })).toBeNull();
    expect(elixirAdvice({ ...base, gold: 499 })).toBeNull();
    expect(elixirAdvice({ ...base, onMap: false })).toBeNull();
    expect(elixirAdvice({ ...base, onMap: null })?.id).toBe(2140);
  });

  it('un effet en cours n’appelle pas un 2e achat, sauf à moins d’une minute', () => {
    expect(elixirAdvice({ ...base, until: base.now + 120_000 })).toMatchObject({ left: 120, buy: false });
    expect(elixirAdvice({ ...base, until: base.now + 40_000 })).toMatchObject({ left: 40, buy: true });
    expect(elixirAdvice({ ...base, until: base.now + 40_000, gold: 100 })).toMatchObject({ left: 40, buy: false });
    expect(elixirAdvice({ ...base, until: base.now - 1 })).toMatchObject({ left: null, buy: true });
  });

  it('ce que tu construis prime sur le champion', () => {
    expect(elixirRole('tank', 'AP')).toBe('ap');
    expect(elixirRole('ap', 'AD')).toBe('ad');
    expect(elixirRole('tank', 'mixte')).toBe('tank');
    expect(elixirRole('ad', null)).toBe('ad');
  });

  it('voit l’achat à la baisse de l’or, sac inchangé', () => {
    expect(elixirBought(2000, 1500, true, 500)).toBe(true);
    expect(elixirBought(2000, 1520, true, 500)).toBe(true); // revenu passif entre deux lectures
    expect(elixirBought(2000, 1500, false, 500)).toBe(false); // un vrai achat a changé le sac
    expect(elixirBought(2000, 1950, true, 500)).toBe(false);
    expect(elixirBought(2000, 2100, true, 500)).toBe(false);
  });

  it('bu mort, l’effet démarre à la réapparition', () => {
    expect(elixirUntil(0, null)).toBe(ELIXIR_MS);
    expect(elixirUntil(0, 30)).toBe(ELIXIR_MS + 30_000);
  });

  it('jamais proposé à la vente', () => {
    const id = ELIXIRS.ad.id;
    expect(itemToSell([id, 3001], [], (x) => x === 3001, () => false, () => 500, () => [])).toBeNull();
  });
});
