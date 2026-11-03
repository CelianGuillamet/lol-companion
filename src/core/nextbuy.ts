// « Prochain achat » : en ARAM on n'achète qu'en étant mort (ou au début). L'API Live Client du jeu
// (https://127.0.0.1:2999/liveclientdata, officielle) donne ton or et tes items ; on en déduit le prochain item
// du build le plus gagnant que tu n'as pas encore, plus les items contre l'équipe adverse.

import { ELIXIR_IDS } from './elixir';
import { wilson } from './stats';

export interface BuildCore {
  core: number[];
  options: { id: number; winrate: number; games?: number }[];
}

export interface NextBuyInput {
  owned: number[];
  gold: number;
  cores: BuildCore[]; // dans l'ordre d'affichage (le meilleur d'abord)
  boots: number[]; // bottes conseillées, la meilleure d'abord
  counters: { title: string; items: number[]; urgent?: boolean }[];
  allBoots: Set<number>; // toutes les bottes (pour savoir si tu en as déjà)
  price: (id: number) => number | null;
  components?: (id: number) => number[]; // composants directs (items.json du client)
  /** Item « fini » (pour dessiner ton parcours : on ne montre pas les composants). */
  complete?: (id: number) => boolean;
  /** Items conseillés que tu as déjà passés 2 fois cette partie (tu as acheté autre chose) : ils passent en dernier. */
  skipped?: Set<number>;
  /** Item de base d'un item transformé (items.json du client : specialRecipe). */
  specialRecipe?: (id: number) => number | null;
  /** Conseil précédent, à garder en tête tant que l'inventaire ne change pas (pas de va-et-vient pendant une attente). */
  keep?: number | null;
  /** Libellés selon la source du build (Faille / OP.GG : cœur le plus joué, puis 4e item). */
  labels?: { core: string; option: string };
  /** Items exigés par un augment lié (itembound.ts) : ils passent avant le reste, l'augment ne vaut rien sans eux. */
  bound?: { id: number; why: string }[];
  /** Build poussé par tes augments (buildchoice.ts) : départage les builds à égalité, jamais devant un item de ton inventaire. */
  prefer?: number | null;
  /** Ce qui occupe les 6 places du sac (Live Client, `slot` 0 à 5), sans la relique. Absent : place non vérifiée. */
  bag?: number[];
  /** Or rendu à la revente (Data Dragon). `null` : valeur inconnue, l'objet ne compte pas dans l'or disponible. */
  sellValue?: (id: number) => number | null;
}

/** Places du sac. La relique et le Poro-Snax de Mayhem (`slot` 6 et plus) n'en prennent pas. */
export const BAG_SLOTS = 6;

/** Au-delà, ce n'est plus un composant ordinaire : on ne propose pas de le vendre. */
const SELL_MAX = 1500;

/** Jamais proposés à la vente : ils portent une progression (quête de support, charges de Dark Seal et Mejai, mana du Tear). */
const KEEP_IN_BAG = new Set([3865, 3866, 3867, 1082, 3041, 3070]);

/** Une ou deux reventes, pas plus : au-delà, ce n'est plus une consigne qu'on suit le temps d'un retour en base. */
const RESALE_MAX = 2;

/**
 * Items qui se transforment une fois chargés : tu as Fimbulwinter, donc tu as « acheté » Winter's Approach.
 * Sans ça, le prochain achat restait bloqué sur un item déjà acheté.
 */
export const TRANSFORMS: Record<number, number> = {
  3121: 3119, // Fimbulwinter ← Winter's Approach
  3042: 3004, // Muramana ← Manamune
  3040: 3003, // Seraph's Embrace ← Archangel's Staff
};

/** Tes items + ceux dont ils sont la version transformée (client : specialRecipe, sinon table connue). */
export function expandOwned(owned: number[], specialRecipe: (id: number) => number | null = () => null): number[] {
  const out = [...owned];
  for (const id of owned) {
    const base = specialRecipe(id) || TRANSFORMS[id];
    if (base && !out.includes(base)) out.push(base);
  }
  return out;
}

export interface PlanSlot {
  id: number;
  owned: boolean;
  why?: string;
}

export interface NextBuyRow {
  id: number;
  why: string;
  price: number | null;
  /** Ce qu'il reste à payer : prix total moins les composants que tu as déjà dans l'inventaire. */
  remaining: number | null;
  missing: number; // or manquant (0 si achetable)
  step?: { id: number; price: number }; // composant à acheter maintenant si l'item complet est trop cher
  /** Sac plein et l'item ne consomme rien : `sell` = ce qu'il faut vendre d'abord, `null` = plus de composant à vendre. */
  room?: { sell: number | null };
  /** Sans ces ventes l'or manque, avec elles l'achat passe (`gain` = or rendu, somme des `gold.sell`). */
  resale?: Resale;
}

