import type { Mode } from './types';

export const ARAM_QUEUES = new Set([450, 100]);
// Files ARAM: Mayhem (relevées dans le code d'UP!) — 2400 est la file principale.
export const MAYHEM_QUEUES = new Set([2400, 2401, 2403, 2405, 2410, 2450, 3240, 3270, 3280]);

/**
 * Files 5v5 de la Faille de l'invocateur : normale draft (400), aveugle (430), classée solo (420) et flex (440),
 * Swiftplay (480), partie rapide (490), Clash (700), URF (900 / 1900).
 */
export const SR_QUEUES = new Set([400, 420, 430, 440, 480, 490, 700, 900, 1900]);
export const URF_QUEUES = new Set([900, 1900]);

export function modeOf(queueId: number | null | undefined, gameMode?: string | null): Mode | null {
  if (queueId != null && MAYHEM_QUEUES.has(queueId)) return 'mayhem';
  if (queueId != null && ARAM_QUEUES.has(queueId)) return 'aram';
  if (queueId != null && SR_QUEUES.has(queueId)) return 'sr';
  const gm = String(gameMode || '').toUpperCase();
  if (gm === 'KIWI') return 'mayhem'; // nom de code interne de Mayhem
  if (gm === 'ARAM') return 'aram';
  if (gm === 'CLASSIC' || gm === 'SWIFTPLAY' || gm === 'URF' || gm === 'ARURF') return 'sr';
  return null;
}

export const MODE_LABEL: Record<Mode, string> = { aram: 'ARAM', mayhem: 'ARAM: Mayhem', sr: 'Faille' };

/** Nom précis de la file (Faille) : « Swiftplay », « Classée solo »… */
export const QUEUE_LABEL: Record<number, string> = {
  400: 'Normale', 420: 'Classée solo', 430: 'Aveugle', 440: 'Classée flex', 480: 'Swiftplay', 490: 'Partie rapide', 700: 'Clash', 900: 'URF', 1900: 'URF',
};

/** Statistiques OP.GG à utiliser pour une file. */
export function opggModeOf(queueId: number | null | undefined): 'ranked' | 'flex' | 'urf' {
  if (queueId != null && URF_QUEUES.has(queueId)) return 'urf';
  if (queueId === 440) return 'flex';
  return 'ranked';
}

export const SR_MAP_ID = 11;

// ID de la carte ARAM (Howling Abyss et variantes) pour les pages de runes recommandées.
export const ARAM_MAP_ID = 12;

export const SPELL = { flash: 4, mark: 32 } as const;
