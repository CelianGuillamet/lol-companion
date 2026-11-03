// Conseiller de reroll : faut-il relancer une carte d'augment, et laquelle ?
// Règles mesurées (2 nov., 92 tirages réels) : chaque carte se relance une fois, gratuitement, à chaque choix ; une relance
// reste dans la rareté du tirage, ne redonne jamais une carte déjà vue du tirage ; Command Line : la 1re relance du
// choix monte d'un cran. La répartition des cartes vues est compatible avec un tirage uniforme dans la rareté.
// Une carte vue une fois ne revient pas de la partie, même d'un choix à l'autre (0 répétition sur 439 cartes, 23 parties).

import { CONFIDENCE_Z, variance, type ReviewCard } from './review';

/** Écart minimal pour conseiller une relance qui ne risque rien (0,1 pt). */
export const FREE_MIN = 0.001;
/** Relancer la meilleure carte la fait perdre : même exigence que la revue pour parler d'un écart (1 pt). */
export const RISKY_MIN = 0.01;
/** En dessous, la rareté est trop mal connue pour ce champion : on se tait. */
export const MIN_POOL = 8;
/** Le calcul est cubique en taille du pool : on le résume, il tourne à chaque lecture de cartes. */
const MAX_VALUES = 24;

export interface RerollCard {
  id: number;
  value: number;
  /** Déjà relancée : plus de relance possible sur cette carte. */
  rolled: boolean;
}

