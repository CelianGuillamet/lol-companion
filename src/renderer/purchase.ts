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
  // La revente manque seulement ici : le moteur ne la propose que si elle couvre l'écart.
  const resale = !affordable && costKnown && budgetKnown && row.resale && remaining <= panel.gold + row.resale.gain ? row.resale : null;
  const step = !affordable && !resale && budgetKnown && row.step && known(row.step.price) && row.step.price <= panel.gold ? row.step : null;
  // Plus rien à vendre : ni l'or ni un composant n'y changent rien, inutile de dire « économise ».
  const full = row.room != null && row.room.sell == null;
  const held = full && !!row.room?.held;
  const kind = full ? 'full' : affordable || resale ? 'item' : step ? 'component' : costKnown && budgetKnown ? 'saving' : 'unknown';
  const item = step?.item ?? row.item;
  const cost = full ? null : step?.price ?? (costKnown ? remaining : null);
  const canBuy = kind === 'item' || kind === 'component';
  // À vendre seulement au moment d'acheter : pendant qu'on économise, le composant garde sa valeur.
  const sells = kind !== 'item' ? [] : resale ? resale.items : row.room?.sell ? [row.room.sell] : [];
  const sell = sells[0] ?? null;
  const sellNames = sells.map((x) => x.name).join(' et ');
  const gain = resale?.gain ?? 0;
  return {
    kind, item, cost, canBuy, held, missing: full ? null : missing, target: row.item, why: row.why, sell, sells, sellNames, gain,
    title: held ? `Inventaire plein : termine tes composants avant ${item.name}` : full ? `Inventaire plein : ${item.name} demande de remplacer un item fini` : sell ? `Vends ${sellNames}, puis achète ${item.name}` : canBuy ? `Achète ${item.name}` : kind === 'saving' ? `Économise pour ${item.name}` : `Vérifie le prix de ${item.name}`,
    goldAfter: canBuy && cost != null ? Math.floor(panel.gold + gain - cost) : null,
  };
}

export type Purchase = NonNullable<ReturnType<typeof purchaseOf>>;

/** « Doran's Ring + 2 × Health Potion » : OP.GG répète l'id d'un item acheté 2 fois. */
export function starterText(items: { id: number; name: string }[]): string {
  const counts = new Map<string, number>();
  for (const x of items) counts.set(x.name, (counts.get(x.name) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${n} × ${name}` : name)).join(' + ');
}
