// Modificateurs d'équilibrage ARAM par champion (dégâts infligés / subis, soins, boucliers, accélération…).
// Source : League of Legends Wiki, Module:ChampionData/data, sous-table « aram » (CC BY-SA 3.0).
// Lu en direct (cache 24 h) avec repli sur un instantané embarqué (data/aram-balance.json, patch 16.21,
// extrait par le projet PaPaChk/aram-helper depuis la même page du wiki).
//
// Affichage seulement : les winrates arammeta sont déjà mesurés avec ces modificateurs, les ajouter au score
// les compterait deux fois.

import https from 'node:https';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import snapshot from './data/aram-balance.json';

export type Mods = Record<string, number>;

export interface BalanceBadge {
  label: string;
  good: boolean; // favorable au champion
}

const WIKI_URL = 'https://wiki.leagueoflegends.com/en-us/Module:ChampionData/data?action=raw';
const MAX_AGE_MS = 24 * 3600 * 1000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Extrait les sous-tables « aram » (et « mayhem » si le wiki en a une) du module Lua du wiki.
 * Tolérant : le module est un gros littéral de table Lua, une entrée par champion.
 */
export function parseWikiLua(text: string): Map<string, { aram?: Mods; mayhem?: Mods }> {
  const out = new Map<string, { aram?: Mods; mayhem?: Mods }>();
  for (const { name, block } of topLevelEntries(text)) {
    const entry: { aram?: Mods; mayhem?: Mods } = {};
    for (const key of ['aram', 'mayhem'] as const) {
      const sub = block.match(new RegExp(`\\["${key}"\\]\\s*=\\s*\\{([^{}]*)\\}`));
      if (!sub) continue;
      const mods: Mods = {};
      for (const kv of sub[1].matchAll(/\["(\w+)"\]\s*=\s*(-?[\d.]+)/g)) mods[kv[1]] = Number(kv[2]);
      if (Object.keys(mods).length) entry[key] = mods;
    }
    if (entry.aram || entry.mayhem) out.set(norm(name), entry);
  }
  return out;
}

/** Entrées de premier niveau d'un littéral de table Lua : ["Nom"] = { ... } (en sautant chaînes et commentaires). */
function topLevelEntries(text: string): { name: string; block: string }[] {
  const out: { name: string; block: string }[] = [];
  let depth = 0;
  let start = -1;
  let name = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '-' && text[i + 1] === '-') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      if (depth === 1 && start < 0 && text[i - 1] === '[') {
        const after = text.slice(j + 1, j + 40).match(/^\]\s*=\s*\{/);
        if (after) {
          name = text.slice(i + 1, j);
          start = j + 1 + after[0].length - 1; // position du {
        }
      }
      i = j;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 1 && start >= 0) {
        out.push({ name, block: text.slice(start, i + 1) });
        start = -1;
      }
    }
  }
  return out;
}

function snapshotMap(): Map<string, { aram?: Mods }> {
  const m = new Map<string, { aram?: Mods }>();
  for (const [name, mods] of Object.entries((snapshot as { champions: Record<string, Mods> }).champions)) m.set(norm(name), { aram: mods });
  return m;
}

const pct = (x: number) => `${x > 1 ? '+' : '−'}${Math.round(Math.abs(x - 1) * 100)} %`;