export interface RerollAdvice {
  /** free : relancer ne coûte rien ; risky : relancer la meilleure carte vaut le risque ; keep : ne plus relancer. */
  kind: 'free' | 'risky' | 'keep';
  /** Cartes à relancer, la moins bonne d'abord. */
  targets: number[];
  /** Points de winrate gagnés en moyenne en jouant bien (0,01 = 1 pt). */
  gain: number;
  /** risky : chance de trouver mieux que la carte relancée, et la carte qui reste si c'est moins bien. */
  better?: number;
  fallback?: number;
  /** La prochaine relance monte d'un cran (Command Line). */
  upgrade: boolean;
  /** Relances encore possibles. */
  left: number;
  /** keep : la relance conseillée aurait retiré une carte qui fait combo. */
  combo?: boolean;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Pool résumé en paquets de même taille : garde la moyenne et la forme de la distribution. */
export function thin(values: number[], max = MAX_VALUES): number[] {
  if (values.length <= max) return values;
  const sorted = [...values].sort((a, b) => a - b);
  return Array.from({ length: max }, (_, i) => mean(sorted.slice(Math.floor((i * sorted.length) / max), Math.floor(((i + 1) * sorted.length) / max))));
}

type Slot = { value: number; rolled: boolean };

/** Valeur finale espérée d'un tirage en jouant au mieux. `first` : pool de la prochaine relance (Command Line). */
function worth(slots: Slot[], pool: number[], first: number[]): number {
  let best = Math.max(...slots.map((s) => s.value));
  slots.forEach((s, i) => {
    if (!s.rolled) best = Math.max(best, afterRoll(slots, i, pool, first));
  });
  return best;
}

function afterRoll(slots: Slot[], i: number, pool: number[], first: number[]): number {
  let sum = 0;
  for (const value of first) {
    const next = slots.map((s, j) => (j === i ? { value, rolled: true } : s));
    sum += worth(next, pool, pool);
  }
  return sum / first.length;
}

/**
 * `pool` : valeurs des cartes encore possibles dans la rareté du tirage (sans celles déjà vues dans la partie).
 * `upgraded` : valeurs de la rareté du dessus quand la prochaine relance monte d'un cran, sinon null.
 * Null si une des deux est trop mal connue.
 */
export function adviseReroll(cards: RerollCard[], pool: number[], upgraded: number[] | null): RerollAdvice | null {
  if (cards.length !== 3 || pool.length < MIN_POOL || (upgraded && upgraded.length < MIN_POOL)) return null;
  const base = thin(pool);
  const first = upgraded ? thin(upgraded) : base;
  const fullFirst = upgraded ?? pool;
  const upgrade = !!upgraded;
  const left = cards.filter((c) => !c.rolled).length;
  const ranked = [...cards].sort((a, b) => b.value - a.value);
  const top = ranked[0];
  const keep = (): RerollAdvice => ({ kind: 'keep', targets: [], gain: 0, upgrade: false, left });
  const gainOf = (c: RerollCard) => afterRoll(cards, cards.indexOf(c), base, first) - top.value;

  // Relancer une carte qu'on ne prendrait pas ne peut pas faire perdre : on commence toujours par là
  const free = ranked.slice(1).reverse().filter((c) => !c.rolled && gainOf(c) >= FREE_MIN);
  if (free.length) {
    const gain = worth(cards, base, first) - top.value;
    // Command Line : seule la 1re relance monte, elle va sur la moins bonne carte
    return { kind: 'free', targets: upgrade ? [free[0].id] : free.map((c) => c.id), gain, upgrade, left };
  }
  if (!top.rolled) {
    const gain = gainOf(top);
    if (gain >= RISKY_MIN) {
      const better = fullFirst.filter((v) => v > top.value).length / fullFirst.length;
      return { kind: 'risky', targets: [top.id], gain, better, fallback: ranked[1].id, upgrade, left };
    }
  }
  return keep();
}

// ---------------------------------------------------------------- revue après la partie

/** Relance notée après la partie. On juge le pari au moment où il est fait, pas la carte reçue. */
export interface RerollNote {
  /** costly : meilleure carte relancée à tort ; good : pari justifié ; unused : relance gratuite laissée. */
  verdict: 'costly' | 'good' | 'unused';
  /** Carte relancée, ou celle qu'il restait à relancer (unused). */
  name: string;
  value: number;
  /** Écart moyen en jouant bien ensuite (fraction, 0,02 = 2 pts). */
  delta: number;
}

type HandCard = ReviewCard & { rolled: boolean };

const lockCard = (hand: HandCard[], i: number): Slot[] => hand.map((c, j) => ({ value: c.value, rolled: c.rolled || j === i }));

/** Pari sur la meilleure carte : relancer contre la garder et jouer le reste au mieux. Null : rien à dire. */
function judgeRoll(hand: HandCard[], i: number, pool: number[], first: number[]): RerollNote | null {
  const out = hand[i];
  if (out.rolled || hand.some((c) => c.estimated) || hand.some((c) => c.value > out.value)) return null;
  const delta = worth(lockCard(hand, i), pool, first) - afterRoll(hand, i, pool, first);
  const noise = CONFIDENCE_Z * Math.sqrt(variance(out));
  if (delta >= RISKY_MIN && delta >= noise) return { verdict: 'costly', name: out.name, value: out.value, delta };
  if (-delta >= RISKY_MIN) return { verdict: 'good', name: out.name, value: out.value, delta: -delta };
  return null;
}

/**
 * Relances d'un tirage, d'après les lectures successives (la dernière = cartes au moment du choix). Null si rien de net.
 * Plusieurs cartes changent parfois entre deux lectures (42 fois sur 127) et l'ordre réel est inconnu : on suppose le plus
 * favorable (la moins bonne carte d'abord, remplacée par la meilleure carte reçue), pour ne jamais inventer une erreur.
 * `pool` : valeurs de la rareté hors cartes de la 1re lecture ; `upgraded` : rareté du dessus, 1re relance Command Line.
 */
export function reviewDraw(steps: ReviewCard[][], pool: number[], upgraded: number[] | null): RerollNote | null {
  if (!steps.length || steps.some((s) => s.length !== 3) || pool.length < MIN_POOL) return null;
  const base = thin(pool);
  const up = upgraded && upgraded.length >= MIN_POOL ? thin(upgraded) : null;
  let hand: HandCard[] = steps[0].map((c) => ({ ...c, rolled: false }));
  let rolls = 0;
  const notes: RerollNote[] = [];
  const firstPool = () => (rolls === 0 && up ? up : base);
  for (const next of steps.slice(1)) {
    const outs = hand.filter((c) => !next.some((n) => n.id === c.id)).sort((a, b) => a.value - b.value);
    const ins = next.filter((n) => !hand.some((c) => c.id === n.id)).sort((a, b) => b.value - a.value);
    outs.forEach((out, k) => {
      const note = judgeRoll(hand, hand.indexOf(out), base, firstPool());
      if (note) notes.push(note);
      hand = hand.map((c) => (c.id === out.id ? { ...ins[k], rolled: true } : c));
      rolls++;
    });
  }
  const costly = notes.filter((n) => n.verdict === 'costly').sort((a, b) => b.delta - a.delta)[0];
  if (costly) return costly;
  if (!hand.some((c) => c.estimated)) {
    const top = hand.reduce((a, b) => (b.value > a.value ? b : a));
    const gain = worth(lockCard(hand, hand.indexOf(top)), base, firstPool()) - top.value;
    const target = hand.filter((c) => c !== top && !c.rolled).sort((a, b) => a.value - b.value)[0];
    if (target && gain >= RISKY_MIN) return { verdict: 'unused', name: target.name, value: target.value, delta: gain };
  }
  return notes.sort((a, b) => b.delta - a.delta)[0] ?? null;
}
