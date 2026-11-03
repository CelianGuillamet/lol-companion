// Cooldowns des sorts d'invocateur et des ultimes, calculés depuis Data Dragon (données officielles Riot, par patch).
// Rien n'est lu dans le jeu au-delà de l'API Live Client : objets, niveau, sorts équipés et arbres de runes visibles.
// Le lancement d'un sort ennemi n'est jamais détecté : c'est toi qui le signales (politique Riot, docs/AGENT.md).

import https from 'node:https';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Haste qu'apporte un objet, lue dans sa description Data Dragon (en_US). */
export interface ItemHaste {
  ability: number;
  ultimate: number;
  summoner: number;
}

export interface UltimateInfo {
  name: string;
  /** Cooldown de base par rang, en secondes. */
  cooldown: number[];
  maxrank: number;
  icon: string;
}

export interface SummonerInfo {
  name: string;
  cooldown: number;
  icon: string;
}

/**
 * Description d'objet Data Dragon → haste. Le bloc <stats> donne l'Ability Haste fixe ; le passif peut ajouter de la
 * haste d'ultime (Malignance) ou de sorts d'invocateur (bottes de Lucidité). Haste conditionnelle ou à cumuls : ignorée.
 */
export function parseItemHaste(description: string): ItemHaste {
  const strip = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const stats = strip(description.match(/<stats>([\s\S]*?)<\/stats>/i)?.[1] ?? '');
  const all = strip(description);
  const num = (re: RegExp, s: string) => Number(s.match(re)?.[1] ?? 0);
  return {
    ability: num(/(\d+)\s+Ability Haste/i, stats),
    ultimate: num(/(\d+)\s+Ultimate (?:Ability )?Haste/i, all),
    summoner: num(/(\d+)\s+Summoner Spell Haste/i, all),
  };
}

/** « GeneratedTip_SummonerSpell_SummonerFlash_DisplayName » → « SummonerFlash ». */
export function summonerKey(raw: string | undefined): string | null {
  const m = raw?.match(/SummonerSpell_(\w+?)_(?:DisplayName|Description)$/);
  return m ? m[1] : null;
}

/**
 * Sort d'invocateur remplacé par un augment de Mayhem. Vu dans les captures : Clown College donne Deceive
 * (« GeneratedTip_Spell_Augment_ARAM_ClownCollege_Deceive_DisplayName »), Poltergeist
 * (« GeneratedTip_SummonerSpell_Augment_Poltergeist_DisplayName »).
 */
export function isAugmentSpell(raw: string | null | undefined): boolean {
  return !!raw && /_Augment_/.test(raw);
}

/** Cooldown réel avec une haste donnée (formule du jeu depuis la saison 11). */
export function withHaste(base: number, haste: number): number {
  return (base * 100) / (100 + Math.max(0, haste));
}

/**
 * Rang de l'ultime d'après le niveau du champion, en supposant qu'il le monte dès que possible (6 / 11 / 16).
 * Champions à 4 rangs (R dès le niveau 1 : Jayce, Elise, Nidalee, Udyr, Karma…) : 1 / 6 / 11 / 16.
 */
export function ultRank(level: number, maxrank: number): number {
  const steps = maxrank >= 4 ? [1, 6, 11, 16] : [6, 11, 16];
  return steps.filter((l) => level >= l).length;
}

/**
 * Temps restant quand la haste change pendant le cooldown : le jeu applique la nouvelle haste au temps restant.
 * remaining' = remaining × (100 + ancienne) / (100 + nouvelle).
 */
export function rescale(remaining: number, oldHaste: number, newHaste: number): number {
  return (remaining * (100 + Math.max(0, oldHaste))) / (100 + Math.max(0, newHaste));
}

/**
 * Haste que l'API Live Client ne montre pas pour un ennemi : runes mineures. Elles ne servent qu'à afficher « au plus
 * tôt », jamais le temps principal. Valeurs du wiki LoL (saison 2026), à revérifier si Riot change ces runes.
 */
export const HIDDEN = {
  /** Cosmic Insight (arbre Inspiration) : +18 haste des sorts d'invocateur. */
  cosmicInsight: { tree: 8300, summoner: 18 },
  /** Ultimate Hunter (arbre Domination) : jusqu'à +31 haste d'ultime (6 + 5 par cumul, 5 cumuls). */
  ultimateHunter: { tree: 8100, ultimate: 31 },
};

