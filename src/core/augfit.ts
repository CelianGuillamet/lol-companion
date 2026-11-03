// « Tenir compte de ce que tu as déjà » : un augment qui joue sur les critiques vaut plus si tu construis critique,
// moins si tu es full AP. Les winrates arammeta sont des moyennes sur le build habituel du champion ; on les corrige
// légèrement selon TON build en cours (items achetés + prochains achats prévus).
//
// Ce que fait chaque augment : description du wiki LoL (Module:MayhemAugmentData/data, CC BY-SA), lue par mots-clés.
// C'est une heuristique, pas une mesure : l'écart reste petit et la raison est toujours affichée.

import { download as fetchText } from './http';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type FitTag = 'crit' | 'as' | 'ad' | 'ap' | 'attacks' | 'tank' | 'heal' | 'haste';

export const TAG_LABEL: Record<FitTag, string> = {
  crit: 'critiques',
  as: 'vitesse d’attaque',
  ad: 'dégâts physiques',
  ap: 'puissance',
  attacks: 'attaques de base',
  tank: 'santé et résistances',
  heal: 'soins et boucliers',
  haste: 'accélération',
};

const WIKI_URL = 'https://wiki.leagueoflegends.com/en-us/Module:MayhemAugmentData/data?action=raw';
const MAX_AGE_MS = 24 * 3600 * 1000;

export const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(mayhem\)/g, '')
    .replace(/^quest:\s*/, '')
    .replace(/[^a-z0-9]/g, '');

/** Entrées ["Nom"] = { ["description"] = "…", ["tier"] = "…" } du module Lua. */
export function parseAugmentModule(lua: string): Map<string, { description: string; tier: string }> {
  const out = new Map<string, { description: string; tier: string }>();
  const re = /\["([^"]+)"\]\s*=\s*\{([\s\S]*?)\n\s*\},?/g;
  for (const m of lua.matchAll(re)) {
    const body = m[2];
    const desc = body.match(/\["description"\]\s*=\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    if (!desc) continue;
    const tier = body.match(/\["tier"\]\s*=\s*"([^"]*)"/)?.[1] ?? '';
    const shown = body.match(/\["displayname"\]\s*=\s*"([^"]*)"/)?.[1];
    out.set(normName(m[1]), { description: desc, tier });
    if (shown) out.set(normName(shown), { description: desc, tier });
  }
  return out;
}

/** Texte lisible d'une description du wiki : sans gras, sans liens, modèles {{...}} remplacés par ce qu'ils affichent. */
export function plainText(description: string): string {
  let t = description
    .replace(/'{2,}/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[\[File:[^\]]*\]\]/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  // Du plus profond vers l'extérieur. tip et sti : 1er argument = la clé, le dernier = le texte affiché.
  for (let last = ''; last !== t; ) {
    last = t;
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => {
      const [name, ...args] = inner.split('|').filter((x) => !x.includes('='));
      if (!args.length) return '';
      return /^(tip|sti|stil)$/i.test(name.trim()) ? args[args.length - 1] : args[0];
    });
  }
  return t.replace(/\s+/g, ' ').trim();
}

