import { EnemyPositionTracker } from './enemy-position';
import { EnemySpellTracker } from './enemy-spell';
import { FogOfWarIntelligenceEngine } from './fog-of-war';
import type { AcquisitionResult, AcquiredPlayer, IntelligenceCapability, IntelligenceState } from './types';

export interface IntelligenceContext {
  sessionId?: string | null;
  championId?: (alias: string) => number | null;
}

function capabilities(roster: boolean, events: boolean): IntelligenceCapability[] {
  return [
    { id: 'roster', label: 'Équipe adverse', status: roster ? 'available' : 'unavailable', reason: roster ? 'Identité du joueur et équipes corrélées dans le roster.' : 'Équipe du joueur non établie par une identité unique.' },
    { id: 'events', label: 'Événements rapportés', status: events ? 'partial' : 'unavailable', reason: events ? 'Événements Live Client uniquement ; exhaustivité et visibilité non établies.' : 'Flux d’événements non acquis.' },
    { id: 'positions', label: 'Positions X/Y', status: 'unavailable', reason: 'Aucune source de coordonnées ennemies acquise.' },
    { id: 'visibility', label: 'Brouillard de guerre', status: 'unavailable', reason: 'La source ne rapporte pas la visibilité des champions.' },
    { id: 'casts', label: 'Lancements ennemis', status: 'unavailable', reason: 'Aucun flux vérifié de lancements de sorts ennemis.' },
    { id: 'cooldowns', label: 'Délais de récupération', status: 'unavailable', reason: 'Lancements, rangs, accélérations et resets non acquis.' },
  ];
}

const empty = (): IntelligenceState => ({
  sourceStatus: 'unavailable', gameTime: null, receivedAt: null, latencyMs: null,
  enemies: [], events: [], capabilities: capabilities(false, false), diagnostic: null,
});

/** État borné transmis par l'IPC existant. Les changements de partie effacent toute observation précédente. */
export class RealTimeIntelligenceStore {
  private current = empty();
  private sessionId: string | null = null;
  private lastGameTime: number | null = null;
  private rosterKey: string | null = null;
  private readonly positions = new EnemyPositionTracker();
  private readonly spells = new EnemySpellTracker();
  private readonly fog = new FogOfWarIntelligenceEngine();

  get snapshot(): IntelligenceState { return this.current; }

  reset(): void {
    this.current = empty(); this.sessionId = null; this.lastGameTime = null; this.rosterKey = null; this.fog.reset();
  }

  update(result: AcquisitionResult, context: IntelligenceContext = {}): IntelligenceState {
    const incoming = result.snapshot;
    const rosterKey = incoming ? JSON.stringify(incoming.players.map((p) =>
      [p.id, p.team, p.championAlias]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))) : null;
    if ((context.sessionId && this.sessionId && context.sessionId !== this.sessionId) ||
      (incoming && this.lastGameTime !== null && incoming.gameTime < this.lastGameTime) ||
      (rosterKey && this.rosterKey && rosterKey !== this.rosterKey)) this.reset();
    if (context.sessionId) this.sessionId = context.sessionId;
    if (!incoming) {
      this.current = {
        ...this.current, sourceStatus: result.status, gameTime: null,
        receivedAt: result.diagnostic.receivedAt, latencyMs: result.diagnostic.latencyMs, diagnostic: result.diagnostic,
        enemies: this.current.enemies.map((enemy) => ({ ...enemy, freshness: 'stale' })),
        capabilities: capabilities(false, false),
      };
      return this.current;
    }
    this.lastGameTime = incoming.gameTime;
    this.rosterKey = rosterKey;
    // Privilégier Riot ID complet ; un nom sans tag partagé ne doit pas rendre cette identité ambiguë.
    let me: AcquiredPlayer | null = null;
    for (const alias of incoming.activePlayerAliases) {
      const matches = incoming.players.filter((p) => p.aliases.includes(alias));
      if (matches.length > 1) break;
      if (matches.length === 1) { me = matches[0]; break; }
    }
    let enemies: AcquiredPlayer[] = me?.team ? incoming.players.filter((p) => p.team !== null && p.team !== me.team) : [];
    if (enemies.length > 5) enemies = []; // format inattendu, pas de sélection arbitraire de cinq joueurs
    const events = this.fog.update(incoming.events, enemies, incoming.players);
    this.current = {
      sourceStatus: result.status, gameTime: incoming.gameTime,
      receivedAt: result.diagnostic.receivedAt, latencyMs: result.diagnostic.latencyMs, diagnostic: result.diagnostic,
      enemies: enemies.map((p) => ({
        id: p.id, name: p.name, championName: p.championName,
        championId: context.championId?.(p.championAlias) ?? null, level: p.level, isDead: p.isDead,
        freshness: 'current', observedGameTime: incoming.gameTime,
        position: this.positions.snapshot(), visibility: 'unknown', movement: 'unknown',
        spells: this.spells.snapshot(p),
        lastEvent: [...events].reverse().find((event) => event.enemyIds.includes(p.id)) ?? null,
      })),
      events, capabilities: capabilities(!!me?.team && enemies.length > 0, incoming.eventsAvailable),
    };
    return this.current;
  }
}
