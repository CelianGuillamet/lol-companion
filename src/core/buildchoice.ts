// Le build suit tes augments. Sans item acheté, le conseil prenait toujours le 1er build du champion, même après un
// augment qui joue sur la puissance. arammeta ne croise pas augments et builds : aucune donnée ne dit lequel gagne avec
// quel augment. On ne change donc de build qu'entre builds à moins de 2 points de winrate, et seulement tant que tu n'as
// rien investi dans l'autre. L'augment pris n'est connu qu'en fin de partie : on suppose la carte conseillée (74 choix
// suivis sur 96, usage.json du 3 nov.). Pur et testable.

import { buildProfile, fitOf, type Fit, type FitTag } from './augfit';

const MAX_GAP = 0.02;
const MIN_GAMES = 1000;
/** Écart minimal : la moitié du build de plus dans ce que l'augment exploite. */
const MIN_LEAN = 0.5;
/** Les tags qui orientent un build. Pas `attacks` : le texte de nombreux augments cite les attaques sans en dépendre. */
const DECISIVE: FitTag[] = ['ap', 'ad', 'crit', 'as', 'tank'];

export interface CoreChoice {
  items: number[];
  winrate: number;
  games: number;
}

export interface TakenAugment {
  id: number;
  name: string;
  tags: Set<FitTag>;
}

type Cat = (id: number) => string[];
type Components = (id: number) => number[];

/** Ce que tu as déjà mis dans ce build : items du cœur et leurs composants, chaque objet compté une fois. */
export function invested(items: number[], owned: number[], components: Components): number {
  const have = [...owned];
  let n = 0;
  const walk = (id: number, depth: number) => {
    const k = have.indexOf(id);
    if (k >= 0) {
      have.splice(k, 1);
      n++;
    } else if (depth < 3) for (const c of components(id)) walk(c, depth + 1);
  };
  for (const id of items) walk(id, 0);
  return n;
}

/** Le build en cours (le plus investi, le 1er à égalité) et ceux qu'on peut encore lui préférer. */
export function openCores(cores: CoreChoice[], owned: number[], components: Components): { base: number; open: number[] } {
  const spent = cores.map((c) => invested(c.items, owned, components));
  const base = spent.indexOf(Math.max(0, ...spent));
  const ref = cores[base];
  const open = cores.flatMap((c, k) => (k !== base && ref && spent[k] >= spent[base] && c.games >= MIN_GAMES && ref.winrate - c.winrate <= MAX_GAP ? [k] : []));
  return { base, open };
}

const leanOf = (tags: Set<FitTag>, profile: Record<FitTag, number>) => Math.max(0, ...DECISIVE.filter((t) => tags.has(t)).map((t) => profile[t]));

/** Build proche que tes augments poussent, `null` s'il n'y en a pas. Deux augments opposés s'annulent. */
export function preferredCore(cores: CoreChoice[], taken: TakenAugment[], owned: number[], cat: Cat, components: Components): { index: number; base: number; augments: TakenAugment[] } | null {
  if (!taken.length) return null;
  const { base, open } = openCores(cores, owned, components);
  const profile = (k: number) => buildProfile(cores[k].items, [], cat);
  const total = (k: number) => taken.reduce((sum, a) => sum + leanOf(a.tags, profile(k)), 0);
  let best: { index: number; gain: number } | null = null;
  for (const k of open) {
    const gain = total(k) - total(base);
    if (gain >= MIN_LEAN && (!best || gain > best.gain)) best = { index: k, gain };
  }
  if (!best) return null;
  const chosen = profile(best.index);
  return { index: best.index, base, augments: taken.filter((a) => leanOf(a.tags, chosen) >= 0.5) };
}

/**
 * `fitOf` tant que le build n'est pas joué : pas de malus pour un augment qui va avec un build proche encore possible.
 * Sinon la carte perdait des points contre le 1er build, et le build ne pouvait jamais la suivre. Jamais de bonus ici.
 */
export function fitWithAlternatives(tags: Set<FitTag>, profile: Record<FitTag, number>, alternatives: Record<FitTag, number>[], seen: number): Fit {
  const fit = fitOf(tags, profile, seen);
  if (fit.delta >= 0) return fit;
  return alternatives.some((p) => fitOf(tags, p, seen).delta > 0) ? { delta: 0, why: null, good: true } : fit;
}