/** Modificateurs → badges lisibles, en ignorant ce qui vaut 1 (ou 0 pour l'accélération). */
export function badges(mods: Mods | null | undefined): BalanceBadge[] {
  if (!mods) return [];
  const out: BalanceBadge[] = [];
  const mult = (k: string, label: string, higherIsGood = true) => {
    const v = mods[k];
    if (v == null || Math.abs(v - 1) < 0.005) return;
    out.push({ label: `${pct(v)} ${label}`, good: higherIsGood ? v > 1 : v < 1 });
  };
  mult('dmg_dealt', 'dégâts');
  mult('dmg_taken', 'dégâts subis', false);
  mult('healing', 'soins');
  mult('shielding', 'boucliers');
  mult('total_as', 'vitesse d’attaque');
  mult('tenacity', 'ténacité');
  mult('energyregen_mod', 'régén. énergie');
  if (mods.ability_haste) out.push({ label: `${mods.ability_haste > 0 ? '+' : '−'}${Math.abs(mods.ability_haste)} accélération`, good: mods.ability_haste > 0 });
  return out;
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

export interface BalanceChange {
  champion: string; // clé normalisée (nom sans accents ni espaces)
  at: number; // détecté le
  before: Mods;
  after: Mods;
}

/** Différences de modificateurs ARAM entre deux relevés du wiki (champions présents dans les deux). */
export function diffBalance(prev: Record<string, Mods>, next: Map<string, { aram?: Mods }>, at: number): BalanceChange[] {
  const out: BalanceChange[] = [];
  for (const [k, e] of next) {
    const before = prev[k];
    const after = e.aram ?? {};
    if (!before) continue;
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const neutral = (key: string) => (key === 'ability_haste' ? 0 : 1);
    const changed = [...keys].some((key) => Math.abs((before[key] ?? neutral(key)) - (after[key] ?? neutral(key))) > 1e-6);
    if (changed) out.push({ champion: k, at, before, after });
  }
  return out;
}

export class Balance {
  /** Changements détectés depuis le relevé précédent (gardés 30 jours). */
  changes: BalanceChange[] = [];
  private map: Map<string, { aram?: Mods; mayhem?: Mods }> = snapshotMap();
  source: 'wiki' | 'instantané' = 'instantané';

  get size(): number {
    return this.map.size;
  }

  constructor(
    private cacheDir: string,
    private fetcher: (url: string) => Promise<string> = download,
  ) {}

  /** Charge le wiki (cache 24 h) ; garde l'instantané embarqué si le wiki est injoignable ou illisible. */
  async load(force = false): Promise<void> {
    const file = join(this.cacheDir, 'wiki-championdata.lua');
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
        if (parseWikiLua(text).size >= 50) {
          await mkdir(this.cacheDir, { recursive: true });
          await writeFile(file, text);
        }
      } catch {
        text = await readFile(file, 'utf8').catch(() => null);
      }
    }
    const parsed = text ? parseWikiLua(text) : null;
    if (parsed && parsed.size >= 50) {
      this.map = parsed;
      this.source = 'wiki';
      await this.trackChanges(parsed);
    }
  }

  /** Compare au dernier relevé enregistré et garde l'historique des changements (30 jours). */
  private async trackChanges(parsed: Map<string, { aram?: Mods }>): Promise<void> {
    const file = join(this.cacheDir, 'balance-history.json');
    let saved: { last: Record<string, Mods>; changes: BalanceChange[] } = { last: {}, changes: [] };
    try {
      saved = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      /* premier relevé */
    }
    const now = Date.now();
    const fresh = Object.keys(saved.last).length ? diffBalance(saved.last, parsed, now) : [];
    const changes = [...fresh, ...saved.changes.filter((c) => now - c.at < 30 * 86_400_000 && !fresh.some((f) => f.champion === c.champion))];
    const last = Object.fromEntries([...parsed].map(([k, e]) => [k, e.aram ?? {}]));
    this.changes = changes;
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(file, JSON.stringify({ last, changes }));
    } catch {
      /* pas grave */
    }
  }

  /** Changements récents pour un champion (par nom affiché ou alias). */
  changeFor(names: string[]): BalanceChange | null {
    for (const n of names) {
      const c = this.changes.find((x) => x.champion === norm(n));
      if (c) return c;
    }
    return null;
  }

  /** Modificateurs d'un champion par nom (le nom affiché ou l'alias). Mayhem : table dédiée si le wiki en a une. */
  forChampion(names: string[], mode: 'aram' | 'mayhem' | 'sr'): Mods | null {
    for (const n of names) {
      const e = this.map.get(norm(n));
      if (e) return (mode === 'mayhem' ? e.mayhem : undefined) ?? e.aram ?? null;
    }
    return null;
  }
}
