// Ta collection de champions en ARAM / Mayhem. Tes cartes viennent de ta collection (+ rotation gratuite), et au banc
// tu ne peux prendre que ce qui en fait partie : débloquer un champion fort sert donc à chaque champ select.
// Sources : wiki ARAM (Champion Select, 3 nov. 2026), `/lol-champions/v1/owned-champions-minimal`.
//
// Estimation volontairement simple : 2 cartes tirées dans ta collection + 4 champions au banc tirés dans tous les
// champions (ceux de tes alliés), winrate global seulement. L'équipe, tes résultats et le choix des alliés n'y sont pas.

export const MY_CARDS = 2;
export const BENCH_DRAWS = 4;
/** Moins de parties = winrate trop bruité pour conseiller de dépenser des essences. */
export const MIN_GAMES = 300;
/** Sous ce nombre, la lecture de la collection est sans doute incomplète : on ne s'en sert pas. */
export const MIN_OWNED = 20;
/** En dessous, l'affichage dirait +0,00 pt. */
const MIN_GAIN = 0.0001;
const TOP = 5;
const SHOWN = 8;

export interface Collection {
  owned: Set<number>;
  free: Set<number>;
}

export interface PoolChampion {
  id: number;
  name: string;
  winrate: number | null;
  games: number;
}

export interface PoolUnlock {
  id: number;
  name: string;
  winrate: number;
  games: number;
  /** Gain estimé de winrate moyen par partie (0,0005 = 0,05 pt). */
  gain: number;
  /** Dans la rotation gratuite : jouable cette semaine, pas à toi. */
  free: boolean;
}

export interface PoolReport {
  owned: number;
  free: number;
  total: number;
  /** Winrate global espéré du meilleur champion accessible, à chaque champ select. */
  best: number;
  /** Ce que rapporteraient les 5 premiers déblocages, ensemble. */
  topGain: number;
  /** Chance d'une 3e carte (5 % + 0,15 % par champion d'après le wiki et dodge.gg, 30 % au plus). */
  blessing: number;
  unlocks: PoolUnlock[];
}

export function parseCollection(rows: unknown): Collection | null {
  if (!Array.isArray(rows)) return null;
  const owned = new Set<number>();
  const free = new Set<number>();
  for (const r of rows as { id?: number; freeToPlay?: boolean; ownership?: { owned?: boolean } }[]) {
    if (!r || !Number.isInteger(r.id) || r.id! <= 0) continue;
    // Sans champ `ownership`, le nom de l'endpoint fait foi
    if (r.ownership?.owned === false) {
      if (r.freeToPlay) free.add(r.id!);
    } else owned.add(r.id!);
  }
  return owned.size >= MIN_OWNED ? { owned, free } : null;
}

/** Meilleur winrate espéré. `values` : ta collection. `total` : nombre de champions du jeu (tirages des alliés). */
export function expectedBest(values: number[], total: number): number {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (!n) return 0;
  let out = 0;
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const below = (i / n) ** MY_CARDS * (1 - (n - i) / Math.max(total, n)) ** BENCH_DRAWS;
    out += v[i - 1] * (below - prev);
    prev = below;
  }
  return out;
}

export function poolReport(col: Collection, champs: PoolChampion[]): PoolReport {
  const known = champs.filter((c) => c.winrate != null && c.games >= MIN_GAMES);
  const mean = known.reduce((s, c) => s + c.winrate!, 0) / (known.length || 1);
  const byId = new Map(known.map((c) => [c.id, c.winrate!]));
  const total = new Set([...champs.map((c) => c.id), ...col.owned]).size;
  const values = [...col.owned].map((id) => byId.get(id) ?? mean);
  const best = expectedBest(values, total);
  const unlocks = known
    .filter((c) => !col.owned.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, winrate: c.winrate!, games: c.games, gain: expectedBest([...values, c.winrate!], total) - best, free: col.free.has(c.id) }))
    .filter((c) => c.gain >= MIN_GAIN)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, SHOWN);
  return {
    owned: col.owned.size,
    free: col.free.size,
    total,
    best,
    topGain: expectedBest([...values, ...unlocks.slice(0, TOP).map((u) => u.winrate)], total) - best,
    blessing: Math.min(0.3, 0.05 + 0.0015 * col.owned.size),
    unlocks,
  };
}
