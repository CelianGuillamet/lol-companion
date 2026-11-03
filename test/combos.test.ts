import { describe, expect, it } from 'vitest';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Combos, comboKey, comboNote, parseCombosCsv, protectCombos, snapshotRows } from '../src/core/combos';
import type { RerollAdvice } from '../src/core/reroll';
import { rerollLine } from '../src/renderer/offered-cards';

const HEAD = 'comboId,slug,championId,champion_name_en,augmentIds,augment_names_en,types,url';
const line = (i: number) => `${i},c-${i},Ezreal,Ezreal,juiced|jeweled_gauntlet,"Juiced|Jeweled Gauntlet",,https://arammayhem.com/combo/c-${i}/`;
const csv = (n = 120, extra = '') => [HEAD, ...Array.from({ length: n }, (_, i) => line(i)), extra].join('\n');
const rows = snapshotRows();

describe('lecture du fichier', () => {
  it('lit le CSV, guillemets et | compris', () => {
    const r = parseCombosCsv(csv(120, '999,x,MonkeyKing,"Wukong, le roi",blade_waltz,"Blade Waltz",strong|blackTech,u\r'))!;
    expect(r).toHaveLength(121);
    expect(r[0]).toEqual({ champion: 'ezreal', augments: ['juiced', 'jeweledgauntlet'], types: [] });
    expect(r[120]).toEqual({ champion: 'monkeyking', augments: ['bladewaltz'], types: ['strong', 'blackTech'] });
  });

  it('refuse un fichier qui n\'a pas la forme attendue', () => {
    expect(parseCombosCsv('<html>erreur</html>')).toBeNull();
    expect(parseCombosCsv('comboId,slug\n1,a')).toBeNull();
    expect(parseCombosCsv(csv(10))).toBeNull();
  });

  it('instantané : 457 lignes, des clés qui joignent les noms du jeu', () => {
    expect(rows).toHaveLength(457);
    expect(comboKey('purist___caster')).toBe(comboKey('Purist - Caster'));
    expect(comboKey('light_em_up!')).toBe(comboKey("Light 'em Up!"));
    expect(comboKey('quest_wooglets_witchcap')).toBe(comboKey("Quest: Wooglet's Witchcap"));
    expect(rows.every((r) => r.augments.length >= 1 && r.champion)).toBe(true);
  });
});

describe('avis sur une carte', () => {
  it('combo solo, selon le type', () => {
    expect(comboNote(rows, ['Vayne'], 'Dual Wield')).toMatchObject({ kind: 'strong', good: true });
    expect(comboNote(rows, ['Lucian'], 'Vulnerability')).toMatchObject({ kind: 'good', good: true });
    expect(comboNote(rows, ['Darius'], 'Typhoon')).toMatchObject({ kind: 'tech', good: null });
    expect(comboNote(rows, ['Yasuo'], 'Shadow Runner')).toMatchObject({ kind: 'fun', good: null });
    expect(comboNote(rows, ['Belveth'], 'Mystic Punch')).toMatchObject({ kind: 'listed', good: null });
  });

  it('piège d\'abord, y compris marqué aussi « astuce »', () => {
    expect(comboNote(rows, ['Garen'], 'Vampirism')).toMatchObject({ kind: 'trap', good: false });
    expect(comboNote(rows, ['Shaco'], 'Vampirism')).toMatchObject({ kind: 'trap', good: false });
  });

  it('un bug connu n\'est pas présenté comme un bon choix', () => {
    expect(comboNote(rows, ['Elise'], 'Dashing')).toMatchObject({ kind: 'bug', good: null });
  });

  it('le nom anglais ou l\'alias du champion suffisent', () => {
    expect(comboNote(rows, ['Wukong', 'MonkeyKing'], 'Blade Waltz')).toMatchObject({ kind: 'good' });
    expect(comboNote(rows, ['Dr. Mundo', 'DrMundo'], 'Vampirism')).toMatchObject({ kind: 'trap' });
  });

  it('un plan ne parle que si un augment du plan est déjà pris', () => {
    expect(comboNote(rows, ['Ezreal'], 'Juiced')).toBeNull();
    expect(comboNote(rows, ['Ezreal'], 'Juiced', ['Goliath'])).toBeNull();
    expect(comboNote(rows, ['Ezreal'], 'Juiced', ['Jeweled Gauntlet'])).toEqual({ kind: 'plan', label: 'va avec Jeweled Gauntlet', good: true, with: ['Jeweled Gauntlet'] });
  });

  it('la carte ne fait pas plan avec elle-même', () => {
    expect(comboNote(rows, ['Ezreal'], 'Juiced', ['Juiced'])).toBeNull();
  });

  it('un plan passe devant un avis faible, pas devant un piège ni un bon combo', () => {
    // Hecarim : Ethereal Weapon = combo fort, et plan avec Mystic Punch
    expect(comboNote(rows, ['Hecarim'], 'Ethereal Weapon', ['Mystic Punch'])?.kind).toBe('strong');
    const r = snapshotRows(['Zed x|y -', 'Zed x entertainment', 'Zed y trap']);
    expect(comboNote(r, ['Zed'], 'x', ['y'])?.kind).toBe('plan');
    expect(comboNote(r, ['Zed'], 'y', ['x'])?.kind).toBe('trap');
  });

  it('rien pour un autre champion ou une autre carte', () => {
    expect(comboNote(rows, ['Vayne'], 'Goliath')).toBeNull();
    expect(comboNote(rows, ['Inconnu'], 'Dual Wield')).toBeNull();
  });
});

