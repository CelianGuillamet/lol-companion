// Guide de lane Faille : ce qu'OP.GG sait d'un matchup, au-delà du winrate (`lol_get_lane_matchup_guide`).
// Deux sources de solidité différente :
// - `game_lengths` : winrate du champion selon la durée de la partie, tous adversaires confondus. Format vu en vrai.
// - `opponent_champion_tip`, `recommended_play_style`, `lane_advantage_champion`, `lane_solo_kill_advantage_champion` :
//   champs jamais vus remplis (la seule capture était Ahri contre Ahri, tous à null). Lecture tolérante : un format
//   inattendu ne donne rien à l'écran. La vraie réponse est copiée dans probe-output/ pour le vérifier.

import type { CounterStat } from './opgg';
import type { GuidePhase, LaneEdge, LaneGuide, Pace } from './types';

export interface GuideData {
  /** Id du champion décrit par la réponse, quand elle le dit. */
  championId: number | null;
  /** Parties du champion dans ce rôle : sert à ne pas lire du bruit dans `lengths`. */
  games: number;
  lengths: { from: number; rate: number }[];
  /** Tous les matchups du champion dans ce rôle. `strong_counters` et `weak_counters` de l'analyse n'en donnent que 6. */
  counters: { id: number; games: number; myWinRate: number }[];
  tips: string[];
  style: string | null;
  laneAdvantage: unknown;
  soloKillAdvantage: unknown;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const MAX_TIPS = 3;

/** Toutes les phrases d'une valeur, quelle que soit sa forme : texte, liste, objet. */
function sentences(v: unknown, depth = 0): string[] {
  if (depth > 3 || v == null) return [];
  if (typeof v === 'string') {
    const t = v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length >= 12 && t.length <= 300 && !/^https?:/i.test(t) && t.includes(' ') ? [t] : [];
  }
  if (Array.isArray(v)) return v.flatMap((x) => sentences(x, depth + 1));
  if (typeof v === 'object') return Object.values(v as Obj).flatMap((x) => sentences(x, depth + 1));
  return [];
}

export function readGuide(raw: unknown, lane: string): GuideData | null {
  const data = obj(obj(raw).data);
  if (!Object.keys(data).length) return null;
  const summary = obj(data.summary);
  const positions = Array.isArray(summary.positions) ? (summary.positions as Obj[]) : [];
  const wanted = lane.toUpperCase();
  const here = positions.find((p) => String(obj(p).name).toUpperCase() === wanted);
  const games = num(obj(obj(here).stats).play) ?? num(obj(summary.average_stats).play) ?? 0;
  const lengths = (Array.isArray(data.game_lengths) ? (data.game_lengths as Obj[]) : [])
    .map((r) => ({ from: num(obj(r).game_length), rate: num(obj(r).rate) }))
    .filter((r): r is { from: number; rate: number } => r.from != null && r.rate != null && r.rate > 0 && r.rate < 1);
  const counters = (Array.isArray(data.counters) ? (data.counters as Obj[]) : [])
    .map((c) => ({ id: num(obj(c).champion_id) ?? 0, games: num(obj(c).play) ?? 0, win: num(obj(c).win) }))
    .filter((c) => c.id > 0 && c.games > 0 && c.win != null && c.win <= c.games)
    .map((c) => ({ id: c.id, games: c.games, myWinRate: c.win! / c.games }));
  return {
    championId: num(summary.id),
    games,
    lengths,
    counters,
    tips: [...new Set(sentences(data.opponent_champion_tip))].slice(0, MAX_TIPS),
    style: sentences(data.recommended_play_style)[0] ?? null,
    laneAdvantage: data.lane_advantage_champion ?? null,
    soloKillAdvantage: data.lane_solo_kill_advantage_champion ?? null,
  };
}

/** Winrate du matchup : dans ta réponse, sinon déduit de la sienne. Même logique que `matchupFrom`, sur la liste complète. */
export function guideRate(mine: GuideData | null, theirs: GuideData | null, myId: number, oppId: number): { myWinRate: number; games: number } | null {
  const direct = mine && (mine.championId == null || mine.championId === myId) ? mine.counters.find((c) => c.id === oppId) : undefined;
  if (direct) return { myWinRate: direct.myWinRate, games: direct.games };
  const back = theirs && (theirs.championId == null || theirs.championId === oppId) ? theirs.counters.find((c) => c.id === myId) : undefined;
  return back ? { myWinRate: 1 - back.myWinRate, games: back.games } : null;
}

/** Tous les matchups du guide, au format de l'analyse, si la réponse parle bien de ce champion. Sans nom : `champName` le donne. */
export function guideCounters(g: GuideData | null, id: number): CounterStat[] {
  if (!g || (g.championId != null && g.championId !== id)) return [];
  return g.counters.map((c) => ({ id: c.id, name: '', games: c.games, myWinRate: c.myWinRate }));
}

const flat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Qui a l'avantage : le champ peut être un id, un nom ou un objet. Sinon, on ne dit rien. */
export function edgeOf(v: unknown, me: { id: number; names: string[] }, them: { id: number; names: string[] }): LaneEdge | null {
  const o = obj(v);
  const id = num(v) ?? num(o.champion_id) ?? num(o.id);
  if (id != null) return id === me.id ? 'me' : id === them.id ? 'them' : null;
  const name = typeof v === 'string' ? v : typeof o.champion_name === 'string' ? o.champion_name : typeof o.name === 'string' ? o.name : '';
  if (!name) return null;
  const n = flat(name);
  const hit = (names: string[]) => names.some((x) => flat(x) === n);
  return hit(me.names) ? 'me' : hit(them.names) ? 'them' : null;
}

const PHASES = [
  { label: 'avant 25 min', froms: [0] },
  { label: 'entre 25 et 35 min', froms: [25, 30] },
  { label: 'après 35 min', froms: [35, 40] },
];

/** Part supposée des parties par tranche, faute de chiffre : `game_lengths` ne donne pas d'effectif. */
const SHARE = 0.2;
/** Même prudence que le reste de l'app : un écart ne compte que s'il sort du bruit, et jamais sous 1 pt. */
const Z = 1.64;
const MIN_GAP = 0.01;

function phaseRate(lengths: GuideData['lengths'], froms: number[]): number | null {
  const rows = lengths.filter((r) => froms.includes(r.from));
  return rows.length === froms.length ? rows.reduce((n, r) => n + r.rate, 0) / rows.length : null;
}

const plainPct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;

/**
 * Rythme comparé : à quel moment de la partie ton champion gagne mieux que le sien. `short` : Swiftplay, les parties
 * s'arrêtent avant 35 min, la dernière tranche ne te concerne pas.
 */
export function paceOf(mine: GuideData, theirs: GuideData | null, oppName: string, short = false): Pace | null {
  if (!theirs) return null;
  const phases: GuidePhase[] = [];
  for (const [i, ph] of PHASES.entries()) {
    if (short && i === PHASES.length - 1) break;
    const a = phaseRate(mine.lengths, ph.froms);
    const b = phaseRate(theirs.lengths, ph.froms);
    if (a == null || b == null || !mine.games || !theirs.games) continue;
    const share = SHARE * ph.froms.length;
    const se = Math.sqrt(0.25 / (mine.games * share) + 0.25 / (theirs.games * share));
    const gap = a - b;
    const edge: LaneEdge | 'even' = Math.abs(gap) < MIN_GAP || Math.abs(gap) < Z * se ? 'even' : gap > 0 ? 'me' : 'them';
    phases.push({ label: ph.label, mine: a, theirs: b, edge });
  }
  const ahead = phases.filter((p) => p.edge === 'me');
  const behind = phases.filter((p) => p.edge === 'them');
  if (!ahead.length && !behind.length) return null;
  const list = (ps: GuidePhase[]) => ps.map((p) => p.label).join(' et ');
  let text: string;
  if (ahead.length && behind.length) {
    text = phases.indexOf(ahead[0]) < phases.indexOf(behind[0])
      ? `Rythme général : devant ${oppName} ${list(ahead)}, derrière ${list(behind)}. Cherche ton avance tôt.`
      : `Rythme général : derrière ${oppName} ${list(behind)}, devant ${list(ahead)}. Tiens jusque-là.`;
  } else if (ahead.length) text = `Rythme général : devant ${oppName} ${list(ahead)}.`;
  else text = `Rythme général : derrière ${oppName} ${list(behind)}.`;
  return { text, detail: phases.map((p) => `${p.label} : ${plainPct(p.mine)} contre ${plainPct(p.theirs)}`).join(' · '), phases };
}

export function buildGuide(
  mine: GuideData | null,
  theirs: GuideData | null,
  me: { id: number; names: string[] },
  them: { id: number; names: string[]; name: string },
  short = false,
): LaneGuide | null {
  if (!mine) return null;
  // Une réponse qui décrit un autre champion que celui demandé ne dit rien sur le rythme
  const okMine = mine.championId == null || mine.championId === me.id;
  const okTheirs = theirs && (theirs.championId == null || theirs.championId === them.id) ? theirs : null;
  const guide: LaneGuide = {
    pace: okMine ? paceOf(mine, okTheirs, them.name, short) : null,
    tips: mine.tips,
    style: mine.style,
    laneEdge: edgeOf(mine.laneAdvantage, me, them),
    killEdge: edgeOf(mine.soloKillAdvantage, me, them),
  };
  return guide.pace || guide.tips.length || guide.style || guide.laneEdge || guide.killEdge ? guide : null;
}