/**
 * Haste d'invocateur donnée à tous par l'aura de l'Abîme hurlant (wiki LoL, page ARAM : « +70 summoner spell haste ») ;
 * Mayhem garde les règles de l'ARAM. Data Dragon ne la compte pas : son Flash vaut 300 s, 176 s dans ces modes.
 */
export const ARAM_SUMMONER_HASTE = 70;

/** Sorts dont le cooldown dépend d'autre chose que la haste : affichés « approximatif ». */
export const APPROX_SUMMONERS: Record<string, string> = {
  SummonerTeleport: 'Téléportation change avec le niveau (Unleashed) : base Data Dragon seulement',
  SummonerSmite: 'Châtiment a des charges : temps d’une charge seulement',
};

/** Repli si Data Dragon est injoignable (valeurs DDragon 16.21.1). Toujours marqué approximatif. */
export const SUMMONER_FALLBACK: Record<string, { name: string; cooldown: number }> = {
  SummonerFlash: { name: 'Flash', cooldown: 300 },
  SummonerHaste: { name: 'Fantôme', cooldown: 240 },
  SummonerHeal: { name: 'Soins', cooldown: 240 },
  SummonerBarrier: { name: 'Barrière', cooldown: 180 },
  SummonerBoost: { name: 'Purge', cooldown: 240 },
  SummonerExhaust: { name: 'Fatigue', cooldown: 240 },
  SummonerDot: { name: 'Embrasement', cooldown: 180 },
  SummonerSnowball: { name: 'Marque', cooldown: 80 },
  SummonerMana: { name: 'Clarté', cooldown: 240 },
  SummonerTeleport: { name: 'Téléportation', cooldown: 300 },
  SummonerSmite: { name: 'Châtiment', cooldown: 15 },
};