describe('relances', () => {
  const free: RerollAdvice = { kind: 'free', targets: [1, 2], gain: 0.02, upgrade: false, left: 3 };
  const good = { kind: 'strong', label: 'combo fort', good: true } as const;
  const trap = { kind: 'trap', label: 'piège connu', good: false } as const;

  it('garde la carte qui fait combo, relance encore les autres', () => {
    expect(protectCombos(free, { 1: good })).toEqual({ ...free, targets: [2] });
  });

  it('plus rien à relancer : garde, et dit pourquoi', () => {
    const r = protectCombos({ ...free, targets: [1] }, { 1: good })!;
    expect(r).toMatchObject({ kind: 'keep', targets: [], combo: true });
    expect(rerollLine(r, [])?.text).toContain('combo connu');
  });

  it('relance risquée : jamais sur la carte qui fait combo', () => {
    expect(protectCombos({ ...free, kind: 'risky', targets: [1], better: 0.6, fallback: 2 }, { 1: good })).toMatchObject({ kind: 'keep', combo: true });
  });

  it('un piège ou une simple info ne protègent pas', () => {
    expect(protectCombos(free, { 1: trap, 2: { kind: 'fun', label: 'pour le fun', good: null } })).toEqual(free);
    expect(protectCombos(null, { 1: good })).toBeNull();
  });
});

describe('chargement', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'combos-'));

  it('prend le site et le garde 24 h', async () => {
    const d = dir();
    let calls = 0;
    const c = new Combos(d, async () => (calls++, csv()));
    await c.load();
    await new Combos(d, async () => (calls++, csv())).load();
    expect(c.source).toBe('site');
    expect(c.rows).toHaveLength(120);
    expect(calls).toBe(1);
  });

  it('site injoignable : l\'instantané, sans erreur', async () => {
    const c = new Combos(dir(), async () => {
      throw new Error('403');
    });
    await c.load();
    expect(c.source).toBe('instantané');
    expect(c.rows).toHaveLength(457);
  });

  it('fichier illisible : l\'instantané, et le cache n\'est pas écrasé', async () => {
    const d = dir();
    await new Combos(d, async () => csv()).load();
    const c = new Combos(d, async () => '<html>');
    await c.load(true);
    expect(c.rows).toHaveLength(120); // dernier fichier bon
  });

  it('cache périmé et site injoignable : le dernier fichier lu', async () => {
    const d = dir();
    writeFileSync(join(d, 'arammayhem-combos.csv'), csv(130));
    const old = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    utimesSync(join(d, 'arammayhem-combos.csv'), old, old);
    const c = new Combos(d, async () => {
      throw new Error('hors ligne');
    });
    await c.load();
    expect(c.rows).toHaveLength(130);
  });
});
