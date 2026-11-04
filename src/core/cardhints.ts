// Cartes dont la valeur dépend de ta partie plus que de leur winrate moyen. Texte de la carte (notes officielles) + état
// lu au Live Client : ce sont des faits, sans chiffre de gain, et rien n'entre dans le classement (`rowValue`, `bestOffered`).
// La ligne reste après l'arrivée des stats : un winrate moyen ne dit pas si ton build a de quoi faire marcher la carte.

import { normName } from './augfit';

const ONE_HIT = normName('One Hit Wonder');
const RISE = normName('RISE!');

/** Mêmes catégories que `buildProfile` (augfit.ts). */
export const hasHaste = (categories: string[]): boolean => categories.includes('AbilityHaste') || categories.includes('CooldownReduction');

export interface CardContext {
  /** `activeplayer.championStats.abilityHaste`. */
  haste: number | null;
  /** Items du plan pas encore achetés qui donnent de l'accélération, `null` tant que le plan n'est pas connu. */
  hasteItems: number | null;
  /** `activeplayer.abilities.R.displayName`. */
  ultimate: string | null;
}

export function newCardHint(name: string, c: CardContext): string | null {
  const key = normName(name);
  if (key === ONE_HIT) {
    // Sans lecture : parler de la carte, pas de ton build
    if (c.haste == null) return 'Dégâts selon ton accélération, le sort garde son délai de base';
    const planned = c.hasteItems ? ` et ${c.hasteItems} item${c.hasteItems > 1 ? 's' : ''} d’accélération au plan` : '';
    return `Ton accélération : ${Math.round(c.haste)}${planned}. C’est elle qui fait ses dégâts`;
  }
  if (key === RISE) return `${c.ultimate ?? 'Ton ultime'} doit donner le coup de grâce : le délai repart, 3 fois maximum`;
  return null;
}
