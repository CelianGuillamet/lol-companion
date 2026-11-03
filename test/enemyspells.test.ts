import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CooldownData } from '../src/core/cooldowns';
import { EnemySpellTracker, type EnemyInput } from '../src/core/enemyspells';
import { ddFetcher } from './ddragon-fixture';

const FLASH = 'GeneratedTip_SummonerSpell_SummonerFlash_DisplayName';
const GHOST = 'GeneratedTip_SummonerSpell_SummonerHaste_DisplayName';
const TP = 'GeneratedTip_SummonerSpell_SummonerTeleport_DisplayName';

const ahri = (o: Partial<EnemyInput> = {}): EnemyInput => ({
  championId: 103,
  championName: 'Ahri',
  alias: 'Ahri',
  level: 11,
  dead: false,
  items: [],
  spells: [FLASH, GHOST],
  runeTrees: [8200, 8000], // Sorcellerie + Précision : aucune rune cachée de haste
  ...o,
});

// Formats exacts des captures
const DECEIVE = 'GeneratedTip_Spell_Augment_ARAM_ClownCollege_Deceive_DisplayName';
const POLTERGEIST = 'GeneratedTip_SummonerSpell_Augment_Poltergeist_DisplayName';

let data: CooldownData;
let clock = 1_000_000;
let tracker: EnemySpellTracker;

beforeEach(async () => {
  data = new CooldownData(mkdtempSync(join(tmpdir(), 'dd-')), ddFetcher());
  await data.load('16.21.1');
  await data.loadChampion('Ahri');
  clock = 1_000_000;
  tracker = new EnemySpellTracker(data, () => clock);
});

const spell = (p: ReturnType<EnemySpellTracker['panel']>, slot: 'R' | 'D' | 'F') => p.enemies[0].spells.find((s) => s.slot === slot)!;

