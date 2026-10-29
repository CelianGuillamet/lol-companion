// Lecture du champ select ARAM et actions (choix de carte, prise sur le banc).
// Endpoints et logique confirmés par le code de queuePop (doughknee/queuePop, MIT).

import type { LcuClient } from './lcu';
import type { CandidateInput } from './advisor';

interface Action {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  isInProgress: boolean;
  type: string;
}

export interface RawSession {
  localPlayerCellId: number;
  myTeam: { cellId: number; championId: number; championPickIntent?: number; assignedPosition?: string; gameName?: string; tagLine?: string; puuid?: string }[];
  theirTeam?: { cellId: number; championId: number }[];
  benchEnabled?: boolean;
  benchChampions?: ({ championId: number } | number)[];
  actions?: Action[][];
  timer?: { phase?: string };
  trades?: { id: number; cellId: number; state: string }[];
}

export interface ParsedChampSelect {
  myChampionId: number;
  allies: number[];
  bench: number[];
  cards: number[];
  pickAction: Action | null;
  candidates: CandidateInput[];
  /** champion d'un allié → id d'échange proposable */
  trades: Map<number, number>;
}

export async function readSubset(lcu: LcuClient): Promise<number[]> {
  // Liste des 2-3 champions proposés (cartes) ; 404 hors de la fenêtre de choix.
  const data = await lcu.get<unknown>('/lol-lobby-team-builder/champ-select/v1/subset-champion-list');
  return Array.isArray(data) ? data.filter((c): c is number => Number.isInteger(c) && c > 0) : [];
}

export function parseSession(session: RawSession, subset: number[]): ParsedChampSelect {
  const local = session.localPlayerCellId;
  const me = session.myTeam.find((p) => p.cellId === local);
  const myChampionId = me?.championId || 0;
  const allies = session.myTeam.filter((p) => p.cellId !== local && p.championId > 0).map((p) => p.championId);
  const bench = (session.benchChampions || [])
    .map((b) => (typeof b === 'object' && b ? b.championId : b))
    .filter((c): c is number => Number.isInteger(c) && c > 0);
  const pickAction =
    (session.actions || []).flat().find((a) => a.actorCellId === local && a.type === 'pick' && !a.completed && a.isInProgress) ?? null;
  const cardsOpen = subset.length > 0 && !!pickAction;

  const candidates: CandidateInput[] = [];
  if (myChampionId) candidates.push({ championId: myChampionId, source: 'current', actionable: false });
  if (cardsOpen) for (const c of subset) candidates.push({ championId: c, source: 'card', actionable: true });
  for (const c of bench) candidates.push({ championId: c, source: 'bench', actionable: !cardsOpen && !!myChampionId });

  // Échanges avec les alliés (le client indique ceux qui sont possibles : state AVAILABLE)
  const trades = new Map<number, number>();
  if (myChampionId && !cardsOpen) {
    for (const t of session.trades ?? []) {
      if (t.state !== 'AVAILABLE') continue;
      const theirs = session.myTeam.find((p) => p.cellId === t.cellId)?.championId ?? 0;
      if (!theirs) continue;
      trades.set(theirs, t.id);
      candidates.push({ championId: theirs, source: 'trade', actionable: true, alliesOverride: [...allies.filter((a) => a !== theirs), myChampionId] });
    }
  }

  return { myChampionId, allies, bench, cards: cardsOpen ? subset : [], pickAction, candidates, trades };
}

export async function pickCard(lcu: LcuClient, action: { id: number }, championId: number): Promise<boolean> {
  const r = await lcu.request('PATCH', `/lol-champ-select/v1/session/actions/${action.id}`, { championId, completed: true });
  return r.status >= 200 && r.status < 300;
}

export async function requestTrade(lcu: LcuClient, tradeId: number): Promise<boolean> {
  return (await requestTradeDetailed(lcu, tradeId)).ok;
}

/** Comme requestTrade, avec la raison du refus donnée par le client (pour le journal). */
export async function requestTradeDetailed(lcu: LcuClient, tradeId: number): Promise<{ ok: boolean; reason: string | null }> {
  // Le client actuel nomme la route « champion-swaps » (vue en vraie partie : « trades » répond 404 Invalid URI
  // format). On garde l'ancienne route en repli pour les clients plus anciens.
  let r = await lcu.request<{ message?: string; httpStatus?: number }>('POST', `/lol-champ-select/v1/session/champion-swaps/${tradeId}/request`);
  if (r.status === 404) r = await lcu.request<{ message?: string; httpStatus?: number }>('POST', `/lol-champ-select/v1/session/trades/${tradeId}/request`);
  const ok = r.status >= 200 && r.status < 300;
  return { ok, reason: ok ? null : `HTTP ${r.status}${r.data?.message ? ` : ${r.data.message}` : ''}` };
}

export async function takeFromBench(lcu: LcuClient, championId: number): Promise<boolean> {
  const r = await lcu.request('POST', `/lol-champ-select/v1/session/bench/swap/${championId}`);
  return r.status >= 200 && r.status < 300;
}
