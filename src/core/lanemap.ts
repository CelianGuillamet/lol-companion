// Faille : les 5 duels de la partie, ton équipe contre la leur. Des winrates de classée d'OP.GG, lus une fois au début
// de la partie, jamais un ordre de déplacement (règle Riot) : l'écran dit où ton équipe est forte, pas où aller.

import { LANE_LABEL, type Lane } from './opgg';
import { verdictOf, wilson } from './stats';
import type { LaneMapPanel, LaneMapRow } from './types';

export const LANE_ORDER: Lane[] = ['top', 'jungle', 'mid', 'adc', 'support'];
/** Passé 15 min, les lanes sont finies : le bloc se retire. */
export const LANE_MAP_END_SEC = 900;

export interface LaneRate {
  myWinRate: number;
  games: number;
}

export interface LanePlayer {
  id: number;
  name: string;
  lane: Lane | null;
  /** Rôle lu (jeu, salon, Châtiment), pas deviné. */
  sure: boolean;
}

export interface LanePair {
  lane: Lane;
  ally: { id: number; name: string };
  enemy: { id: number; name: string };
  guessed: boolean;
  mine: boolean;
}

/** Châtiment dans le Live Client. Nom interne d'abord : `displayName` suit la langue du client. */
export function hasSmite(spells: { summonerSpellOne?: { rawDisplayName?: string; displayName?: string }; summonerSpellTwo?: { rawDisplayName?: string; displayName?: string } } | undefined): boolean {
  return [spells?.summonerSpellOne, spells?.summonerSpellTwo].some((s) => /smite|ch[aâ]timent/i.test(`${s?.rawDisplayName ?? ''} ${s?.displayName ?? ''}`));
}

/** Un duel par rôle, seulement si un allié et un ennemi y sont placés. */
export function pairLanes(allies: LanePlayer[], enemies: LanePlayer[], myId: number): LanePair[] {
  const pairs: LanePair[] = [];
  for (const lane of LANE_ORDER) {
    const a = allies.find((p) => p.lane === lane);
    const e = enemies.find((p) => p.lane === lane);
    if (!a || !e) continue;
    pairs.push({ lane, ally: { id: a.id, name: a.name }, enemy: { id: e.id, name: e.name }, guessed: !a.sure || !e.sure, mine: a.id === myId });
  }
  return pairs;
}

const EDGE = { favorable: 'ally', défavorable: 'enemy', serré: 'even', incertain: null } as const;
const pct = (x: number) => `${Math.round(x * 100)} %`;
const lineOf = (r: LaneMapRow) => `${r.laneLabel}, ${r.ally.name} contre ${r.enemy.name} (${pct(r.rate!)})`;

/** Rien sous 2 duels chiffrés. Le point fort et le point faible viennent des 4 autres duels, jamais du tien. */
export function laneMapPanel(pairs: LanePair[], rateOf: (p: LanePair) => LaneRate | null | undefined): LaneMapPanel | null {
  const rows: LaneMapRow[] = pairs.map((p) => {
    const r = rateOf(p) ?? null;
    const base = { lane: p.lane, laneLabel: LANE_LABEL[p.lane], ally: p.ally, enemy: p.enemy, guessed: p.guessed, mine: p.mine };
    if (!r || r.games <= 0) return { ...base, rate: null, games: 0, lo: 0, hi: 1, edge: null };
    const { lo, hi } = wilson(r.myWinRate, r.games);
    return { ...base, rate: r.myWinRate, games: r.games, lo, hi, edge: EDGE[verdictOf(r.myWinRate, r.games)] };
  });
  if (rows.filter((r) => r.rate != null).length < 2) return null;
  const others = rows.filter((r) => !r.mine);
  const strong = others.filter((r) => r.edge === 'ally').sort((a, b) => b.lo - a.lo)[0];
  const weak = others.filter((r) => r.edge === 'enemy').sort((a, b) => a.hi - b.hi)[0];
  return { rows, strong: strong ? lineOf(strong) : null, weak: weak ? lineOf(weak) : null, guessed: rows.some((r) => r.guessed) };
}