/** Texte où un mot-clé ne dit rien de ton build : les PV de la cible, un seuil de PV, le sort d'un allié, un délai. */
function withoutNoise(text: string): string {
  return text
    .replace(/(?:the target's|target's|their|enemy's)\s+(?:maximum|current|missing)\s+health/gi, '')
    .replace(/(?:below|above)\s+[\d.]+%\s+(?:of your\s+)?(?:maximum\s+)?health/gi, '')
    .replace(/(?:dropping|falling)\s+below\s+[\d.]+%\s+(?:of your\s+)?maximum\s+health/gi, '')
    .replace(/your ally's next basic attack/gi, '')
    .replace(/enemy champion to use a basic attack(?: on-hit)?/gi, '')
    // Les stats d'une créature invoquée (Tibbers de DropBear) ne sont pas les tiennes
    .replace(/\bHe gains [^.]*attack speed[^.]*\.|\bHis stats are:.*$/gis, '');
}

// L'effet part d'un sort, ou d'une attaque OU d'un sort : il marche sans attaquer et sans critiques
const TRIGGERED_BY_SPELL =
  /basic attacks? (?:or|and) (?:ability|abilities)|your abilities (?:apply|can now)|damaging abilities|ability hits?\b|damaging an enemy champion with an ability|replace a summoner spell/i;
// Récompenses tirées au hasard, quêtes : la stat citée n'est pas ce que la carte demande
const NO_SCALING = /randomly appear|assigned with a number of quests|^assigns quests/i;
// Le jeu ne propose ces cartes qu'aux sorts qui en profitent, ou elles te donnent un sort : la stat citée vient avec la carte
const COMES_WITH_CARD = /^upgrades one of your champion's abilities|^replace a summoner spell/i;
// Convertit une stat en une autre : on ne dépend d'aucune des 2
const CONVERTS = /^convert all of your/i;
// Bonus de 4 s après une élimination (Get Excited!) : ne dépend pas de ton build
const SHORT_BURST = /^scoring a (?:champion )?takedown grants you/i;
// Les critiques portent sur tes soins, pas sur tes attaques (Critical Healing)
const CRIT_ON_HEALS = /your heals and shields now have a chance/i;

/**
 * Ce sur quoi joue un augment, d'après sa description. `crit`, `as`, `ad`, `ap` et `attacks` peuvent donner un malus
 * (voir `fitOf`) : ne les poser que si la carte en dépend vraiment. Mots lus sur les 202 descriptions du wiki :
 * « attack damage » ou « attack range » ne sont pas des attaques de base, « health » n'est pas un soin, « critters »
 * n'est pas un critique, « (8 second cooldown) » n'est pas de l'accélération, « per 100 base AD » monte avec le niveau,
 * pas avec tes items.
 */
export function tagsOf(description: string): Set<FitTag> {
  const plain = withoutNoise(plainText(description));
  const d = plain.toLowerCase();
  const t = new Set<FitTag>();
  const spell = TRIGGERED_BY_SPELL.test(plain);
  const ap = /ability power/.test(d) || /\d%\s+(?:bonus\s+)?AP\b|per \d+ (?:bonus )?AP\b/.test(plain);
  const ad = /attack damage/.test(d) || /\d%\s+(?:bonus\s+|total\s+)?AD\b|per \d+ (?:bonus )?AD\b/.test(plain);
  if (/critical(?:ly)? strike/.test(d) && !spell && !/can (?:now )?critically strike|critical defend/.test(d)) t.add('crit');
  if (/attack speed/.test(d)) t.add('as');
  if (/(?:^|[.:>]\s*)basic attacks?\b|\byour (?:next |damaging )*(?:basic |energized )attacks?\b|\bon-hit\b|^gain [\d ]+bonus attack range/.test(d) && !spell) t.add('attacks');
  // Un augment qui cite les deux (dégâts adaptatifs, ratios mixtes) ne penche ni AD ni AP
  if (ap && !ad) t.add('ap');
  if (ad && !ap) t.add('ad');
  if (/maximum health|bonus health|bonus armor|bonus magic resist|bonus resist|critical defend/.test(d)) t.add('tank');
  if (/\bheal(?:s|ing|ed)?\b|(?<!spell )\bshields?\b|shielding|omnivamp|life steal/.test(d)) t.add('heal');
  if (/ability haste|ultimate haste/.test(d)) t.add('haste');
  if (SHORT_BURST.test(plain)) t.delete('as');
  if (CRIT_ON_HEALS.test(plain)) t.delete('crit');
  if (CONVERTS.test(plain) || NO_SCALING.test(plain) || COMES_WITH_CARD.test(plain)) for (const k of ['ad', 'ap', 'as', 'attacks', 'crit'] as FitTag[]) t.delete(k);
  return t;
}

/** Profil de ton build : part de chaque type parmi tes items (achetés comptent double, prévus simple). */
export function buildProfile(owned: number[], planned: number[], cat: (id: number) => string[]): Record<FitTag, number> {
  const p: Record<FitTag, number> = { crit: 0, as: 0, ad: 0, ap: 0, attacks: 0, tank: 0, heal: 0, haste: 0 };
  let n = 0;
  const add = (id: number, w: number) => {
    const c = cat(id);
    if (!c.length || c.includes('Boots') || c.includes('Consumable')) return;
    n += w;
    if (c.includes('CriticalStrike')) p.crit += w;
    if (c.includes('AttackSpeed')) p.as += w;
    if (c.includes('Damage')) p.ad += w;
    if (c.includes('SpellDamage')) p.ap += w;
    if (c.includes('AttackSpeed') || c.includes('OnHit') || c.includes('CriticalStrike')) p.attacks += w;
    if (c.includes('Health') || c.includes('Armor') || c.includes('SpellBlock')) p.tank += w;
    if (c.includes('LifeSteal') || c.includes('SpellVamp') || c.includes('Omnivamp')) p.heal += w;
    if (c.includes('AbilityHaste') || c.includes('CooldownReduction')) p.haste += w;
  };
  for (const id of owned) add(id, 2);
  for (const id of planned) add(id, 1);
  if (n) for (const k of Object.keys(p) as FitTag[]) p[k] /= n;
  return p;
}

export interface Fit {
  delta: number; // points de winrate (0,02 = +2 points)
  why: string | null;
  good: boolean;
}

/**
 * Écart à appliquer au winrate d'un augment selon ton build. Bonus si ton build pousse ce que l'augment exploite,
 * malus si l'augment exploite une stat que tu n'as pas du tout (augment critique sur un build sans critiques).
 * Plafonné à ±4 points : les données de winrate restent la base.
 */
export function fitOf(tags: Set<FitTag>, profile: Record<FitTag, number>, itemsSeen: number): Fit {
  // Pas assez d'items connus (ou catégories d'items indisponibles, client fermé) : on ne corrige rien
  if (!tags.size || itemsSeen < 2 || !Object.values(profile).some((v) => v > 0)) return { delta: 0, why: null, good: true };
  const scaling: FitTag[] = ['crit', 'as', 'ad', 'ap', 'attacks'];
  const match = [...tags].filter((t) => profile[t] >= 0.5);
  const miss = [...tags].filter((t) => scaling.includes(t) && profile[t] === 0);
  // Un augment AP sur un build AD (ou l'inverse) : vraie contradiction
  if (miss.length && !match.length) {
    const d = -Math.min(0.04, 0.025 * miss.length);
    return { delta: d, why: `ne va pas avec ton build (${miss.map((t) => TAG_LABEL[t]).join(', ')})`, good: false };
  }
  if (match.length) {
    const d = Math.min(0.04, 0.015 * match.length + (match.some((t) => profile[t] >= 0.75) ? 0.01 : 0));
    return { delta: d, why: `va avec ton build (${match.map((t) => TAG_LABEL[t]).join(', ')})`, good: true };
  }
  return { delta: 0, why: null, good: true };
}

function download(url: string): Promise<string> {
  return fetchText(url, 30000);
}

/** Descriptions des augments Mayhem (wiki, cache 24 h). Sans réseau ni cache : pas de correction, rien d'inventé. */
export class AugmentInfo {
  private map = new Map<string, { description: string; tier: string }>();

  constructor(
    private cacheDir: string,
    private fetcher: (url: string) => Promise<string> = download,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get file(): string {
    return join(this.cacheDir, 'wiki-mayhem-augments.lua');
  }

  async load(force = false): Promise<void> {
    const file = this.file;
    let text: string | null = null;
    try {
      const s = await stat(file);
      if (!force && Date.now() - s.mtimeMs < MAX_AGE_MS) text = await readFile(file, 'utf8');
    } catch {
      /* pas en cache */
    }
    if (!text) {
      try {
        text = await this.fetcher(WIKI_URL);
        if (parseAugmentModule(text).size >= 50) {
          await mkdir(this.cacheDir, { recursive: true });
          await writeFile(file, text);
        }
      } catch {
        text = await readFile(file, 'utf8').catch(() => null);
      }
    }
    const parsed = text ? parseAugmentModule(text) : null;
    if (parsed && parsed.size >= 50) this.map = parsed;
  }

  /** Carte dont on a le texte : sans lui, pas de correction, ni bonus ni malus. */
  has(name: string): boolean {
    return this.map.has(normName(name));
  }

  tags(name: string): Set<FitTag> {
    const e = this.map.get(normName(name));
    return e ? tagsOf(e.description) : new Set();
  }
}
