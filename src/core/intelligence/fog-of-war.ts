import { LIVE_SOURCE, type AcquiredEvent, type AcquiredPlayer, type IntelligenceEvent } from './types';

const HISTORY_LIMIT = 200;

/** Journal des événements réellement rapportés, sans leur attribuer une visibilité absente de la source. */
export class FogOfWarIntelligenceEngine {
  private acquired = new Map<number, AcquiredEvent>();

  reset(): void { this.acquired.clear(); }

  update(events: AcquiredEvent[], enemies: AcquiredPlayer[], roster: AcquiredPlayer[]): IntelligenceEvent[] {
    // Le flux est cumulatif : ne retenir que sa fin évite une mémoire croissante sur les parties longues.
    for (const event of [...events].sort((a, b) => a.id - b.id).slice(-HISTORY_LIMIT)) this.acquired.set(event.id, event);
    const retained = [...this.acquired.values()].sort((a, b) => a.gameTime - b.gameTime || a.id - b.id).slice(-HISTORY_LIMIT);
    this.acquired = new Map(retained.map((event) => [event.id, event]));
    return retained.map((event): IntelligenceEvent => {
      const enemyIds = enemies.filter((enemy) => event.actorNames.some((name) =>
        enemy.aliases.includes(name) && roster.filter((p) => p.aliases.includes(name)).length === 1,
      )).map((p) => p.id);
      return {
        id: event.id, name: event.name, gameTime: event.gameTime, enemyIds,
        source: LIVE_SOURCE, quality: 'exact', visibility: 'unknown',
      };
    });
  }
}
