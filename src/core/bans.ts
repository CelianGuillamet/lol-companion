// Bans conseillés sur la Faille : pure, sans client ni réseau.
//
// Unité : points de victoire gagnés par partie. Un ban retire le champion des deux équipes : banner un champion fort
// ne rapporte rien tant qu'un allié peut le prendre aussi (ce qu'il perd d'un côté, il le perd de l'autre). On ne
// compte donc que les rôles où ton équipe ne peut plus le prendre : le tien, et ceux où l'allié a montré son champion.
//
// Probabilité qu'un ennemi le joue : sa part des parties du rôle (`games` / somme du rôle). Chaque partie compte deux
// joueurs dans le rôle, cette part est donc la chance que l'adversaire de ce rôle l'ait. Le taux de ban n'y change presque
// rien : à 50 % de bans, cette chance ne monte que de 10 % si les 9 autres bannissent pareil.

import { wilson } from './stats';
import type { CounterStat, Lane, LaneMetaRow, OpggAnalysis } from './opgg';

/** Sous ce gain (0,05 pt par partie), un ban ne se distingue d'aucun autre. */
export const MIN_BAN_GAIN = 0.0005;
const MIN_ROW_GAMES = 500;
const MIN_MATCHUP_GAMES = 100;

export interface BanOption {
  id: number;
  name: string;
  /** Points de victoire gagnés par partie (0,003 = +0,3 pt), borne prudente. */
  gain: number;
  lane: Lane;
  /** Part des parties où l'adversaire de ce rôle le joue. */
  share: number;
  /** Ton winrate contre lui (matchup de ton rôle), sinon absent. */
  myWinRate: number | null;
  winRate: number;
  games: number;
}

export interface BanInput {
  meta: Map<string, LaneMetaRow[]>;
  /** Rôles comptés : le tien et ceux des alliés qui ont montré leur champion. */
  lanes: Lane[];
  myLane: Lane;
  /** Analyse du champion survolé dans ton rôle, si tu en as un. */
  mine: OpggAnalysis | null;
  /** Bannis, survolés par un allié au ban, choisis ou survolés par ton équipe, déjà pris en face. */
  excluded: Set<number>;
  idOf: (opggName: string) => number | undefined;
  max?: number;
}

function matchupGain(c: CounterStat | undefined, mine: OpggAnalysis | null): number | null {
  if (!c || !mine || c.games < MIN_MATCHUP_GAMES) return null;
  const { lo, hi } = wilson(c.myWinRate, c.games);
  if (hi < mine.winRate) return mine.winRate - hi;
  return lo > mine.winRate ? 0 : null; // tu le bats : surtout pas de ban ; intervalle trop large : on ne sait pas
}

export function banOptions(input: BanInput): BanOption[] {
  const { meta, lanes, myLane, mine, excluded, idOf, max = 3 } = input;
  const totals = new Map<Lane, number>();
  for (const rows of meta.values()) for (const r of rows) totals.set(r.lane, (totals.get(r.lane) ?? 0) + r.games);
  const counters = new Map([...(mine?.losesTo ?? []), ...(mine?.beats ?? [])].map((c) => [c.id, c]));
  const out: BanOption[] = [];
  for (const rows of meta.values()) {
    const id = idOf(rows[0]?.champion ?? '');
    if (!id || excluded.has(id)) continue;
    let gain = 0;
    let best: { gain: number; row: LaneMetaRow; share: number; myWinRate: number | null } | null = null;
    for (const row of rows) {
      const total = totals.get(row.lane) ?? 0;
      if (!total || row.games < MIN_ROW_GAMES || !lanes.includes(row.lane)) continue;
      const share = row.games / total;
      const edge = wilson(row.winRate, row.games).lo - 0.5;
      const c = row.lane === myLane ? counters.get(id) : undefined;
      const fromMatchup = row.lane === myLane ? matchupGain(c, mine) : null;
      const value = share * (fromMatchup ?? Math.max(0, edge));
      gain += value;
      if (value > 0 && (!best || value > best.gain)) best = { gain: value, row, share, myWinRate: fromMatchup != null ? c!.myWinRate : null };
    }
    if (!best || gain < MIN_BAN_GAIN) continue;
    out.push({ id, name: best.row.champion, gain, lane: best.row.lane, share: best.share, myWinRate: best.myWinRate, winRate: best.row.winRate, games: best.row.games });
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, max);
}
