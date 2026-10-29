// Données ARAM: Mayhem publiques d'arammeta.com (projet Lanternko/ARAM-Mayhem-Database, MIT).
// tier-list.json : champions, augments, modèle de composition ; champions/{id}.json : détail par champion.

import https from 'node:https';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface MetaComp {
  phys: number;
  magic: number;
  true?: number;
  front: number;
  damage: number;
  engage: number;
  wave: number;
  poke: number;
  sustain: number;
  cc: number;
}

export interface MetaPair {
  id: number;
  g: number;
  wr: number;
  lift: number;
}

export interface MetaChampion {
  name_en: string;
  alias: string;
  tags: string[];
  wr: number;
  g: number;
  comp?: MetaComp;
  pairs?: MetaPair[];
}

export interface MetaAugment {
  name_en: string;
  rarity: string;
  icon?: string;
  lift?: number;
  /** Tous champions, par choix 1 à 4 : [parties, winrate, lift vs la moyenne de ce choix, exact]. */
  slots?: ([number, number, number, number] | null)[];
  wr?: number;
  g?: number;
}

export interface CompositionConfig {
  clamp?: number;
  lack_thresholds?: Record<string, number>;
  table_weights?: Record<string, number>;
  tables?: Record<string, Record<string, number>>;
}

export interface TierList {
  champs: Record<string, MetaChampion>;
  augs: Record<string, MetaAugment>;
  patch_prefix: string;
  recommendation_composition?: CompositionConfig;
  detailBase?: string;
  ddv?: string;
  itemLut?: Record<string, { e?: string; p?: number }>;
}

export interface DetailRow {
  id: number;
  g: number;
  wr: number;
  lift?: number;
  /** Par choix 1 à 4 (début, niv. 7, 11, 15) sur ce champion ; null si jamais pris à ce moment. */
  slots?: ({ g: number; wr: number; lift?: number; show?: number } | null)[];
}

export interface NamedRow {
  name_en: string;
  slug: string;
  g: number;
  wr: number;
}

export interface ChampionDetail {
  top?: Partial<Record<'kPrismatic' | 'kGold' | 'kSilver', DetailRow[]>>;
  bot?: Partial<Record<'kPrismatic' | 'kGold' | 'kSilver', DetailRow[]>>;
  items?: { top?: NamedRow[] };
  singleItems?: { top?: NamedRow[] };
  boots?: { top?: NamedRow[] };
  spells?: { top?: NamedRow[] };
  augTypes?: { top?: { name_en: string; slug: string; g: number; wr: number; lift: number; pick?: number }[]; bot?: { name_en: string; slug: string; g: number; wr: number; lift: number; pick?: number }[] };
  poolAugments?: { id: number; g: number; wr: number; pick: number }[];
  itemClusters?: {
    groups?: {
      name_en: string;
      core: { id: number }[];
      options?: { id: number; g: number; wr: number }[];
      g: number;
      wr: number;
      pick?: number;
    }[];
  };
}

const BASE = 'https://arammeta.com';
const MAX_AGE_MS = 12 * 3600 * 1000;

function download(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000, headers: { 'User-Agent': 'aram-companion (usage perso)' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} (${url})`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`délai dépassé (${url})`)));
  });
}

export class Arammeta {
  tierList: TierList | null = null;
  loadedAt: number | null = null;
  private details = new Map<number, ChampionDetail>();

  constructor(
    private cacheDir: string,
    private fetcher: (url: string) => Promise<string> = download,
  ) {}

  private async cached(rel: string, force = false): Promise<string> {
    const file = join(this.cacheDir, rel.replace(/\//g, '_'));
    if (!force) {
      try {
        const s = await stat(file);
        if (Date.now() - s.mtimeMs < MAX_AGE_MS) return await readFile(file, 'utf8');
      } catch {
        /* pas en cache */
      }
    }
    try {
      const body = await this.fetcher(`${BASE}/${rel}`);
      JSON.parse(body); // valide avant d'écrire
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(file, body);
      return body;
    } catch (err) {
      // Hors ligne : on retombe sur le cache même périmé
      try {
        return await readFile(file, 'utf8');
      } catch {
        throw err;
      }
    }
  }

  async load(force = false): Promise<TierList> {
    this.tierList = JSON.parse(await this.cached('api/tier-list.json', force)) as TierList;
    this.loadedAt = Date.now();
    if (force) this.details.clear();
    return this.tierList;
  }

  async detail(championId: number): Promise<ChampionDetail | null> {
    if (this.details.has(championId)) return this.details.get(championId)!;
    const base = (this.tierList?.detailBase || 'api/champions').replace(/^\/+/, '');
    try {
      const d = JSON.parse(await this.cached(`${base}/${championId}.json`)) as ChampionDetail;
      this.details.set(championId, d);
      return d;
    } catch {
      return null;
    }
  }

  champion(id: number): MetaChampion | null {
    return this.tierList?.champs[String(id)] ?? null;
  }

  augmentIconUrl(id: number): string | null {
    const icon = this.tierList?.augs[String(id)]?.icon;
    return icon ? `${BASE}/${icon.replace(/^\/+/, '')}` : null;
  }
}
