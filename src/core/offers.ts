// Tirages d'augments d'une partie : plusieurs choix peuvent tomber sur le même palier de niveau.
// Le niveau seul ne les sépare pas : l'augment en plus (K/DA, vu sur 2 parties réelles) arrive au même « round ».
// Une relance change une carte et garde les autres ; un nouveau choix n'a aucune carte commune avec le précédent.

export interface OfferSlot {
  round: number | null;
  ids: number[];
  /** Rang du tirage dans ce round et ce type : 0 pour le premier, 1 pour le suivant. */
  choice: number;
  kind: 'augment' | 'headliner';
}

export const offerKind = (ids: number[]): OfferSlot['kind'] => (ids.every((id) => id >= 3170 && id < 3200) ? 'headliner' : 'augment');

/**
 * Index des cartes d'une lecture complète déjà vues à un choix précédent. Une carte vue ne revient pas de la partie (0 sur 439,
 * voir reroll.ts) : c'est un augment que tu possèdes, lu ailleurs à l'écran (3 nov. : Giant Slayer, pris au choix 2, lu pendant
 * les relances du choix 3 et conseillé 4 s). Les Pentakill reviennent, elles. Des cartes laissées ouvertes au palier suivant
 * restent le même tirage : 2 cartes communes suffisent, quel que soit le choix.
 */
export function ghostCards(ids: number[], draw: { round: number | null; ids: number[]; seen: Set<number>; before: Set<number> }, round: number | null): number[] {
  const shared = ids.filter((id) => draw.ids.includes(id)).length;
  const past = shared >= 2 || (shared === 1 && draw.round === round) ? draw.before : draw.seen;
  return ids.flatMap((id, i) => (past.has(id) && offerKind([id]) === 'augment' ? [i] : []));
}

/** Rang à donner à une lecture complète, d'après les tirages déjà gardés pour ce round et ce type. */
export function offerChoice(sameSlot: { ids: number[] }[], ids: number[]): number {
  const last = sameSlot[sameSlot.length - 1];
  if (!last) return 0;
  return last.ids.some((id) => ids.includes(id)) ? sameSlot.length - 1 : sameSlot.length;
}

/**
 * Tirages à retenir en fin de partie, avec la carte prise. Trois relances d'affilée entre deux lectures ressemblent
 * à un nouveau choix (vu une fois sur 17 parties) : le tirage sans carte prise est écarté si un autre du même round
 * en a une. Si aucun n'en a (partie finie avant le choix), seul le dernier reste.
 */
export function settleOffers<T extends OfferSlot>(offers: T[], augments: number[]): { offer: T; picked: number | null }[] {
  const pickedIn = (o: T) => o.ids.find((id) => augments.includes(id)) ?? null;
  const slot = (o: T) => `${o.round ?? 0}:${o.kind}`;
  const taken = new Set<number>();
  return offers
    .filter((o) => {
      const picked = pickedIn(o);
      if (picked != null) {
        // Cartes laissées ouvertes jusqu'au palier suivant : relues à ce palier, c'est la même décision.
        if (taken.has(picked)) return false;
        taken.add(picked);
        return true;
      }
      const others = offers.filter((x) => slot(x) === slot(o));
      return !others.some((x) => pickedIn(x) != null) && others[others.length - 1] === o;
    })
    .map((offer) => ({ offer, picked: pickedIn(offer) }));
}

export interface SeenRead {
  at: number;
  championId: number;
  round: number | null;
  ids: number[];
  unsure: boolean;
}

/** Au-delà, deux lectures qui partagent une carte ne sont pas le même tirage. */
const MAX_DRAW_GAP = 120_000;

const sameCards = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * Lectures successives d'un tirage terminé, retrouvées dans `usage.json` (parties d'avant la v1.66) en remontant depuis les
 * cartes du choix. On s'arrête à la première lecture sans carte commune, comme `offerChoice`.
 */
export function drawFromSeen(seen: SeenRead[], offer: { championId: number; round: number | null; ids: number[]; from: number; until: number }): number[][] {
  const reads = seen.filter((e) => e.championId === offer.championId && e.round === offer.round && !e.unsure && e.ids.length === 3 && e.at >= offer.from && e.at <= offer.until);
  let i = reads.map((e) => sameCards(e.ids, offer.ids)).lastIndexOf(true);
  if (i < 0) return [];
  const steps = [{ ...reads[i] }];
  for (i--; i >= 0; i--) {
    const [next] = steps;
    const read = reads[i];
    if (next.at - read.at > MAX_DRAW_GAP || !read.ids.some((id) => next.ids.includes(id))) break;
    if (sameCards(read.ids, next.ids)) next.at = read.at;
    else steps.unshift({ ...read });
  }
  return steps.map((s) => s.ids);
}

/**
 * Cartes vues dans cette partie avant un tirage (`first` : ses premières cartes). Elles ne reviennent pas : 0 carte répétée
 * sur 439 dans 23 parties réelles, 17 attendues si les tirages étaient indépendants.
 */
export function seenBefore(seen: SeenRead[], game: { championId: number; from: number; until: number }, first: number[]): number[] {
  const reads = seen.filter((e) => e.championId === game.championId && e.at >= game.from && e.at <= game.until);
  const start = reads.findIndex((e) => e.ids.some((id) => first.includes(id)));
  return reads.slice(0, Math.max(start, 0)).flatMap((e) => e.ids);
}
