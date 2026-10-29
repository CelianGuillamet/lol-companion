import type { AugmentRow, OfferedCards } from '../core/types';
import { wrAt } from './store';

const POSITIONS = ['À gauche', 'Au milieu', 'À droite'];

/** Présentation seulement : même classement (choix + build), position conservée malgré le tri. */
export function presentOfferedCards(offered: OfferedCards | null, byId: Map<number, AugmentRow>, round: number | null) {
  const cards = (offered?.ids ?? []).map((id, index) => {
    const a = byId.get(id) ?? null;
    const fit = offered?.fit?.[id];
    const score = a ? wrAt(a, round) + (fit?.delta ?? 0) : null;
    return {
      id,
      name: offered?.names[index] || a?.name || `Augment #${id}`,
      a,
      score,
      // Une lecture partielle ne permet pas de retrouver les colonnes manquantes.
      position: offered?.ids.length === 3 ? POSITIONS[index] : null,
      adjusted: !!fit?.delta,
    };
  });
  const sure = !!offered && !offered.unsure && cards.length === 3 && new Set(offered.ids).size === 3
    && cards.every((c) => c.score !== null && Number.isFinite(c.score));
  // Dans le doute, aucun classement implicite : garder l'ordre de lecture.
  if (sure) cards.sort((a, b) => b.score! - a.score!);
  return { cards, sure };
}
