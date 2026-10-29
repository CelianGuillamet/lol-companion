// Données statiques servies par le client lui-même (dans la langue du client).

import type { LcuClient } from './lcu';
import type { IconItem } from './types';

interface ChampionSummary {
  id: number;
  name: string;
  alias: string;
}

interface CherryAugment {
  id: number;
  nameTRA?: string;
  name?: string;
  augmentSmallIconPath?: string;
  rarity?: string;
}

interface Asset {
  id: number;
  name: string;
  iconPath?: string;
  priceTotal?: number; // items.json
  categories?: string[]; // items.json, ex. ["Boots"]
  from?: number[]; // items.json : composants
  to?: number[]; // items.json : items construits à partir de celui-ci
  specialRecipe?: number; // items.json : item de base d'un item transformé (Fimbulwinter → Winter's Approach)
}

// Les chemins /lol-game-data/assets/... du client sont publiés par CommunityDragon (sans authentification).
export function cdragonUrl(lcuAssetPath: string | undefined): string | null {
  if (!lcuAssetPath) return null;
  const rest = lcuAssetPath.replace(/^\/lol-game-data\/assets\//i, '').toLowerCase();
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${rest}`;
}

export function championIconUrl(id: number): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;
}

/** Clé interne non traduite (ex. « GoH_PentakillAug_Generic_BlankName ») au lieu d'un nom affichable. */
export function isRawKey(s: string): boolean {
  return /^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/.test(s);
}

/** « GoH_PentakillAug_Generic_BlankName » → « Pentakill (headliner) ». */
export function prettyKey(s: string): string {
  const parts = s.split('_').filter((p) => !/^(GoH|Generic|BlankName|Name|Aug|Augment)$/i.test(p)).map((p) => p.replace(/Aug(ment)?$/, ''));
  const name = parts.filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || s;
  return /^GoH_/i.test(s) ? `${name} (headliner)` : name;
}

const SPELL_FALLBACK: Record<number, [string, string]> = {
  1: ['SummonerBoost', 'Cleanse'],
  3: ['SummonerExhaust', 'Exhaust'],
  4: ['SummonerFlash', 'Flash'],
  6: ['SummonerHaste', 'Ghost'],
  7: ['SummonerHeal', 'Heal'],
  13: ['SummonerMana', 'Clarity'],
  14: ['SummonerDot', 'Ignite'],
  21: ['SummonerBarrier', 'Barrier'],
  32: ['SummonerSnowball', 'Mark'],
};

export class GameData {
  champions = new Map<number, ChampionSummary>();
  augments = new Map<number, CherryAugment>();
  items = new Map<number, Asset>();
  perks = new Map<number, Asset>();
  perkStyles = new Map<number, Asset>();
  spells = new Map<number, Asset>();
  ddragonVersion = '16.21.1'; // repli pour les icônes d'items (mis à jour depuis arammeta)
  private loaded = false;

  async load(lcu: LcuClient): Promise<void> {
    if (this.loaded) return;
    const champs = await lcu.get<ChampionSummary[]>('/lol-game-data/assets/v1/champion-summary.json');
    if (Array.isArray(champs)) for (const c of champs) if (c.id > 0) this.champions.set(c.id, c);
    const augs = await lcu.get<CherryAugment[]>('/lol-game-data/assets/v1/cherry-augments.json');
    if (Array.isArray(augs)) for (const a of augs) this.augments.set(a.id, a);
    const fill = async (path: string, map: Map<number, Asset>) => {
      const rows = await lcu.get<Asset[]>(path);
      if (Array.isArray(rows)) for (const r of rows) if (r && r.name) map.set(r.id, r);
    };
    await fill('/lol-game-data/assets/v1/items.json', this.items);
    await fill('/lol-game-data/assets/v1/perks.json', this.perks);
    await fill('/lol-game-data/assets/v1/summoner-spells.json', this.spells);
    const styles = await lcu.get<{ styles?: Asset[] }>('/lol-game-data/assets/v1/perkstyles.json');
    for (const st of styles?.styles ?? []) this.perkStyles.set(st.id, st);
    this.loaded = this.champions.size > 0;
  }

  /** "6333+123430" -> "Danse de la mort + Rite de ruine" (repli : nom anglais fourni). */
  itemComboName(slug: string, fallback: string): string {
    const ids = slug.split('+').map(Number);
    const names = ids.map((id) => this.items.get(id)?.name);
    return names.every(Boolean) ? names.join(' + ') : fallback;
  }

  item(id: number, fallbackName?: string): IconItem {
    const a = this.items.get(id);
    return {
      id,
      name: a?.name ?? fallbackName ?? `#${id}`,
      icon: cdragonUrl(a?.iconPath) ?? `https://ddragon.leagueoflegends.com/cdn/${this.ddragonVersion}/img/item/${id}.png`,
    };
  }

  itemPrice(id: number): number | null {
    return this.items.get(id)?.priceTotal ?? null;
  }

  components(id: number): number[] {
    return this.items.get(id)?.from ?? [];
  }

  specialRecipe(id: number): number | null {
    return this.items.get(id)?.specialRecipe || null;
  }

  /** Item fini (pas un composant) : bottes complètes, ou item sans évolution d'au moins 1500 or. */
  isComplete(id: number): boolean {
    const a = this.items.get(id);
    if (!a) return false;
    const p = a.priceTotal ?? 0;
    if (this.isBoots(id)) return p >= 900;
    return p >= 1500 && !(a.to?.length);
  }

  /** Catégories du client (« Armor », « SpellBlock », « Health », « LifeSteal »…). */
  categories(id: number): string[] {
    return this.items.get(id)?.categories ?? [];
  }

  isBoots(id: number): boolean {
    return this.items.get(id)?.categories?.includes('Boots') ?? false;
  }

  perk(id: number, fallbackName?: string): IconItem {
    const a = this.perks.get(id);
    return { id, name: a?.name ?? fallbackName ?? `#${id}`, icon: cdragonUrl(a?.iconPath) };
  }

  perkStyle(id: number, fallbackName?: string): IconItem {
    const a = this.perkStyles.get(id);
    return { id, name: a?.name ?? fallbackName ?? `#${id}`, icon: cdragonUrl(a?.iconPath) };
  }

  spell(id: number, fallbackName?: string): IconItem {
    const a = this.spells.get(id);
    if (a) return { id, name: a.name, icon: cdragonUrl(a.iconPath) };
    // Client fermé : noms et icônes Data Dragon des sorts d'ARAM
    const f = SPELL_FALLBACK[id];
    return {
      id,
      name: fallbackName ?? f?.[1] ?? `#${id}`,
      icon: f ? `https://ddragon.leagueoflegends.com/cdn/${this.ddragonVersion}/img/spell/${f[0]}.png` : null,
    };
  }

  championName(id: number, fallback?: string): string {
    return this.champions.get(id)?.name ?? fallback ?? `#${id}`;
  }

  championAlias(id: number): string | undefined {
    return this.champions.get(id)?.alias;
  }

  championIdByAlias(alias: string): number | null {
    const a = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const c of this.champions.values()) {
      if (c.alias.toLowerCase() === a || c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === a) return c.id;
    }
    return null;
  }

  augmentName(id: number, fallback?: string): string {
    const a = this.augments.get(id);
    const raw = a?.nameTRA || a?.name || '';
    if (raw && !isRawKey(raw)) return raw;
    return fallback || (raw ? prettyKey(raw) : `#${id}`);
  }

  /**
   * Augment encore dans le jeu ? Le client ne liste que les augments du patch en cours ; arammeta mélange encore
   * des parties du patch précédent (augments retirés). On ne filtre que si la liste du client est complète.
   */
  augmentExists(id: number): boolean {
    return this.augments.size < 100 || this.augments.has(id);
  }

  /** Marqueur de headliner (ex. Pentakill = 3176) : le client n'a qu'une clé interne comme nom. */
  isHeadlinerMarker(id: number): boolean {
    const a = this.augments.get(id);
    return /^GoH_/i.test(a?.nameTRA || a?.name || '');
  }

  augmentIcon(id: number): string | null {
    return cdragonUrl(this.augments.get(id)?.augmentSmallIconPath);
  }
}
