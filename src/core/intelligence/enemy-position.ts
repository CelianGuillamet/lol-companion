import type { UnknownPosition } from './types';

/** Le champ Live Client `position` est un rôle de lane, jamais une coordonnée. */
export class EnemyPositionTracker {
  snapshot(): UnknownPosition {
    return { quality: 'unknown', x: null, y: null, reason: 'Aucune observation X/Y acquise. Le roster Live Client ne fournit pas de coordonnées.' };
  }
}