export interface Resale {
  sell: number[];
  gain: number;
}

/**
 * Composant de plus grande valeur achetable maintenant pour avancer vers `target` (en descendant l'arbre,
 * en sautant ceux que tu as déjà). `price` dans le résultat est le montant à payer après déduction des
 * sous-composants possédés, pas le prix total de l'item.
 */
export function bestComponent(target: number, gold: number, owned: number[], price: (id: number) => number | null, components: (id: number) => number[], fits: (id: number) => boolean = () => true): { id: number; price: number } | null {
  const have = [...owned];
  const pool: number[] = [];
  const walk = (id: number, depth: number) => {
    for (const c of components(id)) {
      const k = have.indexOf(c);
      if (k >= 0) {
        have.splice(k, 1); // déjà acheté : on ne le recompte pas
        continue;
      }
      pool.push(c);
      if (depth < 3) walk(c, depth + 1);
    }
  };
  walk(target, 0);
  let best: { id: number; price: number } | null = null;
  let bestValue = -1;
  for (const id of pool) {
    const value = price(id);
    // Chaque candidat est un achat alternatif : il peut utiliser les composants physiques disponibles,
    // chacun une seule fois dans sa propre recette (remainingCost), sans déplier les items déjà finis.
    const p = remainingCost(id, owned, price, components);
    if (value != null && p != null && p <= gold && value > bestValue && fits(id)) {
      best = { id, price: p };
      bestValue = value;
    }
  }
  return best;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Ce qu'il reste à payer pour `target` : son prix moins les composants déjà dans ton inventaire (un composant
 * possédé n'est compté qu'une fois, et on ne descend pas sous un composant possédé).
 */
export function remainingCost(target: number, owned: number[], price: (id: number) => number | null, components?: (id: number) => number[]): number | null {
  const total = price(target);
  if (total == null || !components) return total;
  const have = [...owned];
  let saved = 0;
  const walk = (id: number, depth: number) => {
    for (const c of components(id)) {
      const k = have.indexOf(c);
      if (k >= 0) {
        have.splice(k, 1);
        saved += price(c) ?? 0;
      } else if (depth < 3) walk(c, depth + 1);
    }
  };
  walk(target, 0);
  return Math.max(0, total - saved);
}

/**
 * Items du sac que l'achat de `target` consomme. Même parcours que `remainingCost` : c'est ce que la boutique retire.
 * Sac plein, un achat n'est possible que s'il en consomme au moins un.
 */
export function consumedBy(target: number, bag: number[], components: (id: number) => number[]): number[] {
  const have = [...bag];
  const used: number[] = [];
  const walk = (id: number, depth: number) => {
    for (const c of components(id)) {
      const k = have.indexOf(c);
      if (k >= 0) {
        have.splice(k, 1);
        used.push(c);
      } else if (depth < 3) walk(c, depth + 1);
    }
  };
  walk(target, 0);
  return used;
}

/** Prix connu et bas exigés : un objet Mayhem absent du catalogue n'est pas noté fini, il ne doit pas passer pour un composant. */
function sellable(bag: number[], isFinished: (id: number) => boolean, isBoots: (id: number) => boolean, price: (id: number) => number | null): number[] {
  const cheap = (id: number) => {
    const p = price(id);
    return p != null && p > 0 && p < SELL_MAX;
  };
  return bag.filter((id) => cheap(id) && !isFinished(id) && !isBoots(id) && !KEEP_IN_BAG.has(id) && !ELIXIR_IDS.has(id));
}

/**
 * Plus petite vente qui comble `gap`. En ARAM on n'achète qu'en base : un item terminé à ce passage plutôt qu'au suivant
 * vaut plus que le composant perdu. Jamais un composant de `target` (l'item coûterait plus cher d'autant) ni d'un autre
 * achat prévu, sauf `forced`, la vente déjà imposée par le sac plein.
 */
export function resaleFor(target: number, gap: number, bag: number[], planned: number[], forced: number | null, isFinished: (id: number) => boolean, isBoots: (id: number) => boolean, price: (id: number) => number | null, components: (id: number) => number[], sellValue: (id: number) => number | null): Resale | null {
  const left = [...bag];
  for (const id of consumedBy(target, bag, components)) left.splice(left.indexOf(id), 1);
  if (forced != null) left.splice(left.indexOf(forced), 1);
  const needed = new Set(planned.filter((id) => id !== target).flatMap((id) => consumedBy(id, left, components)));
  const rows = sellable(left, isFinished, isBoots, price)
    .filter((id) => !needed.has(id) && (sellValue(id) ?? 0) > 0)
    .sort((a, b) => sellValue(a)! - sellValue(b)!);
  const base = forced == null ? [] : [forced];
  const worth = (ids: number[]) => ids.reduce((sum, id) => sum + (sellValue(id) ?? 0), 0);
  const options = [base, ...rows.map((id) => [...base, id]), ...rows.flatMap((a, k) => rows.slice(k + 1).map((b) => [...base, a, b]))];
  const best = options
    .filter((ids) => ids.length > 0 && ids.length <= RESALE_MAX && worth(ids) >= gap)
    .sort((a, b) => worth(a) - worth(b) || a.length - b.length)[0];
  return best ? { sell: best, gain: worth(best) } : null;
}

