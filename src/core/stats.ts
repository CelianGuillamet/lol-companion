// Intervalles de confiance pour les winrates (Wilson, 95 %). Un winrate sur peu de parties n'est pas une preuve :
// on ne déclare un matchup « favorable » ou un counter-pick « fiable » que si tout l'intervalle est du bon côté.

export function wilson(winrate: number, games: number, z = 1.96): { lo: number; hi: number } {
  if (!(games > 0)) return { lo: 0, hi: 1 };
  const p = Math.min(1, Math.max(0, winrate));
  const z2 = z * z;
  const den = 1 + z2 / games;
  const center = (p + z2 / (2 * games)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / games + z2 / (4 * games * games))) / den;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

export type Verdict = 'favorable' | 'défavorable' | 'serré' | 'incertain';

/** Verdict d'un matchup : l'intervalle doit exclure 50 % (et l'écart dépasser 1 point) pour trancher. */
export function verdictOf(winrate: number, games: number): Verdict {
  if (games < 100) return 'incertain';
  const { lo, hi } = wilson(winrate, games);
  if (lo > 0.5 && winrate >= 0.51) return 'favorable';
  if (hi < 0.5 && winrate <= 0.49) return 'défavorable';
  return 'serré';
}
