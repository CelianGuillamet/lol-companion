// « Prochain achat » : en ARAM on n'achète qu'en étant mort (ou au début). L'API Live Client du jeu
// (https://127.0.0.1:2999/liveclientdata, officielle) donne ton or et tes items ; on en déduit le prochain item
// du build le plus gagnant que tu n'as pas encore, plus les items contre l'équipe adverse.

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
  /** Libellés selon la source du build (Faille / OP.GG : cœur le plus joué, puis 4e item). */
  labels?: { core: string; option: string };
}

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
}

/**
 * Composant de plus grande valeur achetable maintenant pour avancer vers `target` (en descendant l'arbre,
 * en sautant ceux que tu as déjà). `price` dans le résultat est le montant à payer après déduction des
 * sous-composants possédés, pas le prix total de l'item.
 */
export function bestComponent(target: number, gold: number, owned: number[], price: (id: number) => number | null, components: (id: number) => number[]): { id: number; price: number } | null {
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
    if (value != null && p != null && p <= gold && value > bestValue) {
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

// Option classée par la borne basse de son intervalle à 95 % quand on connaît l'échantillon (60 % sur 80 parties
// ne passe pas devant 55 % sur 20 000), sinon par winrate brut.
const score = (o: { winrate: number; games?: number }) => (o.games ? wilson(o.winrate, o.games).lo : o.winrate);

export function nextBuys(i: NextBuyInput, max = 3): { coreIndex: number; rows: NextBuyRow[]; plan: PlanSlot[] } {
  const owned = new Set(expandOwned(i.owned, i.specialRecipe));
  // Le build suivi : celui qui recoupe le plus tes items (sinon le meilleur)
  let coreIndex = 0;
  let best = -1;
  i.cores.forEach((c, k) => {
    const overlap = [...c.core, ...c.options.map((o) => o.id)].filter((id) => owned.has(id)).length;
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
    if (id) push(id, `contre leur équipe : ${lowerFirst(t.title)}`);
  }
  if (c) for (const id of c.core.filter((id) => !owned.has(id)).slice(1)) push(id, i.labels?.core ?? 'build le plus gagnant');
  for (const t of i.counters) {
    const id = counterItem(t);
    if (id) push(id, `contre leur équipe : ${lowerFirst(t.title)}`);
  }
  if (c) for (const o of [...c.options].sort((a, b) => score(b) - score(a))) push(o.id, `${i.labels?.option ?? '3e item'} (${Math.round(o.winrate * 100)} %)`);
  // Tu as déjà passé ce conseil 2 fois : on ne te le remet pas en tête, il passe après le reste
  if (i.skipped?.size) {
    const keep = seq.filter((x) => !i.skipped!.has(x.id));
    const later = seq.filter((x) => i.skipped!.has(x.id)).map((x) => ({ ...x, why: `${x.why} · passé 2 fois, gardé pour plus tard` }));
    seq.splice(0, seq.length, ...keep, ...later);
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
      const step = k === 0 && missing > 0 && i.components ? bestComponent(s.id, i.gold, i.owned, i.price, i.components) : null;
      return { ...s, price, remaining, missing, ...(step ? { step } : {}) };
    }),
  };
}