describe('timers des sorts ennemis', () => {
  it('rien ne démarre sans signalement', () => {
    const p = tracker.update([ahri()], 100, 'sr');
    expect(p.enemies[0].spells.map((s) => s.readyAt)).toEqual([null, null, null]);
    expect(spell(p, 'D')).toMatchObject({ name: 'Flash', cooldown: 300, reliability: 'calculé' });
    expect(spell(p, 'R')).toMatchObject({ name: 'Spirit Rush', cooldown: 120, reliability: 'calculé' }); // rang 2 au niveau 11
  });

  it('Flash signalé avec des bottes de Lucidité : 300 × 100 / 110', () => {
    tracker.update([ahri({ items: [3158] })], 100, 'sr');
    const r = tracker.mark(103, 'D', 'cast', 100);
    expect(r.ok).toBe(true);
    const d = spell(tracker.panel(), 'D');
    expect(d.readyAt).toBeCloseTo(372.7, 1);
    expect(d.earliest).toBeNull(); // arbres visibles, pas d'Inspiration
  });

  it('ultime : rang déduit du niveau, haste d’ultime en plus', () => {
    tracker.update([ahri({ level: 16, items: [3118] })], 600, 'sr');
    tracker.mark(103, 'R', 'cast', 600);
    // rang 3 = 100 s, haste 20 + 20 d'ultime = 40 → 71,4 s
    expect(spell(tracker.panel(), 'R').readyAt).toBeCloseTo(671.4, 1);
  });

  it('haste achetée pendant le cooldown : le temps restant est recalculé', () => {
    tracker.update([ahri()], 100, 'sr');
    tracker.mark(103, 'R', 'cast', 100); // 120 s → 220
    tracker.update([ahri({ items: [3118] })], 160, 'sr'); // reste 60 s à 0 haste ; 40 haste maintenant
    expect(spell(tracker.panel(), 'R').readyAt).toBeCloseTo(160 + (60 * 100) / 140, 1);
  });

  it('ultime pas débloqué : verrouillé, signalement refusé', () => {
    tracker.update([ahri({ level: 4 })], 100, 'sr');
    expect(spell(tracker.panel(), 'R')).toMatchObject({ locked: true, cooldown: null });
    expect(tracker.mark(103, 'R', 'cast', 100).ok).toBe(false);
  });

  it('runes invisibles : « au plus tôt » affiché, temps principal inchangé', () => {
    tracker.update([ahri({ runeTrees: null })], 100, 'aram');
    tracker.mark(103, 'D', 'cast', 100);
    const d = spell(tracker.panel(), 'D');
    expect(d.readyAt).toBeCloseTo(100 + (300 * 100) / 170, 0);
    expect(d.earliest).toBeCloseTo(100 + (300 * 100) / 188, 1); // Cosmic Insight possible
  });

  it('ARAM et Mayhem : 70 haste d\'invocateur pour tous, Flash à 176 s et pas 300', () => {
    for (const mode of ['aram', 'mayhem'] as const) {
      const p = tracker.update([ahri()], 100, mode);
      expect(spell(p, 'D').cooldown).toBeCloseTo(176.5, 1);
      expect(spell(p, 'F').cooldown).toBeCloseTo((240 * 100) / 170, 0);
      expect(spell(p, 'D').detail).toContain('70 haste d’invocateur du mode');
    }
    expect(spell(tracker.update([ahri()], 100, 'sr'), 'D').cooldown).toBe(300);
  });

  it('la haste du mode s\'ajoute à celle des objets, sans toucher l\'ultime', () => {
    const p = tracker.update([ahri({ items: [3158] })], 100, 'aram'); // bottes de Lucidité : 10 haste d'invocateur
    expect(spell(p, 'D').cooldown).toBeCloseTo((300 * 100) / 180, 1);
    expect(spell(p, 'R').cooldown).toBeCloseTo((120 * 100) / 110, 1);
  });

  it('Mayhem : runes désactivées, jamais de « au plus tôt »', () => {
    tracker.update([ahri({ runeTrees: null })], 100, 'mayhem');
    tracker.mark(103, 'D', 'cast', 100);
    tracker.mark(103, 'R', 'cast', 100);
    const p = tracker.panel();
    expect(spell(p, 'D').earliest).toBeNull();
    expect(spell(p, 'R').earliest).toBeNull();
    expect(spell(p, 'R').detail).not.toContain('rune');
    expect(spell(p, 'D').reliability).toBe('approx'); // augments adverses inconnus
  });

  it('équilibrage du mode : compte sur l\'ultime, pas sur les sorts d\'invocateur', () => {
    const up = tracker.update([ahri({ balanceHaste: 20 })], 100, 'aram');
    expect(spell(up, 'R').cooldown).toBeCloseTo((120 * 100) / 120, 1);
    expect(spell(up, 'R').detail).toContain('+20 d’équilibrage du mode');
    expect(spell(up, 'D').cooldown).toBeCloseTo(176.5, 1);
    // Malus plus grand que la haste des objets : pas de cooldown allongé, le jeu affiche 0 pour Ziggs (−20) en début de partie.
    expect(spell(tracker.update([ahri({ balanceHaste: -20 })], 100, 'aram'), 'R').cooldown).toBe(120);
  });

  it('Téléportation : toujours approximative', () => {
    const p = tracker.update([ahri({ spells: [FLASH, TP] })], 100, 'sr');
    expect(spell(p, 'F')).toMatchObject({ name: 'Teleport', reliability: 'approx' });
  });

  it('annuler, décaler, et le sort revient tout seul', () => {
    tracker.update([ahri()], 100, 'sr');
    tracker.mark(103, 'D', 'cast', 100);
    expect(tracker.mark(103, 'D', 'shift', 105, -10).ok).toBe(true);
    expect(spell(tracker.panel(), 'D').readyAt).toBe(390);
    tracker.update([ahri()], 390.5, 'sr');
    expect(spell(tracker.panel(), 'D').readyAt).toBeNull();
    tracker.mark(103, 'F', 'cast', 400);
    tracker.mark(103, 'F', 'clear', 401);
    expect(spell(tracker.panel(), 'F').readyAt).toBeNull();
    expect(tracker.mark(103, 'F', 'shift', 402, 5).ok).toBe(false);
  });

  it('cooldown inconnu : pas de faux timer', () => {
    const empty = new CooldownData(mkdtempSync(join(tmpdir(), 'dd-')), async () => {
      throw new Error('hors ligne');
    });
    const t = new EnemySpellTracker(empty, () => clock);
    const p = t.update([ahri()], 100, 'sr');
    expect(spell(p, 'R')).toMatchObject({ reliability: 'inconnu', cooldown: null });
    expect(t.mark(103, 'R', 'cast', 100).ok).toBe(false);
    // Flash : valeur de secours, signalée approximative
    expect(spell(p, 'D')).toMatchObject({ cooldown: 300, reliability: 'approx' });
    expect(p.warning).toMatch(/Data Dragon injoignable/);
  });

  it('horloge : recalée seulement si le temps de jeu dérive (pause)', () => {
    const a = tracker.update([ahri()], 100, 'sr').clockOffset;
    clock += 1000;
    expect(tracker.update([ahri()], 101.2, 'sr').clockOffset).toBe(a); // 0,2 s d'écart : gardé
    clock += 10_000;
    expect(tracker.update([ahri()], 101.2, 'sr').clockOffset).toBeCloseTo(a + 9.8, 1); // 10 s de pause moins les 0,2 s de jeu écoulées
  });

  it('sort donné par un augment : son nom, pas de timer inventé', () => {
    const p = tracker.update([ahri({ spells: [DECEIVE, POLTERGEIST], spellNames: ['Deceive', 'Poltergeist'] })], 100, 'mayhem');
    const [d, f] = p.enemies[0].spells.filter((x) => x.slot !== 'R');
    expect([d.name, f.name]).toEqual(['Deceive', 'Poltergeist']);
    expect([d.cooldown, f.cooldown, d.reliability]).toEqual([null, null, 'inconnu']);
  });
});
