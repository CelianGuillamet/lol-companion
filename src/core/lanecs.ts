// Tes CS face à ton adversaire de lane, en Faille. Blitz (« benchmarks ») et Mobalytics (« CS counters ») en font un repère
// en partie. C'est le chiffre du tableau des scores, sans source externe : OP.GG ne donne aucune moyenne de CS par champion.
// Une lecture, pas un conseil : l'app ne dit jamais de farmer ou de roam.

import type { LaneCsPanel } from './types';
import type { Lane } from './opgg';

/** Avant 3 minutes, le compteur est encore à 0 : `creepScore` n'avance que par dizaines. */
export const MIN_SEC = 180;

export interface LaneCsInput {
  lane: Lane | null;
  mine: number | undefined;
  theirs: number | undefined;
  opponent: { id: number; name: string } | null;
  guessed: boolean;
  gameTime: number | null;
}

/** null hors Faille utile : soutien (les CS n'y disent rien), rôle inconnu, début de partie, ou API sans `creepScore`. */
export function laneCs(input: LaneCsInput): LaneCsPanel | null {
  const { lane, mine, theirs, opponent, guessed, gameTime } = input;
  if (!lane || lane === 'support') return null;
  if (gameTime == null || gameTime < MIN_SEC || typeof mine !== 'number') return null;
  const known = !!opponent && typeof theirs === 'number';
  return {
    mine,
    theirs: known ? theirs! : null,
    gap: known ? mine - theirs! : null,
    perMin: Math.round((mine / (gameTime / 60)) * 10) / 10,
    opponent: known ? opponent : null,
    guessed: known && guessed,
  };
}
