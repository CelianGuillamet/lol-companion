// Swiftplay : pas de vrai champ select. Champions, rôles, runes et sorts se règlent au salon, dans 2 emplacements
// (`localMember.playerSlots` de /lol-lobby/v2/lobby), avant la file. Mesuré sur 3 parties du 3 nov. 2026 : la session
// de champ select arrive avec skipChampionSelect, phase GAME_STARTING, sans action : tout import y est trop tard.

import { laneOf, type Lane, type LaneMetaRow } from './opgg';
import { wilson } from './stats';

/** Files à emplacements préparés au salon : Swiftplay (480) et partie rapide (490). */
export const SLOT_QUEUES = new Set([480, 490]);

export const SMITE = 11;

/**
 * Swiftplay : les objets de Doran n'existent pas, les objets du Gardien les remplacent, et on part avec 1 400 or
 * (page d'aide de Riot, dev blog « A Swifter Swiftplay »). Correspondance par usage, pas une stat : OP.GG ne mesure pas la file.
 * Horn pour Shield, Orb pour Ring, Blade pour Blade. Guardian's Hammer existe aussi pour les mêlées AD, sans chiffre pour trancher.
 */
const GUARDIAN_OF: Record<number, number> = { 1054: 2051, 1055: 3177, 1056: 3112 };

export const swiftplayStarter = (ids: number[]): number[] => ids.map((id) => GUARDIAN_OF[id] ?? id);

/** Balises : données ou gratuites, elles ne disent pas que tu as fait tes achats de départ. */
const TRINKETS = new Set([3340, 3363, 3364]);

/** Rien d'acheté : la seule chose possible à ce moment est le départ, pas un item du build. */
export const nothingBought = (owned: number[]): boolean => owned.every((id) => TRINKETS.has(id));

export interface SlotRunes {
  primary: number;
  sub: number;
  perks: number[];
}

export interface LobbySlot {
  championId: number;
  /** Rôle préparé, null si le client n'en donne pas (UNSELECTED, FILL). */
  lane: Lane | null;
  spells: [number, number];
  runes: SlotRunes | null;
}

/** `perks` est une chaîne JSON dans le salon. Illisible ou vide : null, on ne suppose rien. */
export function readPerks(raw: unknown): SlotRunes | null {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const p = o as { perkIds?: unknown; perkStyle?: unknown; perkSubStyle?: unknown } | null;
  if (!p || typeof p !== 'object' || !Array.isArray(p.perkIds)) return null;
  const perks = p.perkIds.map(Number).filter((n) => n > 0);
  const primary = Number(p.perkStyle) || 0;
  const sub = Number(p.perkSubStyle) || 0;
  return primary && sub && perks.length >= 6 ? { primary, sub, perks } : null;
}

/** Les emplacements du salon, ou null hors Swiftplay. Un emplacement sans champion n'est pas gardé. */
export function readSlots(lobby: unknown): { queueId: number; slots: LobbySlot[] } | null {
  const l = lobby as { gameConfig?: { queueId?: number }; localMember?: { playerSlots?: unknown } } | null;
  const queueId = Number(l?.gameConfig?.queueId);
  if (!SLOT_QUEUES.has(queueId) || !Array.isArray(l?.localMember?.playerSlots)) return null;
  const slots: LobbySlot[] = [];
  for (const raw of l.localMember.playerSlots as { championId?: unknown; positionPreference?: unknown; spell1?: unknown; spell2?: unknown; perks?: unknown }[]) {
    const championId = Number(raw?.championId);
    if (!(championId > 0)) continue;
    slots.push({ championId, lane: laneOf(String(raw.positionPreference ?? '')), spells: [Number(raw.spell1) || 0, Number(raw.spell2) || 0], runes: readPerks(raw.perks) });
  }
  return slots.length ? { queueId, slots } : null;
}

/**
 * same : mêmes 6 runes, éclats ignorés (OP.GG en donne un seul jeu). minor : même clé de voûte, d'autres runes.
 * keystone : autre clé dans le même arbre. style : autre arbre principal. unknown : rien à comparer.
 */
export type RuneVerdict = 'same' | 'minor' | 'keystone' | 'style' | 'unknown';

