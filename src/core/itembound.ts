// Augments liés à un item : « Upgrade Infinity Edge » n'améliore que l'item nommé (wiki, notes de patch 26.16-26.17).
// Sans cet item, l'augment ne fait rien ou presque, et son winrate, mesuré sur ceux qui construisent l'item, ne vaut pas
// pour toi. Vrai cas du 2 nov. : Upgrade Immolate conseillé sur Taric, aucun item à Immolate dans le conseil d'achat.
// Ni l'API Live Client ni le client ne disent quel augment a été pris avant la fin de partie (captures du 3 nov.) : le
// moteur suppose que la carte conseillée a été prise, et le dit. Pur et testable.

import { normName, type Fit } from './augfit';
import type { BuildRole } from './counters';
import type { BuildCore } from './nextbuy';

type ByRole = Partial<Record<BuildRole, number[]>>;

interface BoundAugment {
  name: string;
  /** Tous les items qui rendent l'augment utile. */
  items: number[];
  /** Ordre de repli selon ton build, si ton plan ne contient aucun de ces items. */
  byRole?: ByRole;
}

const BOUND: BoundAugment[] = [
  { name: 'Upgrade Collector', items: [6676] },
  { name: 'Upgrade Infinity Edge', items: [3031] },
  { name: "Upgrade Death's Dance", items: [6333] },
  { name: 'Upgrade Stormsurge', items: [4646] },
  { name: 'Upgrade Sundered Sky', items: [6610] },
  { name: 'Upgrade Ravenous Hydra', items: [3074] },
  { name: "Upgrade Zhonya's", items: [3157] },
  { name: "Upgrade Mikael's Blessing", items: [3222] },
  { name: 'Upgrade Hubris', items: [6697] },
  { name: 'Upgrade Cutlass', items: [4004] }, // Spectral Cutlass : le wiki parle de son actif, Soul Anchor
  { name: 'Upgrade Immolate', items: [3068, 6664] }, // Sunfire Aegis, Hollow Radiance
  // Lame enchantée : Trinity Force, Iceborn Gauntlet, Lich Bane, Essence Reaver
  { name: 'Upgrade Sheen', items: [3078, 6662, 3100, 3508], byRole: { ap: [3100], tank: [6662, 3078] } },
  // Ravenous, Titanic, Profane
  { name: 'Ultra Hydra', items: [3074, 3748, 6698], byRole: { tank: [3748, 3074] } },
];

const BY_NAME = new Map(BOUND.map((b) => [normName(b.name), b]));

export const boundItems = (name: string): number[] | null => BY_NAME.get(normName(name))?.items ?? null;

/** Cartes « Upgrade X » absentes de `BOUND` : nouveautés de patch, à ajouter à la main. */
export const unknownBound = (names: string[]): string[] => names.filter((n) => /^upgrade\s/i.test(n.trim()) && !BY_NAME.has(normName(n)));

/**
 * Item à acheter pour un augment lié, `null` si l'augment ne l'est pas ou si tu as déjà un item qui le fait marcher.
 * D'abord un item de ton plan (cœur, puis la meilleure option), sinon le repli selon ton build.
 */
export function boundTarget(name: string, owned: Set<number>, cores: BuildCore[], role: BuildRole): number | null {
  const b = BY_NAME.get(normName(name));
  if (!b || b.items.some((id) => owned.has(id))) return null;
  const inCore = cores.flatMap((c) => c.core).find((id) => b.items.includes(id));
  if (inCore != null) return inCore;
  const options = cores.flatMap((c) => c.options).filter((o) => b.items.includes(o.id));
  if (options.length) return options.reduce((x, y) => (y.winrate > x.winrate ? y : x)).id;
  return b.byRole?.[role]?.[0] ?? b.items[0];
}

const BONUS_OWNED = 0.02;
const BONUS_PLANNED = 0.015;
const MALUS_ABSENT = -0.02;

/**
 * Correction d'une carte liée à un item, à la place de `fitOf` : les mots de sa description ne disent rien de ce qui compte.
 * `null` si la carte n'est pas liée. Mêmes ordres de grandeur que `fitOf`.
 */
export function boundFit(name: string, owned: Set<number>, planned: Set<number>, itemName: (id: number) => string): Fit | null {
  const b = BY_NAME.get(normName(name));
  if (!b) return null;
  const has = b.items.find((id) => owned.has(id));
  if (has != null) return { delta: BONUS_OWNED, why: `tu as déjà ${itemName(has)}`, good: true };
  const plan = b.items.find((id) => planned.has(id));
  if (plan != null) return { delta: BONUS_PLANNED, why: `${itemName(plan)} est dans ton plan`, good: true };
  return { delta: MALUS_ABSENT, why: `il te faudrait ${itemName(b.items[0])}, hors de ton plan`, good: false };
}
