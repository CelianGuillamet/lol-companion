/** Observations sérialisables. Aucune coordonnée ou utilisation de sort n'est déduite du roster. */
export const LIVE_SOURCE = 'Riot Live Client Data API' as const;

export interface SourceDiagnostic {
  source: typeof LIVE_SOURCE;
  endpoint: '/liveclientdata/allgamedata';
  status: number;
  latencyMs: number;
  receivedAt: number;
  fields: string[];
  note: string;
}

export interface AcquiredPlayer {
  id: string;
  aliases: string[];
  name: string;
  championName: string;
  championAlias: string;
  team: string | null;
  level: number | null;
  isDead: boolean | null;
  summonerSpells: [string | null, string | null];
}

export interface AcquiredEvent {
  id: number;
  name: string;
  gameTime: number;
  actorNames: string[];
}

export interface AcquisitionSnapshot {
  gameTime: number;
  players: AcquiredPlayer[];
  activePlayerAliases: string[];
  events: AcquiredEvent[];
  eventsAvailable: boolean;
}

export interface AcquisitionResult {
  status: 'connected' | 'unavailable' | 'invalid';
  snapshot: AcquisitionSnapshot | null;
  diagnostic: SourceDiagnostic;
}

export interface IntelligenceEvent {
  id: number;
  name: string;
  gameTime: number;
  enemyIds: string[];
  source: typeof LIVE_SOURCE;
  quality: 'exact';
  /** La source rapporte cet événement ; elle ne précise pas sa visibilité pour le joueur. */
  visibility: 'unknown';
}

export interface UnknownPosition {
  quality: 'unknown';
  x: null;
  y: null;
  reason: string;
}

/** Sort d'invocateur équipé, tel que le montre le tableau des scores. Aucun cooldown ennemi n'est suivi (règles Riot). */
export interface EnemySpell {
  slot: 'D' | 'F';
  name: string;
}

export interface EnemyIntelligence {
  id: string;
  name: string;
  championName: string;
  championId: number | null;
  level: number | null;
  isDead: boolean | null;
  freshness: 'current' | 'stale';
  observedGameTime: number;
  position: UnknownPosition;
  visibility: 'unknown';
  movement: 'unknown';
  spells: EnemySpell[];
  lastEvent: IntelligenceEvent | null;
}

export interface IntelligenceCapability {
  id: 'roster' | 'events' | 'positions' | 'visibility';
  label: string;
  status: 'available' | 'partial' | 'unavailable';
  reason: string;
}

export interface IntelligenceState {
  sourceStatus: AcquisitionResult['status'];
  gameTime: number | null;
  receivedAt: number | null;
  latencyMs: number | null;
  enemies: EnemyIntelligence[];
  events: IntelligenceEvent[];
  capabilities: IntelligenceCapability[];
  diagnostic: SourceDiagnostic | null;
}
