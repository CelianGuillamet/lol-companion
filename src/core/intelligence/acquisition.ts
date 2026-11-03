import { performance } from 'node:perf_hooks';
import { localRequest, type LcuResponse } from '../lcu';
import { LIVE_SOURCE, type AcquisitionResult, type AcquisitionSnapshot, type AcquiredEvent, type AcquiredPlayer } from './types';

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const string = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const strings = (...values: unknown[]): string[] => [...new Set(values.map(string).filter((s): s is string => s !== null))];

function playerOf(value: unknown): AcquiredPlayer | null {
  const p = object(value);
  if (!p) return null;
  const aliases = strings(p.riotId, p.summonerName, p.riotIdGameName);
  const championName = string(p.championName);
  if (!aliases.length || !championName) return null;
  const spells = object(p.summonerSpells);
  const spellName = (spell: unknown) => string(object(spell)?.displayName);
  return {
    id: aliases[0], aliases, name: aliases[0], championName,
    championAlias: string(p.rawChampionName)?.replace(/^game_character_displayname_/, '') ?? championName,
    team: p.team === 'ORDER' || p.team === 'CHAOS' ? p.team : null,
    level: finite(p.level) && Number.isInteger(p.level) && p.level >= 1 ? p.level : null,
    isDead: typeof p.isDead === 'boolean' ? p.isDead : null,
    summonerSpells: [spellName(spells?.summonerSpellOne), spellName(spells?.summonerSpellTwo)],
  };
}

function eventOf(value: unknown, gameTime: number): AcquiredEvent | null {
  const event = object(value);
  if (!event || !finite(event.EventID) || !Number.isInteger(event.EventID) || event.EventID < 0 ||
    !string(event.EventName) || !finite(event.EventTime) || event.EventTime < 0 || event.EventTime > gameTime + 1) return null;
  return {
    id: event.EventID, name: event.EventName as string, gameTime: event.EventTime,
    actorNames: strings(event.KillerName, event.VictimName, ...(Array.isArray(event.Assisters) ? event.Assisters : [])),
  };
}

/** Parse uniquement les champs documentés, sans supposer qu'un champ inconnu décrit un lancement. */
export function normalizeLiveSnapshot(raw: unknown): AcquisitionSnapshot | null {
  const root = object(raw);
  const game = object(root?.gameData);
  if (!root || !game || !finite(game.gameTime) || game.gameTime < 0 || !Array.isArray(root.allPlayers)) return null;
  const players = root.allPlayers.map(playerOf).filter((p): p is AcquiredPlayer => p !== null);
  // Un roster partiellement illisible ne justifie pas de sélectionner une équipe adverse au hasard.
  if (!players.length || players.length !== root.allPlayers.length || new Set(players.map((p) => p.id)).size !== players.length) return null;
  const active = object(root.activePlayer);
  const eventData = object(root.events);
  const rows = Array.isArray(eventData?.Events) ? eventData.Events : [];
  return {
    gameTime: game.gameTime, players,
    activePlayerAliases: strings(active?.riotId, active?.summonerName, active?.riotIdGameName),
    events: rows.map((e) => eventOf(e, game.gameTime as number)).filter((e): e is AcquiredEvent => e !== null),
    eventsAvailable: Array.isArray(eventData?.Events),
  };
}

export interface AcquisitionOptions {
  port?: number;
  host?: string;
  /** Injection réservée aux tests de transport et aux adaptateurs explicitement sélectionnés. */
  read?: () => Promise<LcuResponse<unknown>>;
}

/** Une requête cohérente par tick, dans le processus principal, sans boucle supplémentaire. */
export class GameDataAcquisitionEngine {
  private pending: Promise<AcquisitionResult> | null = null;
  constructor(private readonly options: AcquisitionOptions = {}) {}

  poll(): Promise<AcquisitionResult> {
    if (this.pending) return this.pending;
    this.pending = this.read().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async read(): Promise<AcquisitionResult> {
    const start = performance.now();
    let response: LcuResponse<unknown>;
    try {
      response = await (this.options.read?.() ?? localRequest(this.options.port ?? 2999, 'GET', '/liveclientdata/allgamedata', {
        host: this.options.host, timeoutMs: 2000,
      }));
    } catch {
      response = { status: 0, data: null };
    }
    const snapshot = response.status === 200 ? normalizeLiveSnapshot(response.data) : null;
    const root = object(response.data);
    const fields = root ? Object.keys(root).sort() : [];
    for (const [key, value] of Object.entries(root ?? {})) {
      if (key === 'allPlayers' && Array.isArray(value)) {
        fields.push(...[...new Set(value.flatMap((p) => Object.keys(object(p) ?? {})))].sort().map((field) => `allPlayers[].${field}`));
      } else if (object(value)) {
        fields.push(...Object.keys(object(value)!).sort().map((field) => `${key}.${field}`));
      }
    }
    return {
      status: snapshot ? 'connected' : response.status === 200 ? 'invalid' : 'unavailable', snapshot,
      diagnostic: {
        source: LIVE_SOURCE, endpoint: '/liveclientdata/allgamedata', status: response.status,
        latencyMs: Math.round(performance.now() - start), receivedAt: Date.now(), fields,
        note: snapshot ? 'Roster et horloge acquis ; positions, visibilité et lancements ennemis non fournis par cet adaptateur.' :
          response.status === 200 ? 'Réponse reçue, mais roster ou horloge illisible.' : 'API Live Client inaccessible ou réponse non disponible.',
      },
    };
  }
}
