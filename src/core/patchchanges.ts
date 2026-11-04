// Ce que les notes de patch changent aux cartes et aux champions, tant que les stats affichées datent d'avant le patch.
// Source : notes officielles de Riot, relevées à la main à chaque patch (rien d'automatique). Affichage seulement :
// aucun chiffre ne dit de combien le winrate va bouger, donc rien n'entre dans le classement. Dès que la source (arammeta,
// OP.GG en Faille) passe au patch, ces lignes disparaissent seules : les stats décrivent alors la carte telle qu'elle est.

import { normName } from './augfit';
import type { Mode, PatchChange, PatchChangeDir } from './types';

type Row = [PatchChangeDir, string];
interface PatchEntry {
  /** Version du jeu (16.22), les notes disent 26.22. */
  patch: string;
  augments: Record<string, Row>;
  champions: Record<string, Row>;
  /** Propre à Mayhem : ne se lit pas sur les stats ARAM. */
  mayhemChampions: Record<string, Row>;
}

// https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-22-notes/ (lu le 4 nov. 2026)
// Sans Shen (dégâts aux monstres) ni les champions de la section Classic : ils ne touchent pas ces deux modes.
export const PATCHES: PatchEntry[] = [
  {
    patch: '16.22',
    augments: {
      'Armored Impact': ['nerf', 'dégâts réduits, 250 → 220 % d’armure bonus'],
      'BEES!!!': ['nerf', 'dégâts max 200 → 140, ruche plus lente'],
      'Brass Blast': ['mixed', 'délai 75 → 50 s, plus de dégâts aux sbires'],
      'Crimson Cobalt': ['mixed', 'marque visible de toi seul'],
      'One Hit Wonder': ['new', 'carte nouvelle : le sort gagne des dégâts selon ton accélération, qui ne réduit plus son délai'],
      'Ravenous Bind': ['buff', 'soin de base 50-200 → 75-300'],
      'RISE!': ['new', 'carte nouvelle : tuer à l’ultime relance son délai, 3 fois maximum'],
      'Squishy Slappy Grab': ['buff', 'bouclier 50-200 → 100-300, 50 → 70 % des résistances'],
      'Soul Eater': ['buff', 'santé par cumul 20 → 30'],
      'Stay Resolute': ['buff', 'résistances par sort : 2 dès le niveau 1, 3 au niveau 11'],
      "Take 'Em Down Down Down": ['mixed', '17 % de la santé manquante, fixe : ne monte plus avec la vitesse d’attaque ni l’accélération'],
      "Titan's Resolve": ['buff', '7 cumuls par niveau au lieu de 10'],
      'Weapon of Destiny': ['nerf', 'pénétration réduite d’environ 40 %'],
    },
    champions: {
      'Aurelion Sol': ['buff', 'E plus fort'],
      Corki: ['buff', 'ultime plus fort'],
      Kayle: ['buff', 'Q et ultime plus fréquents'],
      Locke: ['nerf', 'début de partie plus faible'],
      Maokai: ['buff', 'Q plus fort'],
      Mel: ['mixed', 'refonte : W change, début plus faible, fin plus forte'],
      Naafiri: ['buff', 'plus de soin et d’AD'],
      Rumble: ['buff', 'ultime plus fort'],
      Smolder: ['buff', 'W plus fort'],
      Thresh: ['nerf', 'AD de base et ultime réduits'],
      Viktor: ['buff', 'plus de santé, ultime plus fort'],
      Yasuo: ['nerf', 'Q 105 → 100 % AD'],
      Zaahen: ['buff', 'Q plus fréquent en début de partie'],
    },
    mayhemChampions: {
      Hecarim: ['nerf', 'perd ses 10 d’accélération en Mayhem'],
    },
  },
];

export const patchNumber = (patch: string | null | undefined): number | null => {
  const m = patch?.match(/^(\d+)\.(\d+)/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
};

/** Patchs arrivés sur le client et pas encore dans les stats. Client inconnu : on croit la date, le patch est sorti. */
function pending(statsPatch: string | null | undefined, clientPatch: string | null | undefined): PatchEntry[] {
  const stats = patchNumber(statsPatch);
  if (stats == null) return [];
  const client = patchNumber(clientPatch);
  return PATCHES.filter((p) => {
    const n = patchNumber(p.patch)!;
    return n > stats && (client == null || client >= n);
  });
}

function find(table: Record<string, Row>, names: string[]): Row | null {
  const wanted = new Set(names.map(normName).filter(Boolean));
  for (const [name, row] of Object.entries(table)) if (wanted.has(normName(name))) return row;
  return null;
}

const note = (p: PatchEntry, row: Row): PatchChange => ({ patch: p.patch.replace(/^16\./, '26.'), dir: row[0], text: row[1] });

export function augmentChange(name: string, statsPatch: string | null | undefined, clientPatch?: string | null): PatchChange | null {
  for (const p of pending(statsPatch, clientPatch).reverse()) {
    const row = find(p.augments, [name]);
    if (row) return note(p, row);
  }
  return null;
}

/** `statsPatch` : patch des stats affichées, arammeta en ARAM et Mayhem, OP.GG en Faille (`opggPatch`). Inconnu = rien. */
export function championChange(names: string[], mode: Mode, statsPatch: string | null | undefined, clientPatch?: string | null): PatchChange | null {
  for (const p of pending(statsPatch, clientPatch).reverse()) {
    const row = (mode === 'mayhem' ? find(p.mayhemChampions, names) : null) ?? find(p.champions, names);
    if (row) return note(p, row);
  }
  return null;
}
