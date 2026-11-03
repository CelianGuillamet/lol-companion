// Élixirs : quand il ne reste rien à acheter, l'or dort. Mesuré sur tes parties (3 nov.) : 55 parties Mayhem sur 80 finissent
// avec 6 items finis, et la moitié d'entre elles ont gagné plus de 3 600 or de plus que la valeur de leur inventaire final.
// Un élixir ne prend pas de place sac plein : il se boit à l'achat (wiki LoL). `maps` de Data Dragon : 11 et 12 au 16.21.

import type { BuildRole } from './counters';

export const ELIXIRS: Record<BuildRole, { id: number; name: string; perk: string }> = {
  ad: { id: 2140, name: 'Elixir of Wrath', perk: '+30 AD, soin sur tes dégâts physiques' },
  ap: { id: 2139, name: 'Elixir of Sorcery', perk: '+50 AP, dégâts bruts en plus sur les champions' },
  tank: { id: 2138, name: 'Elixir of Iron', perk: '+300 PV, 25 % de ténacité' },
};

export const ELIXIR_IDS = new Set(Object.values(ELIXIRS).map((e) => e.id));
export const ELIXIR_PRICE = 500;
export const ELIXIR_LEVEL = 9;
export const ELIXIR_MS = 180_000;
/** En ARAM on n'achète qu'en base : à moins d'une minute restante, l'effet ne couvrira pas le prochain combat. */
const REBUY_MS = 60_000;

/** Ce que tu construis prime sur le champion : un Malphite full AP boit Sorcery. `built` vient de `compFromItems`. */
export function elixirRole(role: BuildRole, built: 'AD' | 'AP' | 'mixte' | null): BuildRole {
  return built === 'AD' ? 'ad' : built === 'AP' ? 'ap' : role;
}

export interface ElixirInput {
  role: BuildRole;
  level: number | null | undefined;
  gold: number;
  /** Rien à acheter : plus de conseil, ou sac plein sans composant à vendre. */
  idle: boolean;
  price: number;
  /** `false` : Data Dragon dit que l'objet n'existe pas sur cette carte. `null` : pas lu. */
  onMap: boolean | null;
  /** Fin de l'effet (ms), `null` si aucun. */
  until: number | null;
  now: number;
}

export interface ElixirAdvice {
  id: number;
  name: string;
  perk: string;
  price: number;
  /** Secondes d'effet restantes, si un élixir tourne. */
  left: number | null;
  /** Non : l'effet en cours couvre encore le prochain combat. */
  buy: boolean;
}

export function elixirAdvice(i: ElixirInput): ElixirAdvice | null {
  if (!i.idle || i.onMap === false || (i.level ?? 0) < ELIXIR_LEVEL) return null;
  const e = ELIXIRS[i.role];
  const leftMs = i.until != null ? i.until - i.now : 0;
  const left = leftMs > 0 ? Math.ceil(leftMs / 1000) : null;
  const buy = leftMs < REBUY_MS && i.gold >= i.price;
  if (!buy && left == null) return null;
  return { id: e.id, name: e.name, perk: e.perk, price: i.price, left, buy };
}

/**
 * L'API ne dit rien d'un élixir bu : sac plein, il n'entre jamais dans l'inventaire. Seul signe : l'or baisse de son prix sans
 * que le sac change. Tolérance : le revenu passif et les primes s'ajoutent entre deux lectures ; une prime manquée fait rater l'achat, sans gravité.
 */
export function elixirBought(prevGold: number, gold: number, sameBag: boolean, price: number): boolean {
  const spent = prevGold - gold;
  return sameBag && spent <= price && spent >= price * 0.85;
}

/**
 * Fin de l'effet. Bu en étant mort, il ne démarre qu'à la réapparition, et il ne s'arrête plus ensuite (wiki LoL).
 */
export function elixirUntil(now: number, respawnSec: number | null | undefined): number {
  return now + (respawnSec ?? 0) * 1000 + ELIXIR_MS;
}
