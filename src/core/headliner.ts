// Headliners Mayhem (patch 26.21, « Journey to Stardom ») : un par partie. Ni le client ni l'API Live Client ne
// le donnent (captures du 29 oct.). On le reconnaît donc :
//  - en partie : nom du headliner lu à l'écran (bannière du début) ou cartes propres au headliner (Pentakill :
//    3170-3173, vues au choix 1 et au niveau 18) ;
//  - après coup : augment marqueur dans l'historique (3176 = Pentakill), ou 5 augments depuis le 26.21 (K/DA :
//    4 cartes ramassées = un augment en plus) — affiché « probable ».
// Pur et testable.

import { normText } from './cardmatch';

export interface HeadlinerInfo {
  key: string;
  name: string;
  /** Conseils courts, du plus utile au moins utile. */
  tips: string[];
}

export const HEADLINERS: HeadlinerInfo[] = [
  { key: 'kda', name: 'K/DA', tips: ['Ramasse les cartes K/DA : 4 cartes = un augment en plus.', 'Prends les cartes en sécurité entre deux combats, pas en plein fight.'] },
  { key: 'heartsteel', name: 'HEARTSTEEL', tips: ['Les augments ont un effet bonus cette partie : relis la carte avant de choisir.'] },
  { key: 'truedamage', name: 'True Damage', tips: ['Éliminations et tours détruites font tomber des enclumes pour ton équipe : joue les kills, pousse les tours.'] },
  { key: 'pentakill', name: 'Pentakill', tips: ['Une carte renforce un de tes sorts au début et au niveau 18 : l’app classe les 3 cartes.', 'Monte vite au niveau 18 : le 2e renforcement compte.'] },
  { key: 'disco', name: 'Disco', tips: ['Danse sous la boule disco entre deux combats : de l’or pour toi.'] },
  { key: 'cafecuties', name: 'Cafe Cuties', tips: ['Reliques de soin renforcées : recule dessus plutôt qu’en base, et prive-en l’adversaire.'] },
  { key: 'bees', name: 'Bees', tips: ['Ramasse les pots de miel en évitant les abeilles.'] },
  { key: 'commandline', name: 'Command Line', tips: ['Ton reroll fait monter une carte d’un cran de rareté : reroll une carte Or pour viser du Prismatique.', 'Garde tes rerolls pour les choix où aucune carte ne va avec ton build.'] },
];

const BY_KEY = new Map(HEADLINERS.map((h) => [h.key, h]));
export const headlinerByKey = (key: string): HeadlinerInfo | undefined => BY_KEY.get(key);

/** Formes lues à l'écran, normalisées (minuscules, sans accents ni ponctuation). */
const SCREEN_FORMS: [string, string][] = [
  ['k da', 'kda'],
  ['kda', 'kda'],
  ['heartsteel', 'heartsteel'],
  ['true damage', 'truedamage'],
  ['pentakill', 'pentakill'],
  ['disco', 'disco'],
  ['space groove', 'disco'],
  ['cafe cuties', 'cafecuties'],
  ['command line', 'commandline'],
];

/**
 * Headliner nommé dans une ligne lue à l'écran. Strict : la ligne doit être exactement le nom, ou « Headliner : nom »
 * — « BEES!!! » (un augment) ou « Pentakill! » dans le fil des éliminations ne comptent pas.
 */
export function headlinerFromText(lines: string[]): { info: HeadlinerInfo; text: string } | null {
  for (const raw of lines) {
    if (/!/.test(raw)) continue; // annonces du jeu (« … is unstoppable! », « PENTAKILL! »), augments (« BEES!!! »)
    let t = normText(raw).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const pre = /^(headliner|tete daffiche)\s*/.exec(t);
    if (pre) t = t.slice(pre[0].length).trim();
    const hit = SCREEN_FORMS.find(([f]) => t === f);
    const key = hit?.[1] ?? (pre && t === 'bees' ? 'bees' : null); // « Bees » seul est trop courant : seulement préfixé
    const info = key ? BY_KEY.get(key) : undefined;
    if (info) return { info, text: raw.trim() };
  }
  return null;
}

/** Cartes propres à un headliner (vues en vraie partie le 28 oct. : Pentakill 3170 / 3171 / 3172 / 3173). */
export function headlinerFromCards(ids: number[]): HeadlinerInfo | null {
  return ids.length >= 2 && ids.every((id) => id >= 3170 && id <= 3173) ? BY_KEY.get('pentakill')! : null;
}

/** Sortie du patch 26.21 (premières parties à 5 augments le 21 oct. 2026). */
export const HEADLINERS_SINCE = Date.UTC(2026, 9, 21);

/**
 * Headliner d'une partie de l'historique : noté en direct, sinon marqueur, sinon 5 augments (K/DA probable).
 * `markerName` : nom du headliner d'après l'augment marqueur (null s'il n'y en a pas).
 */
export function historyHeadliner(g: { mode: string; createdAt: number; augments: number[]; headliner?: string }, markerName: string | null): string | null {
  if (g.headliner) return BY_KEY.get(g.headliner)?.name ?? g.headliner;
  if (markerName) return markerName;
  if (g.mode === 'mayhem' && g.createdAt >= HEADLINERS_SINCE && g.augments.length === 5) return 'K/DA (probable)';
  return null;
}
