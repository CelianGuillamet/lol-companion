// « Tenir compte de ce que tu as déjà » : un augment qui joue sur les critiques vaut plus si tu construis critique,
// moins si tu es full AP. Les winrates arammeta sont des moyennes sur le build habituel du champion ; on les corrige
// légèrement selon TON build en cours (items achetés + prochains achats prévus).
//
// Ce que fait chaque augment : description du wiki LoL (Module:MayhemAugmentData/data, CC BY-SA), lue par mots-clés.
// C'est une heuristique, pas une mesure : l'écart reste petit et la raison est toujours affichée.

import https from 'node:https';
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

/** Ce sur quoi joue un augment, d'après sa description. */
export function tagsOf(description: string): Set<FitTag> {
  const d = description.toLowerCase();
  const t = new Set<FitTag>();
  const ap = /ability power/.test(d);
  const ad = /attack damage/.test(d);
  if (/critical strike|crit/.test(d)) t.add('crit');
  if (/attack speed/.test(d)) t.add('as');
  if (/basic attack|on-hit|attacks? /.test(d)) t.add('attacks');
  // Un augment qui cite les deux (dégâts adaptatifs, ratios mixtes) ne penche ni AD ni AP
  if (ap && !ad) t.add('ap');
  if (ad && !ap) t.add('ad');
  if (/maximum health|bonus health|bonus armor|magic resist|resistances/.test(d)) t.add('tank');
  if (/\bheal|shield|omnivamp|life steal/.test(d)) t.add('heal');
  if (/ability haste|cooldown/.test(d)) t.add('haste');
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
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000, headers: { 'User-Agent': 'aram-companion (usage perso)' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('délai dépassé')));
  });
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

  async load(force = false): Promise<void> {
    const file = join(this.cacheDir, 'wiki-mayhem-augments.lua');
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

  tags(name: string): Set<FitTag> {
    const e = this.map.get(normName(name));
    return e ? tagsOf(e.description) : new Set();
  }
}
