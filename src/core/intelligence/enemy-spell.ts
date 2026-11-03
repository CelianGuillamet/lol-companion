import type { AcquiredPlayer, EnemySpell } from './types';
import { AdvancedCooldownEngine, createCooldownTimer, type CooldownInput, type CooldownCalculation, type CooldownTimer } from './advanced-cooldown';

export interface AcquiredSpellState {
  /** Réservé à un adaptateur qui acquiert réellement le lancement et ses statistiques. */
  castAt: number;
  input: CooldownInput;
}

/** Équipement observé ≠ utilisation observée. Aucun timer n'est créé depuis une variation de score. */
export class EnemySpellTracker {
  constructor(private readonly cooldowns = new AdvancedCooldownEngine()) {}

  cooldownFor(observation: AcquiredSpellState | null): { calculation: CooldownCalculation; timer: CooldownTimer | null } {
    if (!observation || !Number.isFinite(observation.castAt) || observation.castAt < 0) {
      return { calculation: { quality: 'unknown', reasons: ['Aucun lancement acquis : disponibilité inconnue.'] }, timer: null };
    }
    const calculation = this.cooldowns.calculate(observation.input);
    return { calculation, timer: createCooldownTimer(calculation, observation.castAt) };
  }

  snapshot(player: AcquiredPlayer): EnemySpell[] {
    // Cet adaptateur acquiert l'équipement, pas les lancements : le moteur de calcul reste bloqué explicitement.
    const gate = this.cooldownFor(null);
    return (['Q', 'W', 'E', 'R', 'D', 'F'] as const).map((slot, index) => ({
      slot,
      name: index < 4 ? slot : player.summonerSpells[index - 4] ?? 'Sort inconnu',
      quality: 'unknown', rank: null, remainingSeconds: null,
      reason: gate.calculation.quality === 'unknown' ? gate.calculation.reasons.join(' ') : 'Rang et modificateurs non acquis.',
    }));
  }
}
