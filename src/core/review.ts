// Revue des choix d'augments, sur le principe de la revue de partie aux échecs : on juge la décision prise, avec
// les cartes qui étaient proposées, et pas le résultat de la partie.
// Pourquoi : il faudrait environ 1 500 parties par groupe pour voir un écart de 5 points sur le winrate de Celian.
// Les stats globales portent sur bien plus de parties, donc chaque décision peut être notée dès la première partie.
//
// Limite à garder à l'esprit : la note mesure l'écart avec les stats globales, pas ce qui était vraiment le mieux
// dans cette partie. Dans le doute (peu de parties, estimation), on dit « proche » ou « non noté », jamais « erreur ».

export type ReviewVerdict = 'best' | 'close' | 'costly' | 'unknown';

export interface ReviewCard {
  id: number;
  name: string;
  /** Winrate au moment du choix, correction de build comprise : la même valeur que le conseil en partie. */
  value: number;
  games: number;
  estimated: boolean;
}

export interface ReviewChoice {
  round: number | null;
  cards: ReviewCard[];
  picked: number | null;
  best: number | null;
  /** Points de winrate estimés perdus (fraction, 0.024 = 2,4 pts). 0 sauf pour un choix coûteux. */
  lost: number;
  verdict: ReviewVerdict;
}

export interface GameReview {
  choices: ReviewChoice[];
  /** Choix notés (ni carte prise non lue, ni données insuffisantes). */
  analysed: number;
  /** Parmi les choix notés : meilleure carte, ou écart trop faible pour conclure. */
  solid: number;
  lost: number;
  /** Refait après coup avec les stats actuelles, sans la correction de build de la partie. */
  approx?: boolean;
}

/** En dessous d'un point d'écart, deux cartes se valent en pratique. */
const MIN_LOST = 0.01;
/** Écart à dépasser, en erreurs types : environ 95 % de confiance que la carte conseillée est devant. */
const CONFIDENCE_Z = 1.64;

const variance = (c: ReviewCard) => {
  const p = Math.min(0.99, Math.max(0.01, c.value));
  return (p * (1 - p)) / Math.max(1, c.games);
};

export function reviewChoice(round: number | null, cards: ReviewCard[], picked: number | null): ReviewChoice {
  const ranked = [...cards].sort((a, b) => b.value - a.value);
  const top = ranked[0] ?? null;
  const mine = cards.find((c) => c.id === picked) ?? null;
  const out = (verdict: ReviewVerdict, lost = 0): ReviewChoice => ({ round, cards, picked, best: top?.id ?? null, lost, verdict });
  if (!top || !mine || mine.estimated || top.estimated) return out('unknown');
  if (mine.id === top.id) return out('best');
  const lost = top.value - mine.value;
  const noise = CONFIDENCE_Z * Math.sqrt(variance(top) + variance(mine));
  return lost < MIN_LOST || lost < noise ? out('close') : out('costly', lost);
}

export function reviewGame(choices: ReviewChoice[], approx = false): GameReview | null {
  if (!choices.length) return null;
  const sorted = [...choices].sort((a, b) => (a.round ?? 9) - (b.round ?? 9));
  const noted = sorted.filter((c) => c.verdict !== 'unknown');
  return {
    choices: sorted,
    analysed: noted.length,
    solid: noted.filter((c) => c.verdict !== 'costly').length,
    lost: noted.reduce((n, c) => n + c.lost, 0),
    ...(approx ? { approx: true } : {}),
  };
}

export const roundLabel = (round: number | null): string => (round ? (['Début', 'Niveau 7', 'Niveau 11', 'Niveau 15'][round - 1] ?? `Choix ${round}`) : 'Choix');

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}\u00a0%`; // espace insécable : le « % » ne part pas seul à la ligne
export const points = (x: number) => (x * 100).toFixed(1).replace('.', ',');

/** Une phrase par choix, affichée telle quelle. */
export function choiceText(c: ReviewChoice): string {
  const mine = c.cards.find((x) => x.id === c.picked);
  const top = c.cards.find((x) => x.id === c.best);
  if (!mine) return 'Carte prise non lue à l’écran : choix non noté.';
  if (c.verdict === 'unknown' || !top) return `${mine.name} : pas assez de données pour noter ce choix.`;
  if (c.verdict === 'best') return `${mine.name} : la meilleure des cartes proposées (${pct(mine.value)}).`;
  if (c.verdict === 'close') return `${mine.name} (${pct(mine.value)}) : proche de ${top.name} (${pct(top.value)}), écart trop faible pour conclure.`;
  return `${mine.name} (${pct(mine.value)}) : ${top.name} était mieux placé (${pct(top.value)}), environ ${points(c.lost)} pts perdus.`;
}

export interface ReviewSummary {
  games: number;
  analysed: number;
  solid: number;
  /** Points estimés perdus par partie notée. */
  lostPerGame: number;
  worst: ReviewChoice | null;
}

/** Bilan sur plusieurs parties ; null si aucune partie n'a de choix noté. */
export function reviewSummary(reviews: (GameReview | undefined)[]): ReviewSummary | null {
  const list = reviews.filter((r): r is GameReview => !!r && r.analysed > 0);
  if (!list.length) return null;
  const costly = list.flatMap((r) => r.choices).filter((c) => c.verdict === 'costly');
  return {
    games: list.length,
    analysed: list.reduce((n, r) => n + r.analysed, 0),
    solid: list.reduce((n, r) => n + r.solid, 0),
    lostPerGame: list.reduce((n, r) => n + r.lost, 0) / list.length,
    worst: costly.sort((a, b) => b.lost - a.lost)[0] ?? null,
  };
}
