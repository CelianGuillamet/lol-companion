import type { NextBuyPanel } from '../core/types';

/** Une seule décision d'achat, partagée par la fenêtre, le téléphone et le panneau flottant. */
export function purchaseOf(panel: NextBuyPanel | null | undefined) {
  const row = panel?.rows[0];
  if (!row || !panel) return null;
  // undefined : ancien état sans déduction des composants ; null : prix explicitement inconnu.
  const remaining = row.remaining === undefined ? row.price : row.remaining;
  const known = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n >= 0;
  const budgetKnown = known(panel.gold);
  const costKnown = known(remaining);
  const missing = costKnown && budgetKnown ? Math.max(0, Math.ceil(remaining - panel.gold)) : null;
  const affordable = costKnown && budgetKnown && remaining <= panel.gold;
  const step = !affordable && budgetKnown && row.step && known(row.step.price) && row.step.price <= panel.gold ? row.step : null;
  const kind = affordable ? 'item' : step ? 'component' : costKnown && budgetKnown ? 'saving' : 'unknown';
  const item = step?.item ?? row.item;
  const cost = step?.price ?? (costKnown ? remaining : null);
  const canBuy = kind === 'item' || kind === 'component';
  return {
    kind, item, cost, canBuy, missing, target: row.item, why: row.why,
    title: canBuy ? `Achète ${item.name}` : kind === 'saving' ? `Économise pour ${item.name}` : `Vérifie le prix de ${item.name}`,
    goldAfter: canBuy && cost != null ? Math.floor(panel.gold - cost) : null,
  };
}

export type Purchase = NonNullable<ReturnType<typeof purchaseOf>>;
