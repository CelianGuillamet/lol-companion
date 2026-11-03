// Combos champion + augments de Mayhem. Source : arammayhem.com/data (CC BY 4.0, « Data: arammayhem.com »), fichier combos.csv.
// Avis éditorial et communautaire, pas une statistique : le site le dit lui-même (« not a win-rate metric »). L'app affiche
// ces avis à côté du classement et ne les mélange jamais au winrate. Lu en direct (cache 24 h), repli sur un instantané
// embarqué (data/combos-snapshot.json, relevé le 3 nov. 2026 : « champion augment|augment type|type », « - » = sans type).
// Une ligne à 1 augment = interaction champion + augment. Une ligne à plusieurs = un plan : ces augments vont ensemble.

import { download as fetchText } from './http';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import snapshot from './data/combos-snapshot.json';
import type { RerollAdvice } from './reroll';
import type { ComboKind, ComboNote } from './types';

const CSV_URL = 'https://arammayhem.com/data/v1/latest/combos.csv';
const MAX_AGE_MS = 24 * 3600 * 1000;
const MIN_ROWS = 100; // en dessous, le fichier n'est pas celui qu'on croit

export interface ComboRow {
  champion: string; // clé normalisée
  augments: string[]; // clés normalisées
  types: string[];
}

export const comboKey = (s: string) => s.normalize('NFD').toLowerCase().replace(/[^a-z0-9]/g, '');
const split = (s: string) => s.split('|').map((x) => x.trim()).filter(Boolean);

/** Lignes d'un CSV (guillemets RFC 4180). */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') (cell += '"'), i++;
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n') row.push(cell.replace(/\r$/, '')), rows.push(row), (row = []), (cell = '');
    else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

/** `null` si ce n'est pas le fichier attendu : mieux vaut l'instantané qu'une table vide ou décalée. */
export function parseCombosCsv(text: string): ComboRow[] | null {
  const [head, ...lines] = csvRows(text.replace(/^﻿/, ''));
  const col = (name: string) => head?.indexOf(name) ?? -1;
  const [c, a, t] = [col('championId'), col('augmentIds'), col('types')];
  if (c < 0 || a < 0 || t < 0) return null;
  const rows = lines
    .filter((l) => l[c] && l[a])
    .map((l) => ({ champion: comboKey(l[c]), augments: split(l[a]).map(comboKey), types: split(l[t] ?? '') }));
  return rows.length >= MIN_ROWS ? rows : null;
}

export function snapshotRows(lines: string[] = snapshot): ComboRow[] {
  return lines.map((l) => {
    const [champion, augments, types] = l.split(' ');
    return { champion: comboKey(champion), augments: split(augments).map(comboKey), types: types === '-' ? [] : split(types) };
  });
}

function kindOf(types: string[]): ComboKind {
  if (types.includes('trap')) return 'trap';
  if (types.includes('bug')) return 'bug'; // peut déjà être corrigé : jamais présenté comme un bon choix
  if (types.includes('god')) return 'strong';
  if (types.includes('strong')) return 'good';
  if (types.includes('blackTech')) return 'tech';
  if (types.includes('entertainment')) return 'fun';
  return 'listed';
}

const LABEL: Record<Exclude<ComboKind, 'plan'>, string> = {
  trap: 'piège connu',
  strong: 'combo fort',
  good: 'bon combo',
  tech: 'astuce connue',
  listed: 'combo connu',
  bug: 'bug connu',
  fun: 'pour le fun',
};
const ORDER: Exclude<ComboKind, 'plan'>[] = ['trap', 'strong', 'good', 'tech', 'listed', 'bug', 'fun'];
const isGood = (k: ComboKind) => (k === 'trap' ? false : k === 'strong' || k === 'good' || k === 'plan' ? true : null);

/**
 * L'avis sur une carte pour ce champion. Un piège ou un combo solo passe d'abord ; sinon, un augment déjà pris du même plan.
 * `taken` : noms anglais, sans la carte elle-même. Rien si le plan ne touche aucun augment déjà pris : « fait partie
 * d'une liste » seul n'apprend rien, ces listes vont jusqu'à 10 augments.
 */
export function comboNote(rows: ComboRow[], champion: string[], card: string, taken: string[] = []): ComboNote | null {
  const keys = new Set(champion.map(comboKey));
  const me = rows.filter((r) => keys.has(r.champion));
  const id = comboKey(card);
  const solo = me.filter((r) => r.augments.length === 1 && r.augments[0] === id).map((r) => kindOf(r.types));
  const best = ORDER.find((k) => solo.includes(k));
  if (best === 'trap' || best === 'strong' || best === 'good') return { kind: best, label: LABEL[best], good: isGood(best) };
  const mates = taken.filter((t) => comboKey(t) !== id && me.some((r) => r.augments.length > 1 && r.augments.includes(id) && r.augments.includes(comboKey(t))));
  if (mates.length) return { kind: 'plan', label: `va avec ${mates.slice(0, 2).join(', ')}`, good: true, with: mates };
  return best ? { kind: best, label: LABEL[best], good: isGood(best) } : null;
}

/** Ne pas conseiller de relancer une carte qui fait combo : le conseil de relance ne voit que les winrates. */
export function protectCombos(advice: RerollAdvice | null, notes: Record<number, ComboNote>): RerollAdvice | null {
  if (!advice?.targets.length) return advice;
  const targets = advice.targets.filter((id) => !notes[id]?.good);
  if (targets.length === advice.targets.length) return advice;
  if (!targets.length || advice.kind === 'risky') return { kind: 'keep', targets: [], gain: 0, upgrade: advice.upgrade, left: advice.left, combo: true };
  return { ...advice, targets };
}

function download(url: string): Promise<string> {
  return fetchText(url, 20000);
}

export class Combos {
  rows: ComboRow[] = snapshotRows();
  source: 'site' | 'instantané' = 'instantané';

  constructor(
    private cacheDir: string,
    private fetcher: (url: string) => Promise<string> = download,
  ) {}

  /** Cache 24 h, puis le site, puis le dernier fichier lu même périmé, puis l'instantané. */
  async load(force = false): Promise<void> {
    const file = join(this.cacheDir, 'arammayhem-combos.csv');
    const cached = await readFile(file, 'utf8').catch(() => null);
    const age = cached ? await stat(file).then((s) => Date.now() - s.mtimeMs).catch(() => Infinity) : Infinity;
    if (!force && cached && age < MAX_AGE_MS && this.use(cached)) return;
    try {
      const text = await this.fetcher(CSV_URL);
      if (this.use(text)) {
        await mkdir(this.cacheDir, { recursive: true });
        await writeFile(file, text);
        return;
      }
    } catch {
      /* site injoignable */
    }
    if (cached) this.use(cached);
  }

  private use(text: string): boolean {
    const rows = parseCombosCsv(text);
    if (!rows) return false;
    this.rows = rows;
    this.source = 'site';
    return true;
  }
}
