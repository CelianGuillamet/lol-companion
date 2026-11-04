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
  /** Quête : il les faut tous, pas un seul. Ils disparaissent de l'inventaire une fois convertis. */
  quest?: number[];
  /** Item de la récompense, s'il est connu. Sinon la conversion se voit à un item de quête qui disparaît. */
  reward?: number;
  /** Composants que la carte améliore déjà (nom anglais, module du wiki) : elle marche, mais l'item fini reste à acheter. */
  parts?: string[];
  /** Items finis que la carte améliore aussi, par leur nom quand l'id n'a jamais été lu. Rien d'autre à acheter. */
  done?: string[];
  /** Items que la carte interdit de vendre (wiki) : à ne jamais proposer à la revente. */
  noSell?: number[];
}

const BOUND: BoundAugment[] = [
  { name: 'Upgrade Collector', items: [6676] },
  { name: 'Upgrade Infinity Edge', items: [3031] },
  { name: "Upgrade Death's Dance", items: [6333] },
  { name: 'Upgrade Stormsurge', items: [4646] },
  { name: 'Upgrade Sundered Sky', items: [6610] },
  { name: 'Upgrade Ravenous Hydra', items: [3074] },
  { name: "Upgrade Zhonya's", items: [3157, 228002], parts: ["Seeker's Armguard"] }, // 228002 : Wooglet's Witchcap
  { name: "Upgrade Mikael's Blessing", items: [3222] },
  { name: 'Upgrade Hubris', items: [126697, 6697] }, // absente du module de novembre ; Hubris vaut 126697 en Mayhem
  { name: 'Upgrade Cutlass', items: [4004] }, // Spectral Cutlass : le wiki parle de son actif, Soul Anchor
  { name: 'Upgrade Sword of Blossoming Dawn', items: [124011] }, // id Mayhem, comme Rite of Ruin (123430)
  { name: 'Steel Your Heart', items: [3084] }, // quête : Heartsteel, sinon la carte ne fait rien
  // Quête : les 2 items, convertis en Witchcap (228002) une fois obtenus
  { name: "Wooglet's Witchcap", items: [3089, 3157, 228002], quest: [3089, 3157], reward: 228002 },
  { name: "Icathia's Fall", items: [3068, 6664], quest: [3068, 6664] }, // Sunfire Aegis et Hollow Radiance, convertis en Void Immolation (id jamais lu)
  { name: 'Upgrade Immolate', items: [3068, 6664], parts: ["Bami's Cinder"], done: ['Void Immolation'] }, // Sunfire Aegis, Hollow Radiance
  // Lame enchantée : Trinity Force, Iceborn Gauntlet, Lich Bane, Essence Reaver
  { name: 'Upgrade Sheen', items: [3078, 6662, 3100, 3508], byRole: { ap: [3100], tank: [6662, 3078] }, parts: ['Sheen'] },
  // Ravenous, Titanic, Profane. « Hydra items cannot be sold » : Tiamat (3077) est le seul assez bas pour être proposé à la revente
  { name: 'Ultra Hydra', items: [3074, 3748, 6698], byRole: { tank: [3748, 3074] }, quest: [3074, 3748, 6698], noSell: [3077] },
];

const BY_NAME = new Map(BOUND.map((b) => [normName(b.name), b]));

const named = (names: string[] | undefined, owned: Set<number>, itemName: (id: number) => string): number | undefined => {
  if (!names?.length) return undefined;
  const wanted = new Set(names.map(normName));
  return [...owned].find((id) => wanted.has(normName(itemName(id))));
};

export const boundItems = (name: string): number[] | null => BY_NAME.get(normName(name))?.items ?? null;

/** Cartes « Upgrade X » absentes de `BOUND` : nouveautés de patch, à ajouter à la main. */
export const unknownBound = (names: string[]): string[] => names.filter((n) => /^upgrade\s/i.test(n.trim()) && !BY_NAME.has(normName(n)));

/** Items à ne pas proposer à la revente tant que cette carte est supposée prise. */
export const noSellItems = (name: string): number[] => BY_NAME.get(normName(name))?.noSell ?? [];

