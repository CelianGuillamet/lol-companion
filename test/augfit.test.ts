import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AugmentInfo, buildProfile, fitOf, isMelee, neverDrawn, normName, parseAugmentModule, plainText, rangedOnly, tagsOf, type FitTag } from '../src/core/augfit';

const WIKI = parseAugmentModule(readFileSync('test/fixtures/mayhem-augments-wiki.lua', 'utf8'));
const tagsNamed = (name: string) => [...tagsOf(WIKI.get(normName(name))!.description)].sort();

// Copie du 3 nov., module réel lu par l'app sur le Mac
const NOV = parseAugmentModule(readFileSync('test/fixtures/mayhem-augments-wiki-nov.lua', 'utf8'));
const novTags = (name: string) => [...tagsOf(NOV.get(normName(name))!.description)].sort();

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

  it('lit le texte du wiki sans son balisage', () => {
    expect(WIKI.size).toBeGreaterThan(190);
    expect(plainText("{{tip|immobilize|Immobilizing}} grants 10 {{as|'''bonus''' armor}} and {{as|{{fd|1.5}}% '''maximum''' health}}.")).toBe('Immobilizing grants 10 bonus armor and 1.5% maximum health.');
    expect(plainText("Replace it with ''{{si|Flash}}''.<br><br>[[File:X.png|20px|link=]] [[shop|the shop]]")).toBe('Replace it with Flash. the shop');
    for (const { description } of WIKI.values()) expect(plainText(description)).not.toMatch(/\{\{|\}\}|'''/);
  });

  describe('sur les vraies descriptions', () => {
    // Malus à tort sur un build sorts : le mot « attack » ou « crit » n'y dit rien de ce que la carte demande
    it.each(['Goldrend', 'Fey Magic', 'Twinfire', 'Dropkick', 'Poro Blaster', 'Triggered Inferno', 'ADAPt', 'EscAPADe', 'Purist Caster', 'Searing Dawn', 'Ethereal Weapon', 'Jeweled Gauntlet', 'Vulnerability', 'Clown College', 'Red Envelopes', 'Sneakerhead', 'Upgrade Thornmail'])('%s ne demande ni attaques ni critiques', (name) => {
      const t = tagsNamed(name);
      expect(t).not.toContain('attacks');
      expect(t).not.toContain('crit');
    });

    it.each<[string, FitTag[]]>([
      ['Deft', ['as']],
      ['Scoped Weapons', ['attacks']],
      ['Blunt Force', ['ad']],
      ['Witchful Thinking', ['ap']],
      ['Marksmage', ['ap', 'attacks']],
      ['Heavy Hitter', ['attacks', 'tank']],
      ['Dual Wield', ['as', 'attacks']],
      ['Double Tap', ['attacks', 'crit']],
      ["It's Critical", ['crit']],
      ['Goliath', ['tank']],
      ['Tank Engine', ['tank']],
      ['Recursion', ['haste']],
      ['Infinite Recursion', ['haste']],
      ['Eureka', ['ap', 'haste']],
      ['Goredrink', ['heal']],
      ['Big Brain', ['ap', 'heal']],
    ])('%s', (name, tags) => expect(tagsNamed(name)).toEqual(tags));

    // Bonus à tort : « health » n'est pas un soin, une cible n'est pas un tank, un délai n'est pas de l'accélération
    it.each(['Dive Bomber', 'Erosion', 'Kill Secured', "Can't Touch This", 'Ultimate Unstoppable'])('%s ne joue sur aucune stat', (name) => {
      expect(tagsNamed(name)).toEqual([]);
    });

    it('un seuil de PV ne fait pas une carte de tank, un pourcentage de tes PV si', () => {
      expect(tagsNamed('Repulsor')).toEqual([]);
      expect(tagsNamed("Dawnbringer's Resolve")).toContain('tank');
    });

    it('sur un build sorts, Goldrend et Twinfire ne sont plus pénalisés, Deft reste contre-indiqué', () => {
      const cat = (id: number) => ({ 2: ['SpellDamage'], 3: ['SpellDamage', 'AbilityHaste'] } as Record<number, string[]>)[id] ?? [];
      const mage = buildProfile([2, 3], [2], cat);
      for (const name of ['Goldrend', 'Twinfire', 'Jeweled Gauntlet', 'Fey Magic']) {
        expect(fitOf(tagsOf(WIKI.get(normName(name))!.description), mage, 3).delta).toBeGreaterThanOrEqual(0);
      }
      expect(fitOf(tagsOf(WIKI.get('deft')!.description), mage, 3).delta).toBeLessThan(0);
    });

    // Textes de cartes lues en partie (Mayhem) : aucune de ces stats ne dépend de ton build
    it.each([
      ['Get Excited', []],
      ['Critical Healing', ['heal']],
      ['Dropkick', ['heal', 'tank']],
    ])('%s : la stat citée ne donne pas de malus', (name, tags) => expect(tagsNamed(name as string)).toEqual(tags));

    it('une carte qui améliore un sort ne dépend pas de la stat citée, le jeu la réserve aux sorts qui en profitent', () => {
      const lil = "Upgrades one of your champion's abilities that has an effect which empowers your basic attacks for a duration, further enhancing the attacks by granting you 150 bonus attack range and 75% bonus attack speed while the effect is active.";
      expect([...tagsOf(lil)]).toEqual([]);
      const bind = "Upgrades one of your champion's abilities that has a immobilizing or grounding effect, empowering the ability to deal 15 (+ 10% AP) (+ 0.5% of your maximum health) magic damage to affected targets and heal you for 50.";
      expect([...tagsOf(bind)].sort()).toEqual(['heal', 'tank']);
    });

    it('un sort donné par la carte ne pénalise pas', () => {
      expect([...tagsOf('Replace a summoner spell with Heroic Swing. Deal 15 (+ 15% AD) (1 + 0.3 per 100% bonus attack speed) physical damage.')]).toEqual([]);
    });

    it('les stats de Tibbers ne sont pas les tiennes', () => {
      const bear = 'Upon death, you summon Tibbers. He deals 250 (+ 100% AP) magic damage. He gains 80 bonus attack speed and deals 25 (+ 50% AP) magic damage every second. His stats are: 50 (+ 75% AD) physical damage (basic attack damage) 1 attack speed attack range';
      expect([...tagsOf(bear)]).toEqual(['ap']);
    });

    it('sait dire si une carte a un texte, nom du client ou du wiki', async () => {
      const lua = readFileSync('test/fixtures/mayhem-augments-wiki.lua', 'utf8');
      const info = new AugmentInfo(mkdtempSync(join(tmpdir(), 'augfit-')), async () => lua);
      await info.load();
      expect(info.has('Get Excited!')).toBe(true);
      expect(info.has('Carte inconnue')).toBe(false);
    });

    it('une quête ne demande pas la stat citée', () => {
      expect(tagsOf('Assigns quests that require you to land basic attacks while equipped with a Boots item.').has('attacks')).toBe(false);
    });

    it('accélération citée dans un texte du 26.22', () => {
      expect(tagsOf('An ability of your choice gains damage based on your Ability Haste, but Ability Haste no longer reduces its cooldown.').has('haste')).toBe(true);
    });
  });

  describe('copie réelle du 3 nov.', () => {
    it.each([
      ['BEES!', []], // parti d'un sort : les effets à l'impact ne demandent pas d'attaquer
      ['Hellbent', ['heal']], // sorts ou attaques, et la réapparition ne monte pas avec tes PV
      ['Heavy is the Crown', []], // AD, AP et vitesse : marche sur tous les builds
      ['The Boom and the Bass', ['attacks']],
      ["Take'em Down Down Down", ['haste', 'heal']],
      ['Tickle Monster', ['attacks']], // tout passe en vitesse d'attaque
      ['Gift of the Drowned', []], // les PV partent en létalité
      ['Glass Cannon', []], // plafonne tes PV : pas une carte de tank
      ['Snowday', []], // l'accélération va à Mark, pas à ton build
      ['Spin to Win', []],
    ])('%s', (name, tags) => expect(novTags(name as string)).toEqual(tags));

    it('garde les vrais tags des cartes nouvelles', () => {
      expect(novTags('Sap Magic')).toContain('tank');
      expect(novTags('Porcupine')).toEqual(['tank']);
      expect(novTags('Big Shot')).toEqual(['ad', 'as', 'crit']);
      expect(novTags('Lonely Warrior')).toEqual(['as', 'tank']);
      expect(novTags('Lich Brain')).toEqual(['ap', 'tank']);
    });

    it('sait quelles cartes ne sortent plus', () => {
      const off = [...NOV].filter(([, v]) => neverDrawn(v.description)).map(([k]) => k);
      expect(off).toHaveLength(12);
      expect(off).toEqual(expect.arrayContaining(['vampirism', 'snapback', 'flashbang']));
      expect(neverDrawn(NOV.get('typhoon')!.description)).toBe(false);
    });

    it('sait quelles cartes sont réservées aux champions à distance', async () => {
      expect([...NOV].filter(([, v]) => rangedOnly(v.description)).map(([k]) => k)).toEqual(['drawyoursword']);
      const lua = readFileSync('test/fixtures/mayhem-augments-wiki-nov.lua', 'utf8');
      const info = new AugmentInfo(mkdtempSync(join(tmpdir(), 'augfit-')), async () => lua);
      await info.load();
      expect(info.drawable('Draw Your Sword')).toBe(true);
      expect(info.drawable('Draw Your Sword', true)).toBe(false);
      expect(info.drawable('Typhoon', true)).toBe(true);
    });

    it('ne conclut à la mêlée que sur une portée lue', () => {
      expect(isMelee(0)).toBe(false); // niveau 1 : le Live Client donne 0
      expect(isMelee(150)).toBe(true);
      expect(isMelee(250)).toBe(true); // Rell, vu en vrai
      expect(isMelee(525)).toBe(false);
    });

    it('une carte sans texte reste au pool', async () => {
      const lua = readFileSync('test/fixtures/mayhem-augments-wiki-nov.lua', 'utf8');
      const info = new AugmentInfo(mkdtempSync(join(tmpdir(), 'augfit-')), async () => lua);
      await info.load();
      expect(info.drawable('Vampirism')).toBe(false);
      expect(info.drawable('Typhoon')).toBe(true);
      expect(info.drawable('RISE')).toBe(true);
    });
  });
});