function download(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000, headers: { 'User-Agent': 'aram-companion (usage perso)' } }, (res) => {
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

interface DdItem {
  maps?: Record<string, boolean>;
  description?: string;
  gold?: { sell?: number };
}
interface DdSpell {
  id: string;
  name: string;
  maxrank: number;
  cooldown: number[];
  image?: { full?: string };
}

/**
 * Données Data Dragon d'un patch : sorts d'invocateur, haste des objets, ultimes par champion (chargés à la demande).
 * Cache disque par version : un patch ne change plus une fois publié.
 */
/**
 * Versions Data Dragon à essayer. arammeta donne la sienne, qui reste celle du patch précédent pendant des jours :
 * sans le client, les timers garderaient les anciens cooldowns après un patch.
 */
export function ddragonCandidates(clientPatch: string | undefined, metaVersion: string): string[] {
  const c = clientPatch?.match(/^(\d+)\.(\d+)$/);
  const m = metaVersion.match(/^(\d+)\.(\d+)/);
  if (!c || !m) return [metaVersion];
  const newer = Number(c[1]) * 100 + Number(c[2]) > Number(m[1]) * 100 + Number(m[2]);
  return newer ? [`${c[1]}.${c[2]}.1`, metaVersion] : [metaVersion];
}

export class CooldownData {
  version: string | null = null;
  private summoners = new Map<string, SummonerInfo>();
  private items = new Map<number, ItemHaste>();
  private sells = new Map<number, number>();
  private maps = new Map<number, Record<string, boolean>>();
  private ults = new Map<string, UltimateInfo | null>();
  private pending = new Map<string, Promise<void>>();
  private loading: Promise<void> | null = null;
  /** Dernier échec réseau : on ne retente pas à chaque tick (1 s), mais toutes les minutes. */
  private failedAt = new Map<string, number>();
  error: string | null = null;

  constructor(
    private cacheDir: string,
    private fetcher: (url: string) => Promise<string> = download,
    private nowMs: () => number = Date.now,
    private retryMs = 60_000,
  ) {}

  private cooling(key: string): boolean {
    const t = this.failedAt.get(key);
    return t != null && this.nowMs() - t < this.retryMs;
  }

  get ready(): boolean {
    return this.summoners.size > 0;
  }

  private base(version: string): string {
    return `https://ddragon.leagueoflegends.com/cdn/${version}`;
  }

  private async cached(version: string, rel: string): Promise<unknown> {
    const file = join(this.cacheDir, `ddragon-${version}-${rel.replace(/\//g, '_')}`);
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      /* pas encore en cache */
    }
    const body = await this.fetcher(`${this.base(version)}/data/en_US/${rel}`);
    const data = JSON.parse(body);
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(file, body);
    } catch {
      /* cache facultatif */
    }
    return data;
  }

  /** Sorts d'invocateur + objets du patch. Une seule tentative à la fois ; un échec est retenté au prochain appel. */
  load(version: string): Promise<void> {
    if (this.version === version && this.ready) return Promise.resolve();
    if (this.loading) return this.loading;
    if (this.cooling(`v:${version}`)) return Promise.resolve();
    this.loading = (async () => {
      try {
        const sum = (await this.cached(version, 'summoner.json')) as { data?: Record<string, { id: string; name: string; cooldown: number[]; image?: { full?: string } }> };
        const items = (await this.cached(version, 'item.json')) as { data?: Record<string, DdItem> };
        this.summoners.clear();
        for (const s of Object.values(sum.data ?? {})) {
          if (!/^Summoner/.test(s.id) || s.id.includes('_')) continue; // variantes d'autres modes (_Jade…)
          this.summoners.set(s.id, { name: s.name, cooldown: s.cooldown?.[0] ?? 0, icon: `${this.base(version)}/img/spell/${s.image?.full ?? `${s.id}.png`}` });
        }
        this.items.clear();
        this.sells.clear();
        this.maps.clear();
        for (const [id, it] of Object.entries(items.data ?? {})) {
          if (it.gold?.sell) this.sells.set(Number(id), it.gold.sell);
          if (it.maps) this.maps.set(Number(id), it.maps);
          const h = parseItemHaste(it.description ?? '');
          if (h.ability || h.ultimate || h.summoner) this.items.set(Number(id), h);
        }
        if (this.version !== version) this.ults.clear();
        this.version = version;
        this.error = null;
        this.failedAt.delete(`v:${version}`);
      } catch (e) {
        this.error = (e as Error).message;
        this.failedAt.set(`v:${version}`, this.nowMs());
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /**
   * Essaie les versions dans l'ordre et garde la première disponible. Le jour d'un patch, Data Dragon peut avoir
   * quelques heures de retard sur le client : on reste sur l'ancienne version et on retente la nouvelle.
   */
  async loadAny(versions: string[]): Promise<void> {
    for (const v of versions) {
      await this.load(v);
      if (this.version === v && this.ready) break;
    }
    if (this.ready) this.error = null;
  }

  /** Charge l'ultime d'un champion (alias Data Dragon : « MonkeyKing » pour Wukong). */
  loadChampion(alias: string): Promise<void> {
    const v = this.version;
    if (!v || this.ults.has(alias)) return Promise.resolve();
    const key = `${v}:${alias}`;
    if (this.cooling(key)) return Promise.resolve();
    const p = this.pending.get(key);
    if (p) return p;
    const job = (async () => {
      try {
        const d = (await this.cached(v, `champion/${alias}.json`)) as { data?: Record<string, { spells?: DdSpell[] }> };
        const r = Object.values(d.data ?? {})[0]?.spells?.[3];
        this.ults.set(alias, r ? { name: r.name, cooldown: r.cooldown, maxrank: r.maxrank, icon: `${this.base(v)}/img/spell/${r.image?.full ?? `${r.id}.png`}` } : null);
      } catch {
        this.failedAt.set(key, this.nowMs()); // réessayé dans une minute ; rien n'est inventé en attendant
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, job);
    return job;
  }

  summoner(key: string): SummonerInfo | null {
    return this.summoners.get(key) ?? null;
  }

  ultimate(alias: string): UltimateInfo | null {
    return this.ults.get(alias) ?? null;
  }

  /** Or rendu par la boutique (`gold.sell` de Data Dragon), `null` si l'objet n'y est pas : rien n'est supposé. */
  sellValue(id: number): number | null {
    return this.sells.get(id) ?? null;
  }

  /** L'objet existe-t-il sur cette carte (`maps` de Data Dragon) ? `null` : pas lu. */
  onMap(id: number, map: number): boolean | null {
    return this.maps.get(id)?.[String(map)] ?? null;
  }

  /** Haste totale des objets (haste fixe seulement). */
  hasteOf(itemIds: number[]): ItemHaste {
    const out = { ability: 0, ultimate: 0, summoner: 0 };
    for (const id of itemIds) {
      const h = this.items.get(id);
      if (h) {
        out.ability += h.ability;
        out.ultimate += h.ultimate;
        out.summoner += h.summoner;
      }
    }
    return out;
  }
}