export interface LoadoutGap {
  /** null : pas de sorts conseillés, ou emplacement sans sorts lus. */
  spellsOk: boolean | null;
  /** Rôle jungle sans Châtiment : la partie est perdue d'avance, quel que soit le reste. */
  smiteMissing: boolean;
  runes: RuneVerdict;
  /** Runes différentes sur les 6, éclats exclus. */
  runesOff: number;
}

export function compareLoadout(slot: LobbySlot, rec: { spells: number[]; runes: SlotRunes | null } | null): LoadoutGap {
  const have = slot.spells.filter((s) => s > 0);
  const smiteMissing = slot.lane === 'jungle' && have.length > 0 && !have.includes(SMITE);
  const want = rec?.spells ?? [];
  const spellsOk = have.length === 2 && want.length === 2 ? want.every((s) => have.includes(s)) : null;
  const a = slot.runes;
  const b = rec?.runes ?? null;
  if (!a || !b || b.perks.length < 6) return { spellsOk, smiteMissing, runes: 'unknown', runesOff: 0 };
  const mine = new Set(a.perks.slice(0, 6));
  const runesOff = b.perks.slice(0, 6).filter((p) => !mine.has(p)).length;
  const runes: RuneVerdict = a.primary !== b.primary ? 'style' : a.perks[0] !== b.perks[0] ? 'keystone' : runesOff || a.sub !== b.sub ? 'minor' : 'same';
  return { spellsOk, smiteMissing, runes, runesOff };
}

/** Mêmes seuils que la tier list Faille : joué au moins 5 % du temps dans le rôle. */
const POOL_MIN_SHARE = 0.05;
const POOL_MIN_GAMES = 500;
const POOL_MIN_SIZE = 5;
/** Au-delà, le rôle est vraiment celui du champion : un autre rôle choisi au salon mérite une ligne. */
const MAIN_MIN_SHARE = 0.5;
const STRONGER_MAX = 3;

export interface SlotFit {
  /** Place dans le rôle, à la borne basse du winrate. null : hors du rôle (moins de 5 % de ses parties, ou trop peu de parties). */
  rank: number | null;
  of: number;
  /** Rôle principal du champion s'il n'est pas celui préparé. */
  main: { lane: Lane; share: number; winRate: number } | null;
  /** Rempli seulement si le choix est faible : dernier tiers, hors du rôle ou loin de son rôle principal. */
  stronger: { champion: string; winRate: number; games: number }[];
}

/**
 * Le seul moment où Swiftplay laisse choisir son champion : sa place dans le rôle. Stats de classée, le salon ne connaît
 * pas l'équipe adverse : à lire comme un repère. `rows` : les lignes du champion, tous rôles.
 */
export function slotFit(rows: LaneMetaRow[], meta: Iterable<LaneMetaRow[]>, lane: Lane): SlotFit | null {
  const lo = (r: LaneMetaRow) => wilson(r.winRate, r.games).lo;
  const pool = [...meta]
    .flat()
    .filter((r) => r.lane === lane && r.roleRate >= POOL_MIN_SHARE && r.games >= POOL_MIN_GAMES && r.winRate > 0)
    .sort((a, b) => lo(b) - lo(a));
  if (pool.length < POOL_MIN_SIZE || !rows.length) return null;
  const name = rows[0].champion;
  const at = pool.findIndex((r) => r.champion === name);
  const top = [...rows].sort((a, b) => b.roleRate - a.roleRate)[0];
  const main = top.lane !== lane && top.roleRate >= MAIN_MIN_SHARE ? { lane: top.lane, share: top.roleRate, winRate: top.winRate } : null;
  const weak = at < 0 || !!main || at + 1 > (pool.length * 2) / 3;
  const ceiling = at >= 0 ? wilson(pool[at].winRate, pool[at].games).hi : 0;
  const stronger = weak
    ? pool
        .filter((r) => r.champion !== name && lo(r) > ceiling)
        .slice(0, STRONGER_MAX)
        .map((r) => ({ champion: r.champion, winRate: r.winRate, games: r.games }))
    : [];
  return { rank: at >= 0 ? at + 1 : null, of: pool.length, main, stronger };
}
