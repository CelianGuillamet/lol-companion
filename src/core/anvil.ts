// Enclumes de stats, Mayhem. Une fois le build fini, 750 or achètent une stat permanente, sans place au sac. Riot les annonçait
// au niveau 9 (notes du 25.23, arammayhem.com) ; Data Dragon : « Anvil Voucher » 220008, 750 or, carte 12. Avant la v1.112,
// l'app ne proposait que l'élixir (3 minutes) : 55 parties Mayhem sur 80 finissent à 6 items, la moitié avec plus de 3 600 or en trop.
// Chiffres des stats non repris : la seule table lue (wiki, « Stat Bonus ») est celle d'Arena.

import type { BuildRole } from './counters';

export const ANVIL_ID = 220008;
export const ANVIL_NAME = 'Enclume de stats';
export const ANVIL_PRICE = 750;
export const ANVIL_LEVEL = 9;
const SAME_TICK_MAX = 4;

export interface AnvilInput {
  isMayhem: boolean;
  level: number | null | undefined;
  gold: number;
  /** Rien à acheter : plus de conseil, ou sac plein sans composant à vendre. Même règle que l'élixir. */
  idle: boolean;
  price: number;
  /** `false` : Data Dragon dit que l'objet n'existe pas sur cette carte. `null` : pas lu. */
  onMap: boolean | null;
}

export interface AnvilAdvice {
  price: number;
  buy: boolean;
  /** Or manquant, 0 si achetable. */
  missing: number;
}

export function anvilAdvice(i: AnvilInput): AnvilAdvice | null {
  if (!i.isMayhem || !i.idle || i.onMap === false || (i.level ?? 0) < ANVIL_LEVEL) return null;
  return { price: i.price, buy: i.gold >= i.price, missing: Math.max(0, Math.ceil(i.price - i.gold)) };
}

/**
 * Enclumes achetées entre deux lectures. L'API n'en dit rien : l'or baisse d'un multiple du prix sans que le sac change.
 * Tolérance : le revenu passif et les primes s'ajoutent à l'or entre deux lectures. Une prime manquée fait rater l'achat, sans gravité.
 */
export function anvilsBought(prevGold: number, gold: number, sameBag: boolean, price: number): number {
  if (!sameBag || price <= 0) return 0;
  const spent = prevGold - gold;
  const n = Math.round(spent / price);
  if (n < 1 || n > SAME_TICK_MAX) return 0;
  return spent <= n * price && spent >= n * price - price * 0.15 ? n : 0;
}

/** Repère, pas une mesure : aucune source ne chiffre les choix. `phys` = part physique des dégâts adverses, `null` si inconnue. */
export function anvilPick(role: BuildRole, phys: number | null | undefined): string {
  if (role === 'ad') return 'Côté attaque : AD, létalité, vitesse d’attaque';
  if (role === 'ap') return 'Côté attaque : AP, pénétration magique, accélération';
  if (phys == null) return 'Côté défense : PV ou armure et résistance magique';
  if (phys >= 0.6) return 'Côté défense : armure, ils tapent surtout physique';
  if (phys <= 0.4) return 'Côté défense : résistance magique, ils tapent surtout magique';
  return 'Côté défense : PV ou armure et résistance magique';
}
