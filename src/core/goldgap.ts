// Écart d'objets entre les deux équipes : la valeur des objets visibles au tableau des scores, au prix du patch.
// Hexgate l'affiche par couloir sur Tab (« Scoreboard gold »). C'est une lecture, pas un conseil : l'app ne dit jamais
// d'engager ou de reculer. L'or en poche ne se voit pas pour les autres joueurs, donc il ne compte pour personne.

import type { GoldGapPanel, GoldGapPlayer, GoldGapRow, Mode } from './types';

export interface GapItem {
  itemID: number;
  count?: number;
  consumable?: boolean;
  /** Champ `price` du Live Client : coût de la dernière recette. Repli seulement, voir `playerGold`. */
  price?: number;
}

export interface GapInput {
  championId: number;
  championName: string;
  ally: boolean;
  me: boolean;
  level: number;
  /** Faille : TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY. Vide en ARAM et Mayhem. */
  position: string;
  items: GapItem[];
}

/** Sous cet écart, « à égalité » : 3 % de l'équipe la mieux équipée et 500 or. Choix prudent, pas une mesure (voir ROADMAP). */
export const EVEN_SHARE = 0.03;
export const EVEN_MIN = 500;

const ROLES: [string, string][] = [['TOP', 'Haut'], ['JUNGLE', 'Jungle'], ['MIDDLE', 'Milieu'], ['BOTTOM', 'Tireur'], ['UTILITY', 'Soutien']];

/**
 * Prix total d'un objet. Certains ids de Mayhem sont un objet connu avec un préfixe (123430 = 3430, 323075 = 3075) :
 * on retombe sur l'objet de base. Le champ `price` du Live Client ne sert qu'en repli (`playerGold`) : c'est le coût de la
 * dernière recette (Heartsteel : 400), pas la valeur de l'objet.
 */
export function itemValue(id: number, price: (id: number) => number | null): number | null {
  return price(id) ?? (id >= 100000 ? price(id % 10000) : null);
}

/** Valeur des objets d'un joueur, sans les consommables. `unknown` : objets sans prix connu, comptés 0. */
export function playerGold(items: GapItem[], price: (id: number) => number | null): { gold: number; unknown: number } {
  let gold = 0;
  let unknown = 0;
  for (const it of items) {
    if (it.consumable) continue;
    // Objet absent du catalogue : objets propres au mode, sans recette, comme Wooglet's Witchcap (228002, 6 000) ou Poro-Snax
    // (220013, 0). Pour eux, `price` est la vraie valeur. Inconnu seulement si le jeu ne donne aucun prix.
    const p = itemValue(it.itemID, price) ?? it.price;
    if (p == null) unknown++;
    else gold += p * Math.max(1, it.count ?? 1);
  }
  return { gold, unknown };
}

const byGold = (a: GoldGapPlayer, b: GoldGapPlayer) => b.gold - a.gold || b.level - a.level;

/** Faille avec un joueur et un seul par rôle des deux côtés : lignes par rôle. Sinon, du plus riche au moins riche. */
function rowsOf(allies: GoldGapPlayer[], enemies: GoldGapPlayer[], inputs: Map<GoldGapPlayer, GapInput>, mode: Mode | null): { rows: GoldGapRow[]; byRole: boolean } {
  const paired = (a: GoldGapPlayer | null, e: GoldGapPlayer | null, role: string | null): GoldGapRow => ({ role, ally: a, enemy: e, gap: a && e ? a.gold - e.gold : null, mine: !!a && !!inputs.get(a)?.me });
  if (mode === 'sr') {
    const at = (list: GoldGapPlayer[], pos: string) => list.filter((p) => inputs.get(p)?.position === pos);
    const roles = ROLES.map(([pos, label]) => ({ a: at(allies, pos), e: at(enemies, pos), label }));
    if (roles.every((r) => r.a.length === 1 && r.e.length === 1)) return { rows: roles.map((r) => paired(r.a[0], r.e[0], r.label)), byRole: true };
  }
  const a = [...allies].sort(byGold);
  const e = [...enemies].sort(byGold);
  return { rows: Array.from({ length: Math.max(a.length, e.length) }, (_, i) => paired(a[i] ?? null, e[i] ?? null, null)), byRole: false };
}

/** null tant qu'un camp manque, ou que personne n'a acheté d'objet. */
export function goldGap(players: GapInput[], price: (id: number) => number | null, mode: Mode | null): GoldGapPanel | null {
  const inputs = new Map<GoldGapPlayer, GapInput>();
  let unknown = 0;
  const seen = players.map((p) => {
    const { gold, unknown: u } = playerGold(p.items, price);
    unknown += u;
    const out: GoldGapPlayer = { championId: p.championId, championName: p.championName, level: p.level, gold };
    inputs.set(out, p);
    return out;
  });
  const allies = seen.filter((p) => inputs.get(p)!.ally);
  const enemies = seen.filter((p) => !inputs.get(p)!.ally);
  if (!allies.length || !enemies.length) return null;
  const sum = (list: GoldGapPlayer[], f: (p: GoldGapPlayer) => number) => list.reduce((n, p) => n + f(p), 0);
  const allyGold = sum(allies, (p) => p.gold);
  const enemyGold = sum(enemies, (p) => p.gold);
  if (!allyGold && !enemyGold) return null;
  const gap = allyGold - enemyGold;
  const even = Math.abs(gap) < Math.max(EVEN_MIN, EVEN_SHARE * Math.max(allyGold, enemyGold));
  const { rows, byRole } = rowsOf(allies, enemies, inputs, mode);
  return {
    allyGold,
    enemyGold,
    gap,
    levelGap: sum(allies, (p) => p.level) - sum(enemies, (p) => p.level),
    state: even ? 'even' : gap > 0 ? 'ahead' : 'behind',
    richest: [...enemies].sort(byGold)[0],
    rows,
    byRole,
    unknown,
  };
}

/** Moment de capture en Faille, où aucun choix d'augment ne rythme la partie : 2 min (rôles posés), 15 min (items finis). 0 = pas encore. */
export const riftStage = (gameTime: number | null): number => (gameTime == null ? 0 : gameTime >= 900 ? 2 : gameTime >= 120 ? 1 : 0);

/** Échantillon toutes les 5 minutes de jeu pour `gold_gap` : assez pour relier l'écart au résultat, sans gonfler usage.json. */
export const SAMPLE_SEC = 300;

export function sampleSlot(gameTime: number): number {
  return Math.floor(gameTime / SAMPLE_SEC);
}

/**
 * Diagnostic : ce que `playerlist` montre des 10 joueurs à un choix d'augment, sans identifiants. Sert à vérifier en vraie
 * partie si les objets adverses suivent les achats, quels objets n'ont pas de prix, et si `position` et `runes` sont remplis.
 */
export function probePlayers(players: { championName?: string; team?: string; level?: number; position?: string; items?: GapItem[]; runes?: unknown; scores?: { creepScore?: number } }[]): object[] {
  return players.map((p) => ({ champion: p.championName ?? '', team: p.team ?? '', level: p.level ?? 0, position: p.position ?? '', items: (p.items ?? []).map((i) => i.itemID), runes: p.runes ?? null, cs: p.scores?.creepScore ?? null }));
}
