import { describe, expect, it } from 'vitest';
import { buildProfile, fitOf, parseAugmentModule, tagsOf } from '../src/core/augfit';

const LUA = `return {
    ["ADAPt"] = {
        ["description"] = "Convert '''all''' of your {{as|'''bonus''' attack damage}} into {{as|ability power}} at a rate of 1 per 0.6.",
        ["tier"] = "Silver",
    },
    ["Critical Rhythm"] = {
        ["description"] = "Gain {{as|critical strike chance}} and {{as|attack speed}}. Your basic attacks deal bonus damage.",
        ["tier"] = "Gold",
    },
    ["Quest: Urf's Champion"] = {
        ["description"] = "Takedowns grant stacks.",
        ["tier"] = "Prismatic",
        ["displayname"] = "Quest: Urf's Champion (Mayhem)",
    },
}`;

describe('augfit', () => {
  it('lit le module du wiki', () => {
    const m = parseAugmentModule(LUA);
    expect(m.get('criticalrhythm')?.tier).toBe('Gold');
    expect(m.has('urfschampion')).toBe(true);
  });

  it('étiquette les descriptions', () => {
    expect([...tagsOf('Gain {{as|critical strike chance}} and {{as|attack speed}}. Your basic attacks deal bonus damage.')].sort()).toEqual(['as', 'attacks', 'crit']);
    expect(tagsOf('Your abilities deal bonus damage equal to 10% {{as|ability power}}.').has('ap')).toBe(true);
    // les deux ratios : ni AD ni AP
    const both = tagsOf('Deals damage (+ 50% bonus attack damage) (+ 30% ability power).');
    expect(both.has('ap') || both.has('ad')).toBe(false);
  });

  it('bonus si ton build va dans le sens de l’augment, malus s’il le contredit', () => {
    const cat = (id: number) => ({ 1: ['CriticalStrike', 'Damage', 'AttackSpeed'], 2: ['SpellDamage'], 3: ['SpellDamage', 'Health'] } as Record<number, string[]>)[id] ?? [];
    const critBuild = buildProfile([1, 1], [1], cat);
    const apBuild = buildProfile([2, 3], [2], cat);
    const crit = new Set(['crit', 'as', 'attacks'] as const);
    expect(fitOf(crit, critBuild, 3).delta).toBeGreaterThan(0);
    const bad = fitOf(crit, apBuild, 3);
    expect(bad.delta).toBeLessThan(0);
    expect(bad.why).toContain('ne va pas avec ton build');
    expect(Math.abs(bad.delta)).toBeLessThanOrEqual(0.04);
    // trop tôt (moins de 2 items) : pas de correction
    expect(fitOf(crit, apBuild, 1).delta).toBe(0);
    // catégories d'items inconnues : rien
    expect(fitOf(crit, buildProfile([9, 9], [9], cat), 3).delta).toBe(0);
  });
});
