// Lecture des 3 cartes d'augments : association des lignes de texte lues à l'écran (OCR) aux noms d'augments
// du pool du champion. Pur et testable : la capture et l'OCR vivent côté Electron (electron/cardreader.ts).
//
// Principe « dans le doute, se taire » : seuil de ressemblance strict, une carte par colonne, et la lecture
// n'est déclarée sûre que si les 3 cartes sont reconnues.

import type { Rarity } from './types';

/** Ligne lue à l'écran. Coordonnées normalisées 0..1 dans la zone capturée, y depuis le haut. */
export interface OcrLine {
  text: string;
  conf: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardCandidate {
  id: number;
  name: string;
  rarity: Rarity;
}

export interface CardRead {
  ids: number[]; // de gauche à droite
  names: string[];
  rarity: Rarity | null;
  /** null si les 3 cartes sont reconnues, sinon la raison du doute (affichée telle quelle). */
  unsure: string | null;
  /** Textes de taille « titre » proches d'un nom sans l'atteindre (pour régler la correspondance). */
  misses: string[];
}

export const MATCH_MIN = 0.84;
const MISS_MIN = 0.6;

export const normText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Ressemblance 0..1 entre deux textes normalisés. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 0;
  if (Math.abs(a.length - b.length) / max > 1 - MISS_MIN) return 0;
  return 1 - levenshtein(a, b) / max;
}

interface Piece {
  text: string;
  cx: number;
  y: number;
  h: number;
  lines: number[];
}

/** Lignes seules + paires de lignes empilées dans la même colonne (nom long coupé sur deux lignes). */
function pieces(lines: OcrLine[]): Piece[] {
  const out: Piece[] = lines.map((l, i) => ({ text: normText(l.text), cx: l.x + l.w / 2, y: l.y, h: l.h, lines: [i] }));
  for (let i = 0; i < lines.length; i++)
    for (let j = 0; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      const dy = b.y - (a.y + a.h);
      if (i === j || dy < -a.h * 0.2 || dy > a.h * 1.2 || Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) > 0.06) continue;
      out.push({ text: normText(`${a.text} ${b.text}`), cx: (a.x + a.w / 2 + b.x + b.w / 2) / 2, y: a.y, h: Math.max(a.h, b.h), lines: [i, j] });
    }
  return out.filter((p) => p.text.length >= 3);
}

export function matchCards(lines: OcrLine[], pool: CardCandidate[]): CardRead | null {
  const names = pool.map((c) => ({ c, n: normText(c.name) })).filter((x) => x.n.length >= 3);
  type Hit = { c: CardCandidate; score: number; cx: number; h: number; lines: number[] };
  const hits: Hit[] = [];
  const near: { text: string; score: number; h: number }[] = [];
  for (const p of pieces(lines)) {
    let best: Hit | null = null;
    for (const { c, n } of names) {
      const s = similarity(p.text, n);
      if (!best || s > best.score) best = { c, score: s, cx: p.cx, h: p.h, lines: p.lines };
    }
    if (!best) continue;
    if (best.score >= MATCH_MIN) hits.push(best);
    else if (best.score >= MISS_MIN && p.lines.length === 1) near.push({ text: lines[p.lines[0]].text, score: best.score, h: p.h });
  }
  if (!hits.length) return null;

  // Une carte par colonne, chaque ligne lue servant une seule fois : on garde les meilleures ressemblances.
  hits.sort((a, b) => b.score - a.score || b.h - a.h);
  const kept: Hit[] = [];
  const used = new Set<number>();
  for (const h of hits) {
    if (kept.length >= 3) break;
    if (h.lines.some((l) => used.has(l))) continue;
    if (kept.some((k) => k.c.id === h.c.id || Math.abs(k.cx - h.cx) < 0.12)) continue;
    kept.push(h);
    h.lines.forEach((l) => used.add(l));
  }
  kept.sort((a, b) => a.cx - b.cx);

  const count = new Map<Rarity, number>();
  for (const k of kept) count.set(k.c.rarity, (count.get(k.c.rarity) ?? 0) + 1);
  const rarity = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Les titres sont la plus grande police des cartes : un « presque » nom de taille titre mérite d'être noté.
  const titleH = Math.min(...kept.map((k) => k.h));
  const misses = near.filter((m) => m.h >= titleH * 0.85).map((m) => m.text);

  const unsure = kept.length === 3 ? null : `${kept.length} carte${kept.length > 1 ? 's' : ''} sur 3 reconnue${kept.length > 1 ? 's' : ''}`;
  return { ids: kept.map((k) => k.c.id), names: kept.map((k) => k.c.name), rarity, unsure, misses };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Lignes lues sur nos propres fenêtres posées sur le jeu (panneau par-dessus le jeu, fenêtre au premier plan) :
 * à ignorer, sinon l'app lirait ses propres noms d'augments. `area` = zone capturée, en coordonnées écran.
 */
export function dropCovered(lines: OcrLine[], area: Rect, windows: Rect[]): OcrLine[] {
  return lines.filter((l) => {
    const cx = area.x + (l.x + l.w / 2) * area.width;
    const cy = area.y + (l.y + l.h / 2) * area.height;
    return !windows.some((w) => cx >= w.x && cx <= w.x + w.width && cy >= w.y && cy <= w.y + w.height);
  });
}
