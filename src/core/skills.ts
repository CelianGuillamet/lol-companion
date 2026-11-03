// Quel sort monter au prochain point. Pur : l'ordre vient d'OP.GG, les rangs de l'API Live Client (`activeplayer.abilities`).
// Affichage seul : l'app ne monte jamais un sort à ta place.

export type SkillKey = 'Q' | 'W' | 'E' | 'R';
export type SkillLevels = Record<SkillKey, number>;

const KEYS: SkillKey[] = ['Q', 'W', 'E', 'R'];
const isKey = (k: string): k is SkillKey => (KEYS as string[]).includes(k);

export interface LiveAbilities {
  [key: string]: { abilityLevel?: number; displayName?: string } | undefined;
}

/** Rangs actuels. `null` si l'API ne donne pas les 4 sorts (ancien jeu, écran de chargement). */
export function skillLevels(abilities: LiveAbilities | null | undefined): SkillLevels | null {
  if (!abilities || KEYS.some((k) => !abilities[k])) return null;
  return { Q: abilities.Q?.abilityLevel ?? 0, W: abilities.W?.abilityLevel ?? 0, E: abilities.E?.abilityLevel ?? 0, R: abilities.R?.abilityLevel ?? 0 };
}

export const spentPoints = (l: SkillLevels) => l.Q + l.W + l.E + l.R;

/**
 * Le prochain sort : on rejoue l'ordre conseillé, chaque rang déjà pris valide une étape, la première étape non validée et
 * permise est la bonne. Un écart (2 points en E trop tôt) ne casse donc pas la suite : l'étape E suivante est sautée.
 * Après l'ordre (OP.GG donne 15 étapes) : R, puis la priorité de montée.
 * Rangs permis au niveau N : sorts de base jusqu'à ⌈N / 2⌉, R aux niveaux 6, 11, 16. Les champions à R dès le début (Jayce,
 * Nidalee, Elise, Karma, Udyr) ont leur R tôt dans l'ordre : on suit alors l'ordre sans limite de niveau sur R.
 */
export function nextSkill(order: string[], max: string[], levels: SkillLevels, level: number): SkillKey | null {
  const plan = order.filter(isKey);
  const count = (k: SkillKey) => plan.filter((x) => x === k).length;
  const earlyR = plan.slice(0, 5).includes('R');
  const at = Math.max(level, spentPoints(levels) + 1);
  const legal = (k: SkillKey) => {
    if (k === 'R') return levels.R < (earlyR ? Math.max(3, count('R')) : at >= 16 ? 3 : at >= 11 ? 2 : at >= 6 ? 1 : 0);
    return levels[k] < Math.min(Math.max(5, count(k)), Math.ceil(at / 2));
  };
  const used: SkillLevels = { Q: 0, W: 0, E: 0, R: 0 };
  for (const k of plan) {
    if (used[k] < levels[k]) used[k]++;
    else if (legal(k)) return k;
  }
  const rest: SkillKey[] = ['R', ...max.filter(isKey), 'Q', 'W', 'E'];
  return rest.find(legal) ?? null;
}

/** Points pris hors de l'ordre conseillé, rejoués un par un depuis le niveau 1. */
export function pointsOffPlan(taken: string, order: string[], max: string[]): number {
  const levels: SkillLevels = { Q: 0, W: 0, E: 0, R: 0 };
  let off = 0;
  for (const k of taken) {
    if (!isKey(k)) continue;
    const want = nextSkill(order, max, levels, spentPoints(levels) + 1);
    if (want && want !== k) off++;
    levels[k]++;
  }
  return off;
}