/**
 * Ce qu'il faut vendre pour faire une place : un composant ou une potion, jamais un item fini ni des bottes.
 * D'abord ce qui ne sert à aucun achat prévu, puis le moins cher (la revente rend moins que le prix payé).
 */
export function itemToSell(bag: number[], planned: number[], isFinished: (id: number) => boolean, isBoots: (id: number) => boolean, price: (id: number) => number | null, components: (id: number) => number[]): number | null {
  const needed = new Set(planned.flatMap((id) => consumedBy(id, bag, components)));
  const rows = sellable(bag, isFinished, isBoots, price);
  rows.sort((a, b) => Number(needed.has(a)) - Number(needed.has(b)) || (price(a) ?? 0) - (price(b) ?? 0));
  return rows[0] ?? null;
}

// Option classée par la borne basse de son intervalle à 95 % quand on connaît l'échantillon (60 % sur 80 parties
// ne passe pas devant 55 % sur 20 000), sinon par winrate brut.
const score = (o: { winrate: number; games?: number }) => (o.games ? wilson(o.winrate, o.games).lo : o.winrate);

/** Rang du prochain item fini : les items déjà finis, bottes à part, plus un. */
export function itemSlot(owned: number[], counts: (id: number) => boolean): number {
  return new Set(owned.filter(counts)).size + 1;
}

const SLOT_MIN_GAMES = 50;

/**
 * Options du rang à acheter. Le winrate monte avec le rang (les parties qui voient un 5e item sont déjà bien engagées) :
 * on ne compare que des items du même rang. Sans au moins 2 items disponibles à ce rang, on garde les options fusionnées.
 */
export function optionsForSlot<O extends { id: number; winrate: number; games?: number }>(options: O[], stats: { id: number; winrate: number; games: number }[] | undefined, unavailable: (id: number) => boolean, buyable: (id: number) => number = (id) => id): (O | { id: number; winrate: number; games: number })[] {
  const rows = (stats ?? []).map((s) => ({ ...s, id: buyable(s.id) })).filter((s) => s.games >= SLOT_MIN_GAMES && !unavailable(s.id));
  return rows.length >= 2 ? rows : options;
}

