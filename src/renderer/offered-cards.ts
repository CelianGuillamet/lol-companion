import type { AugmentRow, OfferedCards, RerollAdvice } from '../core/types';
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

const pts = (x: number) => `+${(x * 100).toFixed(1).replace('.', ',')} pt`;
const where = (p: string | null | undefined) => (p ?? '').replace('À', 'à').replace('Au', 'au');

/** Phrase de conseil de relance. Null : rien à dire de plus que « prends la première ». */
export function rerollLine(
  advice: RerollAdvice | null | undefined,
  cards: { id: number; name: string; position: string | null }[],
): { text: string; targets: number[] } | null {
  if (!advice || !advice.left) return null;
  const card = (id: number) => cards.find((c) => c.id === id);
  if (advice.kind === 'keep' && advice.combo) return { text: 'Pas de relance : tu perdrais un combo connu.', targets: [] };
  if (advice.kind === 'keep') return { text: 'Relancer n’apporterait rien : garde ces cartes.', targets: [] };
  const spots = advice.targets.map((id) => where(card(id)?.position));
  if (spots.some((s) => !s)) return null;
  const list = spots.length > 1 ? `les cartes ${spots.slice(0, -1).join(', ')} et ${spots[spots.length - 1]}` : `la carte ${spots[0]}`;
  if (advice.kind === 'risky') {
    const left = card(advice.fallback ?? 0)?.name;
    return { text: `Tu peux aussi relancer ${list} : ${Math.round((advice.better ?? 0) * 100)} % de trouver mieux, ${pts(advice.gain)} en moyenne.${left ? ` Sinon, il te reste ${left}.` : ''}`, targets: advice.targets };
  }
  if (advice.upgrade) return { text: `Command Line : relance d’abord ${list}, ta 1re relance monte d’un cran (${pts(advice.gain)} en moyenne).`, targets: advice.targets };
  return { text: `Relance ${list} : tu ne ${spots.length > 1 ? 'les' : 'la'} prendrais pas, ça ne coûte rien (${pts(advice.gain)} en moyenne).`, targets: advice.targets };
}