/** Items de la quête vus dans ton inventaire : `questDone` en a besoin, un item converti n'y est plus. */
export const questItems = (name: string): number[] => BY_NAME.get(normName(name))?.quest ?? [];

/**
 * Quête finie : la récompense est là, ou un item de la quête vu plus tôt a disparu (converti, l'id de Void Immolation
 * et d'Ultra Hydra n'a jamais été lu). Un item revendu donne le même signe, et le conseil se tait : préférable à reconseiller
 * un item que tu as déjà sous une autre forme.
 */
export function questDone(name: string, owned: Set<number>, seen: Set<number>): boolean {
  const b = BY_NAME.get(normName(name));
  if (!b?.quest) return false;
  return (b.reward != null && owned.has(b.reward)) || b.quest.some((id) => seen.has(id) && !owned.has(id));
}

/**
 * Item à acheter pour un augment lié, `null` si l'augment ne l'est pas ou si tu as déjà ce qui le fait marcher : un item
 * de la famille, ou tous ceux d'une quête. D'abord un item de ton plan (cœur, puis la meilleure option), sinon le repli
 * selon ton build.
 */
export function boundTarget(name: string, owned: Set<number>, cores: BuildCore[], role: BuildRole, seen: Set<number> = new Set(), itemName?: (id: number) => string): number | null {
  const b = BY_NAME.get(normName(name));
  if (!b || questDone(name, owned, seen)) return null;
  if (itemName && named(b.done, owned, itemName) != null) return null;
  const left = b.quest ? b.quest.filter((id) => !owned.has(id)) : b.items.some((id) => owned.has(id)) ? [] : b.items;
  if (!left.length) return null;
  const inCore = cores.flatMap((c) => c.core).find((id) => left.includes(id));
  if (inCore != null) return inCore;
  const options = cores.flatMap((c) => c.options).filter((o) => left.includes(o.id));
  if (options.length) return options.reduce((x, y) => (y.winrate > x.winrate ? y : x)).id;
  return b.byRole?.[role]?.find((id) => left.includes(id)) ?? left[0];
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
  const has = b.items.find((id) => owned.has(id)) ?? named(b.done, owned, itemName);
  if (has != null) return { delta: BONUS_OWNED, why: `tu as déjà ${itemName(has)}`, good: true };
  const part = named(b.parts, owned, itemName);
  if (part != null) return { delta: BONUS_PLANNED, why: `${itemName(part)} la fait déjà marcher`, good: true };
  const plan = b.items.find((id) => planned.has(id));
  if (plan != null) return { delta: BONUS_PLANNED, why: `${itemName(plan)} est dans ton plan`, good: true };
  return { delta: MALUS_ABSENT, why: `il te faudrait ${itemName(b.items[0])}, hors de ton plan`, good: false };
}

const WEAPON = normName('Weapon of Destiny');
const KING = normName('King Me');

/**
 * Cartes posées sur « the first eligible Legendary item », cherché des cases 1 à 6 (wiki). L'ordre du sac se change à la
 * main : autant savoir laquelle recevra l'effet avant de choisir. `legendary` : tes items finis, dans l'ordre du sac.
 * Le wiki ne dit pas ce qui se passe sans item légendaire : on ne l'invente pas. Aucun effet sur le classement.
 */
export function legendaryHint(name: string, legendary: string[]): string | null {
  const key = normName(name);
  const [first] = legendary;
  const many = legendary.length > 1;
  if (key === WEAPON) {
    if (!first) return 'Aucun item légendaire dans ton sac : le wiki ne dit pas où elle irait';
    return many ? `Ira sur ${first}, 1er item de ton sac : mets ton meilleur item devant avant de la prendre. Invendable ensuite` : `Ira sur ${first}, invendable ensuite`;
  }
  if (key === KING) {
    if (!first) return 'Agit en entrant dans leur porte ou leur catapulte : achète d’abord un item légendaire';
    return `Agit en entrant dans leur porte ou leur catapulte : 1 000 or de stats sur ${first}${many ? ', 1er item de ton sac (change l’ordre avant d’y entrer)' : ''}`;
  }
  return null;
}