export function nextBuys(i: NextBuyInput, max = 3): { coreIndex: number; rows: NextBuyRow[]; plan: PlanSlot[] } {
  const owned = new Set(expandOwned(i.owned, i.specialRecipe));
  // Le build suivi : celui qui recoupe le plus tes items (sinon le meilleur)
  let coreIndex = 0;
  let best = -1;
  i.cores.forEach((c, k) => {
    const ids = [...c.core, ...c.options.map((o) => o.id)];
    // À égalité, le build qui contient l'item de ton augment
    const overlap = ids.filter((id) => owned.has(id)).length + (i.bound?.some((b) => ids.includes(b.id)) ? 0.5 : 0) + (i.prefer === k ? 0.25 : 0);
    if (overlap > best) {
      best = overlap;
      coreIndex = k;
    }
  });
  const c = i.cores[coreIndex];
  const hasBoots = i.owned.some((id) => i.allBoots.has(id));
  const seq: { id: number; why: string }[] = [];
  const push = (id: number, why: string) => {
    if (!owned.has(id) && !seq.some((s) => s.id === id)) seq.push({ id, why });
  };
  // Avant le reste même sac plein : l'item d'un augment lié, ceux d'une menace forte
  const must = new Set<number>();
  for (const b of i.bound ?? []) {
    push(b.id, b.why);
    must.add(b.id);
  }
  // Bottes : celles qu'impose une menace forte en face (Mercury contre 70 % de magie), sinon les plus gagnantes
  const urgentBoots = i.counters.filter((t) => t.urgent).flatMap((t) => t.items).find((x) => i.allBoots.has(x));
  const bootsPick = urgentBoots ?? i.boots[0];
  if (c) {
    const missingCore = c.core.filter((id) => !owned.has(id));
    if (missingCore.length) push(missingCore[0], i.labels?.core ?? 'build le plus gagnant');
    if (!hasBoots && bootsPick && missingCore.length < c.core.length) push(bootsPick, bootsPick === urgentBoots ? 'bottes contre leur équipe' : 'bottes');
  }
  // Une seule paire de bottes : déjà achetées ou déjà prévues → on saute les bottes conseillées contre eux
  const bootsPlanned = () => hasBoots || seq.some((x) => i.allBoots.has(x.id));
  // Menace forte en face (ex. 70 % de dégâts magiques) : son item passe avant la fin du build
  // Une menace est couverte dès que tu as un de ses items (Morellonomicon = anti-soins : pas besoin d'Oblivion Orb en
  // plus — vu en vraie partie, l'app reconseillait Oblivion Orb juste après l'achat de Morello)
  const counterItem = (t: { items: number[] }) =>
    t.items.some((x) => owned.has(x) && !i.allBoots.has(x)) ? undefined : t.items.find((x) => !owned.has(x) && !(i.allBoots.has(x) && bootsPlanned()));
  for (const t of i.counters.filter((t) => t.urgent)) {
    const id = counterItem(t);
    if (id) {
      push(id, `contre leur équipe : ${lowerFirst(t.title)}`);
      must.add(id);
    }
  }
  if (c) for (const id of c.core.filter((id) => !owned.has(id)).slice(1)) push(id, i.labels?.core ?? 'build le plus gagnant');
  for (const t of i.counters) {
    const id = counterItem(t);
    if (id) push(id, `contre leur équipe : ${lowerFirst(t.title)}`);
  }
  if (c) for (const o of [...c.options].sort((a, b) => score(b) - score(a))) push(o.id, `${i.labels?.option ?? '3e item'} (${Math.round(o.winrate * 100)} %)`);
  // Sac plein : la boutique refuse tout ce qui ne consomme pas un item du sac. Terminer un composant passe donc avant.
  const parts = i.components ?? (() => []);
  const bag = i.bag;
  const full = bag != null && bag.length >= BAG_SLOTS;
  const fits = (id: number) => !full || consumedBy(id, bag, parts).length > 0;
  if (full) {
    const rank = (id: number) => (must.has(id) ? 0 : fits(id) ? 1 : 2);
    seq.sort((a, b) => rank(a.id) - rank(b.id));
  }
  // Tu as déjà passé ce conseil 2 fois : on ne te le remet pas en tête, il passe après le reste
  if (i.skipped?.size) {
    const keep = seq.filter((x) => !i.skipped!.has(x.id));
    const later = seq.filter((x) => i.skipped!.has(x.id)).map((x) => ({ ...x, why: `${x.why} · passé 2 fois, gardé pour plus tard` }));
    seq.splice(0, seq.length, ...keep, ...later);
  }
  if (i.keep != null && !i.bound?.length) {
    const k = seq.findIndex((x) => x.id === i.keep);
    if (k > 0) seq.unshift(...seq.splice(k, 1));
  }
  // Ton parcours : items finis déjà achetés (dans l'ordre de ton inventaire), puis la suite prévue, 6 places
  const known = new Set([...i.cores.flatMap((x) => [...x.core, ...x.options.map((o) => o.id)]), ...i.boots, ...i.counters.flatMap((t) => t.items)]);
  const done = i.owned.filter((id, k) => i.owned.indexOf(id) === k && (known.has(id) || (i.complete ? i.complete(id) : (i.price(id) ?? 0) >= 2000)));
  const plan: PlanSlot[] = [...done.map((id) => ({ id, owned: true })), ...seq.map((x) => ({ id: x.id, owned: false, why: x.why }))].slice(0, 6);
  return {
    coreIndex,
    plan,
    rows: seq.slice(0, max).map((s, k) => {
      const price = i.price(s.id);
      const remaining = remainingCost(s.id, i.owned, i.price, i.components);
      const missing = remaining == null ? 0 : Math.max(0, remaining - i.gold);
      const finished = i.complete ?? ((id: number) => (i.price(id) ?? 0) >= 2000);
      const isBoots = (id: number) => i.allBoots.has(id);
      const room = !fits(s.id) ? { sell: itemToSell(bag!, seq.map((x) => x.id), finished, isBoots, i.price, parts) } : null;
      const planned = seq.map((x) => x.id);
      const resale = k === 0 && missing > 0 && bag && i.sellValue && (!room || room.sell != null) ? resaleFor(s.id, missing, bag, planned, room?.sell ?? null, finished, isBoots, i.price, parts, i.sellValue) : null;
      // Terminer l'item à ce passage vaut mieux qu'un composant « en attendant ».
      const step = !resale && k === 0 && missing > 0 && i.components ? bestComponent(s.id, i.gold, i.owned, i.price, i.components, fits) : null;
      return { ...s, price, remaining, missing, ...(step ? { step } : {}), ...(room ? { room } : {}), ...(resale ? { resale } : {}) };
    }),
  };
}
