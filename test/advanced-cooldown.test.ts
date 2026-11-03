import { describe, expect, it } from 'vitest';
import {
  AdvancedCooldownEngine, applyCooldownChange, createCooldownTimer, remainingCooldown, advanceCharges, spendCharge,
  type CooldownInput, type CooldownRule, type ChargePool,
} from '../src/core/intelligence/advanced-cooldown';

// RÈGLES SYNTHÉTIQUES : aucune valeur ne prétend décrire un champion ou patch réel.
const rule: CooldownRule = {
  patch: 'test-patch', mode: 'test-mode', champion: 'Synthetic', spell: 'Q', category: 'ability',
  baseCooldowns: [12, 10, 8], form: 'standard', startsOn: 'cast', source: 'fixture synthétique de test',
};
const input: CooldownInput = {
  patch: rule.patch, mode: rule.mode, champion: rule.champion, spell: rule.spell, rank: 2,
  abilityHaste: 100, ultimateHaste: null, summonerHaste: null, modifiersComplete: true, modifiers: [],
};
function engine(override: Partial<CooldownRule> = {}) {
  const e = new AdvancedCooldownEngine();
  e.register({ ...rule, ...override });
  return e;
}

describe('AdvancedCooldownEngine : données et règles explicites', () => {
  it('utilise le rang et la formule d’accélération sans qualifier le résultat d’exact', () => {
    expect(engine().calculate(input)).toEqual({ quality: 'calculated', durationSeconds: 5, ruleSource: rule.source, form: 'standard' });
  });
  it('ne réutilise pas une règle d’un autre patch ou mode', () => {
    for (const change of [{ patch: 'other' }, { mode: 'other' }, { champion: 'other' }, { spell: 'other' }]) {
      expect(engine().calculate({ ...input, ...change }).quality).toBe('unknown');
    }
  });
  it('refuse les rangs inconnus et les statistiques nécessaires manquantes', () => {
    for (const rank of [null, 0, -1, 4, 1.5, NaN]) expect(engine().calculate({ ...input, rank }).quality).toBe('unknown');
    for (const abilityHaste of [null, NaN, Infinity, -1]) expect(engine().calculate({ ...input, abilityHaste }).quality).toBe('unknown');
    expect(engine().calculate({ ...input, modifiersComplete: false }).quality).toBe('unknown');
  });
  it('additionne uniquement l’accélération de compétence et l’accélération ultime', () => {
    const e = engine({ category: 'ultimate' });
    expect(e.calculate(input).quality).toBe('unknown');
    expect(e.calculate({ ...input, ultimateHaste: 50 })).toMatchObject({ quality: 'calculated', durationSeconds: 4 });
  });
  it('sépare l’accélération des sorts d’invocateur', () => {
    const e = engine({ category: 'summoner' });
    expect(e.calculate(input).quality).toBe('unknown');
    expect(e.calculate({ ...input, abilityHaste: null, summonerHaste: 25 })).toMatchObject({ quality: 'calculated', durationSeconds: 8 });
  });
  it('applique les modificateurs acquis dans leur ordre explicite et refuse les états particuliers', () => {
    expect(engine().calculate({ ...input, modifiers: [{ kind: 'flat', value: 1 }, { kind: 'multiply', value: 0.5 }] }))
      .toMatchObject({ quality: 'calculated', durationSeconds: 2 });
    expect(engine().calculate({ ...input, modifiers: [{ kind: 'flat', value: NaN }] }).quality).toBe('unknown');
    expect(engine({ validate: () => 'État de transformation non acquis' }).calculate(input).quality).toBe('unknown');
  });
  it('distingue un lancement initial, une recharge et la dernière réactivation', () => {
    const charge = engine({ form: 'charge', startsOn: 'charge-spent' });
    expect(charge.calculate(input).quality).toBe('unknown');
    expect(charge.calculate({ ...input, form: 'charge', activation: 'charge-spent' }).quality).toBe('calculated');
    const recast = engine({ form: 'recast', startsOn: 'recast-finished' });
    expect(recast.calculate({ ...input, form: 'recast' }).quality).toBe('unknown');
    expect(recast.calculate({ ...input, form: 'recast', activation: 'recast-finished' }).quality).toBe('calculated');
  });
  it('rejette les règles invalides et conserve une copie des valeurs enregistrées', () => {
    expect(() => engine({ baseCooldowns: [NaN] })).toThrow();
    expect(() => engine({ source: '' })).toThrow();
    expect(() => engine({ form: 'charge', startsOn: 'cast' })).toThrow();
    const cooldowns = [10];
    const e = engine({ baseCooldowns: cooldowns });
    cooldowns[0] = 500;
    expect(e.calculate({ ...input, rank: 1 })).toMatchObject({ durationSeconds: 5 });
  });
});

describe('timers : temps de partie et changements observés', () => {
  it('reste inconnu sans calcul ou timestamp valide', () => {
    expect(createCooldownTimer({ quality: 'unknown', reasons: ['manquant'] }, 10)).toBeNull();
    expect(createCooldownTimer(engine().calculate(input), NaN)).toBeNull();
  });
  it('ne dérive pas du temps mural, expire et refuse une horloge ancienne', () => {
    const timer = createCooldownTimer(engine().calculate(input), 100)!;
    expect(remainingCooldown(timer, 100)).toBe(5);
    expect(remainingCooldown(timer, 103)).toBe(2);
    expect(remainingCooldown(timer, 110)).toBe(0);
    expect(remainingCooldown(timer, 99)).toBeNull();
  });
  it('applique resets et réductions explicites sans modifier le timer d’origine', () => {
    const timer = createCooldownTimer(engine().calculate(input), 100)!;
    const reduced = applyCooldownChange(timer, { kind: 'reduce-seconds', at: 101, amount: 1 })!;
    expect(reduced.readyAt).toBe(104);
    expect(timer.readyAt).toBe(105);
    expect(applyCooldownChange(reduced, { kind: 'reduce-fraction', at: 102, amount: 0.5 })!.readyAt).toBe(103);
    expect(applyCooldownChange(timer, { kind: 'reset', at: 102 })!.readyAt).toBe(102);
    expect(applyCooldownChange(reduced, { kind: 'reset', at: 99 })).toBeNull();
    expect(applyCooldownChange(timer, { kind: 'reduce-fraction', at: 102, amount: 2 })).toBeNull();
  });
});

describe('charges séquentielles : état initial connu obligatoire', () => {
  const pool: ChargePool = { available: 2, maximum: 2, rechargeSeconds: 10, nextChargeAt: null, updatedAt: 100 };
  it('consomme les charges et récupère sans retarder la recharge déjà en cours', () => {
    const first = spendCharge(pool, 100)!;
    expect(first).toMatchObject({ available: 1, nextChargeAt: 110 });
    const second = spendCharge(first, 103)!;
    expect(second).toMatchObject({ available: 0, nextChargeAt: 110 });
    expect(spendCharge(second, 104)).toBeNull();
    expect(advanceCharges(second, 110)).toMatchObject({ available: 1, nextChargeAt: 120 });
    expect(advanceCharges(second, 150)).toMatchObject({ available: 2, nextChargeAt: null });
  });
  it('refuse les états incohérents et un timestamp ancien', () => {
    expect(advanceCharges(pool, 99)).toBeNull();
    expect(advanceCharges({ ...pool, available: 1 }, 100)).toBeNull();
    expect(advanceCharges({ ...pool, rechargeSeconds: 0 }, 100)).toBeNull();
  });
});
