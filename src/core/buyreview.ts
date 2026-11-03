// Revue des achats : même principe que la revue des augments (review.ts), on juge la décision d'après ce qui était
// conseillé au moment de l'achat. Sans mesure propre, on ne reproche rien.
//
// Limite : le winrate d'un item seul avantage les items achetés tard, quand la partie est déjà bien engagée. D'où la
// règle de review.ts (1 point d'écart et échantillon suffisant), et un item prévu au plan n'est jamais une erreur.

import { points, reviewChoice, type ReviewCard } from './review';
import type { ItemBought } from './usage';
import type { ItemStat } from './types';

export type BuyVerdict =
  | 'followed' // l'item conseillé, ou un item qui répond au même conseil
  | 'plan' // dans le plan, ordre différent
  | 'counter' // conseil contre leur équipe non suivi : il n'a pas de winrate, on le signale sans chiffrer
  | 'close' // autre item, écart trop faible pour conclure
  | 'costly' // autre item, nettement moins bien placé
  | 'unknown'; // rien à comparer

export interface BuyLine {
  id: number;
  name: string;
  recoName: string | null;
  verdict: BuyVerdict;
  lost: number;
  value?: number;
  recoValue?: number;
  /** Faille : rang auquel les winrates ont été comparés. */
  slot?: number;
  why?: string;
}

export interface BuyReview {
  lines: BuyLine[];
  /** Achats notés : tout sauf `unknown`. */
  analysed: number;
  /** Parmi eux : achats qui suivent le plan. */
  onPlan: number;
  lost: number;
  /** Refait après coup avec les stats actuelles, sans la raison du conseil. */
  approx?: boolean;
}

/** Valeur d'un item par id ; les items transformés (Muramana…) se retrouvent sous l'id de ce qui s'achète. */
export function itemValues(stats: ItemStat[] | undefined, buyable: (id: number) => number = (id) => id): Map<number, ItemStat> {
  const out = new Map<number, ItemStat>();
  for (const s of stats ?? []) {
    out.set(s.id, s);
    const base = buyable(s.id);
    if (base !== s.id && !out.has(base)) out.set(base, s);
  }
  return out;
}

export function reviewBuy(e: ItemBought, name: (id: number) => string): BuyLine {
  const line = (verdict: BuyVerdict, lost = 0): BuyLine => ({
    id: e.id,
    name: name(e.id),
    recoName: e.reco == null ? null : name(e.reco),
    verdict,
    lost,
    ...(e.value != null ? { value: e.value } : {}),
    ...(e.recoValue != null ? { recoValue: e.recoValue } : {}),
    ...(e.slot != null ? { slot: e.slot } : {}),
    ...(e.why ? { why: e.why } : {}),
  });
  if (e.reco == null) return line('unknown');
  if (e.followed || e.covers) return line('followed');
  if (e.plan.includes(e.id)) return line('plan');
  if (e.why?.startsWith('contre') || e.why?.startsWith('bottes contre')) return line('counter');
  if (e.boots || e.value == null || e.recoValue == null || !e.games || !e.recoGames) return line('unknown');
  const card = (id: number, value: number, games: number): ReviewCard => ({ id, name: name(id), value, games, estimated: false });
  const r = reviewChoice(null, [card(e.id, e.value, e.games), card(e.reco, e.recoValue, e.recoGames)], e.id);
  return r.verdict === 'costly' ? line('costly', r.lost) : line('close');
}

export function reviewBuys(events: ItemBought[], name: (id: number) => string, approx = false): BuyReview | null {
  // Item revendu puis racheté (ou annulation au shop) : une seule décision, la dernière
  const last = new Map<number, ItemBought>();
  for (const e of events) {
    last.delete(e.id);
    last.set(e.id, e);
  }
  if (!last.size) return null;
  const lines = [...last.values()].map((e) => reviewBuy(e, name));
  const noted = lines.filter((l) => l.verdict !== 'unknown');
  return {
    lines,
    analysed: noted.length,
    onPlan: noted.filter((l) => l.verdict === 'followed' || l.verdict === 'plan').length,
    lost: noted.reduce((n, l) => n + l.lost, 0),
    ...(approx ? { approx: true } : {}),
  };
}

/** Partie d'un achat noté avant la v1.64 : même champion, entre le début de la partie et 15 min après sa fin. */
export function gameOfBuy<G extends { championId: number; createdAt: number; durationSec: number }>(e: ItemBought, games: G[]): G | null {
  return games.find((g) => g.championId === e.championId && e.at >= g.createdAt && e.at <= g.createdAt + (g.durationSec + 900) * 1000) ?? null;
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;

/** Phrase affichée pour un achat ; null quand il n'y a rien à dire (la ligne d'en-tête suffit). */
export function buyText(l: BuyLine): string | null {
  if (l.verdict === 'counter') return `${l.name} : ${l.recoName} était conseillé ${l.why}.`;
  if (l.verdict === 'costly') return `${l.name} (${pct(l.value!)}) : ${l.recoName} était mieux placé (${pct(l.recoValue!)})${l.slot ? ` en ${l.slot}e item` : ''}, environ ${points(l.lost)} pts perdus.`;
  return null;
}
