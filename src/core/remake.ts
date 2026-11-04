// Partie annulée (remake) : elle s'arrête avant 4 minutes et le client lui donne quand même une victoire ou une défaite.
// Mesuré sur 147 parties le 4 nov. 2026 : 4 parties de 88 à 131 s, la suivante dure 498 s. Elles restent dans la liste,
// jamais dans un winrate. `durationSec` nul = durée inconnue, pas une partie annulée.

export const REMAKE_MAX_SEC = 240;

export const isRemake = (g: { durationSec: number }): boolean => g.durationSec > 0 && g.durationSec < REMAKE_MAX_SEC;

/** Les parties qui comptent dans les chiffres. */
export const played = <T extends { durationSec: number }>(games: T[]): T[] => games.filter((g) => !isRemake(g));
