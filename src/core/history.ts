// Historique perso ARAM / Mayhem, stocké en JSON local (le client ne garde qu'environ 20 parties).
// Les augments viennent de /lol-match-history/v1/games/{gameId} : stats.playerAugment1..6
// (méthode d'ARAM-Mayhem-Database, MIT).

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LcuClient } from './lcu';
import type { HistoryGame, Mode, StatsView } from './types';
import { modeOf } from './modes';

export interface RawParticipant {
  participantId: number;
  championId: number;
  teamId: number;
  spell1Id?: number;
  spell2Id?: number;
  stats?: Record<string, number | boolean>;
  /** Historique du client : couloir et rôle (« MIDDLE » / « SOLO », « BOTTOM » / « DUO_SUPPORT »…). */
  timeline?: { lane?: string; role?: string };
}

/** Rôle Faille d'après la timeline du client ; null si absent ou ambigu (pas de rôle inventé). */
export function laneOfTimeline(t: RawParticipant['timeline']): string | null {
  const lane = String(t?.lane ?? '').toUpperCase();
  const role = String(t?.role ?? '').toUpperCase();
  if (lane === 'TOP') return 'top';
  if (lane === 'JUNGLE') return 'jungle';
  if (lane === 'MIDDLE' || lane === 'MID') return 'mid';
  if (lane === 'BOTTOM' || lane === 'BOT') return role === 'DUO_SUPPORT' || role === 'SUPPORT' ? 'support' : role === 'DUO_CARRY' || role === 'CARRY' ? 'adc' : null;
  return null;
}

export interface RawGame {
  gameId: number;
  queueId: number;
  gameMode?: string;
  gameCreation?: number;
  gameDuration?: number;
  participants?: RawParticipant[];
  participantIdentities?: {
    participantId: number;
    player?: { puuid?: string; gameName?: string; tagLine?: string; summonerName?: string };
  }[];
}

const num = (s: Record<string, number | boolean>, k: string) => Number(s[k] || 0);

/** Statistiques communes à toi et aux 9 autres joueurs. */
export function participantStats(p: RawParticipant) {
  const s = p.stats ?? {};
  const augments: number[] = [];
  for (let i = 1; i <= 6; i++) if (num(s, `playerAugment${i}`) > 0) augments.push(num(s, `playerAugment${i}`));
  const items: number[] = [];
  for (let i = 0; i <= 6; i++) if (num(s, `item${i}`) > 0) items.push(num(s, `item${i}`));
  return {
    win: Boolean(s.win),
    kills: num(s, 'kills'),
    deaths: num(s, 'deaths'),
    assists: num(s, 'assists'),
    augments,
    items,
    spells: [p.spell1Id, p.spell2Id].filter((x): x is number => !!x),
    level: num(s, 'champLevel'),
    damage: num(s, 'totalDamageDealtToChampions'),
    taken: num(s, 'totalDamageTaken'),
    healed: num(s, 'totalHeal'),
    gold: num(s, 'goldEarned'),
    cs: num(s, 'totalMinionsKilled') + num(s, 'neutralMinionsKilled'),
    multikill: num(s, 'largestMultiKill'),
  };
}

function riotId(game: RawGame, participantId: number): string {
  const p = game.participantIdentities?.find((i) => i.participantId === participantId)?.player;
  return p?.gameName ? `${p.gameName}${p.tagLine ? `#${p.tagLine}` : ''}` : p?.summonerName || '';
}

/** Le détail complet (10 joueurs) n'existe que dans /games/{id} ; la liste ne contient que toi. */
export function hasFullDetail(game: RawGame): boolean {
  return (game.participants?.length ?? 0) > 1;
}

export function parseGame(game: RawGame, puuid: string): HistoryGame | null {
  const mode = modeOf(game.queueId, game.gameMode);
  if (!mode) return null;
  const ident = game.participantIdentities?.find((p) => p.player?.puuid === puuid);
  const me = game.participants?.find((p) => p.participantId === ident?.participantId) ?? (game.participants?.length === 1 ? game.participants[0] : undefined);
  if (!me) return null;
  const st = participantStats(me);
  const base: HistoryGame = {
    gameId: game.gameId,
    queueId: game.queueId,
    mode,
    createdAt: Number(game.gameCreation || 0),
    durationSec: Number(game.gameDuration || 0),
    championId: me.championId,
    win: st.win,
    kills: st.kills,
    deaths: st.deaths,
    assists: st.assists,
    augments: st.augments,
    ...(mode === 'sr' && laneOfTimeline(me.timeline) ? { position: laneOfTimeline(me.timeline)! } : {}),
  };
  if (!me.stats || !('goldEarned' in me.stats)) return base; // ancien format / données partielles
  const others = (game.participants ?? []).filter((p) => p !== me);
  const full = hasFullDetail(game);
  return {
    ...base,
    items: st.items,
    spells: st.spells,
    level: st.level,
    damage: st.damage,
    taken: st.taken,
    healed: st.healed,
    gold: st.gold,
    cs: st.cs,
    multikill: st.multikill,
    ...(full
      ? {
          teamKills: (game.participants ?? []).filter((p) => p.teamId === me.teamId).reduce((n, p) => n + num(p.stats ?? {}, 'kills'), 0),
          allies: others.filter((p) => p.teamId === me.teamId).map((p) => p.championId),
          allyNames: others.filter((p) => p.teamId === me.teamId).map((p) => riotId(game, p.participantId)),
          enemies: others.filter((p) => p.teamId !== me.teamId).map((p) => p.championId),
        }
      : {}),
  };
}

export class History {
  games: HistoryGame[] = [];

  constructor(private file: string) {}

  async load(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.games = Array.isArray(data.games) ? data.games : [];
    } catch {
      this.games = [];
    }
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify({ version: 1, games: this.games }, null, 1));
    await rename(tmp, this.file); // écriture atomique
  }

  has(gameId: number): boolean {
    return this.games.some((g) => g.gameId === gameId);
  }

  async add(game: HistoryGame): Promise<boolean> {
    if (this.has(game.gameId)) return false;
    this.games.push(game);
    this.games.sort((a, b) => b.createdAt - a.createdAt);
    await this.save();
    return true;
  }

  /** Récupère les parties ARAM / Mayhem absentes de l'historique local. */
  async importFromClient(lcu: LcuClient, puuid: string): Promise<number> {
    const list = await lcu.get<{ games?: { games?: RawGame[] } | RawGame[] }>(
      '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=49',
    );
    const inner = list?.games;
    const games: RawGame[] = Array.isArray(inner) ? inner : (inner?.games ?? []);
    let added = 0;
    for (const g of games) {
      if (!modeOf(g.queueId, g.gameMode) || this.has(g.gameId)) continue;
      const detail = await lcu.get<RawGame>(`/lol-match-history/v1/games/${g.gameId}`);
      const parsed = detail ? parseGame(detail, puuid) : parseGame(g, puuid);
      if (parsed && (await this.add(parsed))) added++;
    }
    return added;
  }

  /**
   * Complète les parties enregistrées avant la v1.5 (items, dégâts, compos…) depuis le client.
   * Le client ne garde le détail que des parties récentes : les plus anciennes restent sans détail.
   */
  async enrich(lcu: LcuClient, puuid: string, max = 60): Promise<number> {
    let tried = 0;
    let filled = 0;
    for (const g of this.games) {
      if (tried >= max) break;
      if (g.allyNames || g.noDetail) continue;
      tried++;
      const detail = await lcu.get<RawGame>(`/lol-match-history/v1/games/${g.gameId}`);
      const parsed = detail ? parseGame(detail, puuid) : null;
      if (parsed?.allies) {
        Object.assign(g, parsed);
        filled++;
      } else g.noDetail = true; // ne pas redemander à chaque connexion
    }
    if (tried) await this.save();
    return filled;
  }

  /** Tes résultats par augment (tous champions confondus). */
  augmentRecord(): Map<number, { games: number; wins: number }> {
    const m = new Map<number, { games: number; wins: number }>();
    for (const g of this.games) {
      for (const id of g.augments) {
        const e = m.get(id) ?? { games: 0, wins: 0 };
        e.games++;
        if (g.win) e.wins++;
        m.set(id, e);
      }
    }
    return m;
  }

  personal(mode: Mode | null): Map<number, { games: number; wins: number }> {
    const m = new Map<number, { games: number; wins: number }>();
    for (const g of this.games) {
      if (mode ? g.mode !== mode : g.mode === 'sr') continue; // null : ARAM + Mayhem (jamais la Faille)
      const e = m.get(g.championId) ?? { games: 0, wins: 0 };
      e.games++;
      if (g.win) e.wins++;
      m.set(g.championId, e);
    }
    return m;
  }

  stats(championName: (id: number) => string, augmentName: (id: number) => string): StatsView {
    const byMode: StatsView['byMode'] = { aram: { games: 0, wins: 0 }, mayhem: { games: 0, wins: 0 }, sr: { games: 0, wins: 0 } };
    const champs = new Map<number, { games: number; wins: number; k: number; d: number; a: number }>();
    const augs = new Map<number, { games: number; wins: number }>();
    // Les stats perso restent ARAM + Mayhem : une partie de Faille ne doit pas fausser tes chiffres d'ARAM.
    // La Faille n'apparaît que dans byMode et dans l'historique récent.
    for (const g of this.games) {
      byMode[g.mode].games++;
      if (g.win) byMode[g.mode].wins++;
    }
    const games = this.games.filter((g) => g.mode !== 'sr');
    for (const g of games) {
      const c = champs.get(g.championId) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
      c.games++;
      c.wins += g.win ? 1 : 0;
      c.k += g.kills;
      c.d += g.deaths;
      c.a += g.assists;
      champs.set(g.championId, c);
      for (const id of g.augments) {
        const a = augs.get(id) ?? { games: 0, wins: 0 };
        a.games++;
        a.wins += g.win ? 1 : 0;
        augs.set(id, a);
      }
    }
    const vs = new Map<number, { games: number; wins: number }>();
    const withA = new Map<number, { games: number; wins: number }>();
    const duos = new Map<string, { games: number; wins: number; champs: Map<number, number> }>();
    const bump = (m: Map<number, { games: number; wins: number }>, id: number, win: boolean) => {
      const e = m.get(id) ?? { games: 0, wins: 0 };
      e.games++;
      if (win) e.wins++;
      m.set(id, e);
    };
    for (const g of games) {
      for (const id of g.enemies ?? []) bump(vs, id, g.win);
      for (const id of g.allies ?? []) bump(withA, id, g.win);
      (g.allyNames ?? []).forEach((n, i) => {
        if (!n) return;
        const d = duos.get(n) ?? { games: 0, wins: 0, champs: new Map() };
        d.games++;
        if (g.win) d.wins++;
        const c = g.allies?.[i];
        if (c) d.champs.set(c, (d.champs.get(c) ?? 0) + 1);
        duos.set(n, d);
      });
    }
    // Peu de parties par champion : on trie sur un winrate lissé vers ton winrate global (5 parties fictives),
    // pour qu'un 0/3 ne passe pas devant un 4/14.
    const base = games.length ? games.filter((g) => g.win).length / games.length : 0.5;
    const smooth = (e: { games: number; wins: number }) => (e.wins + 5 * base) / (e.games + 5);
    const matchups = (m: Map<number, { games: number; wins: number }>) =>
      [...m.entries()].filter(([, e]) => e.games >= 4).map(([id, e]) => ({ championId: id, name: championName(id), ...e }));
    return {
      vsEnemies: matchups(vs).sort((a, b) => smooth(a) - smooth(b)),
      withAllies: matchups(withA).sort((a, b) => smooth(b) - smooth(a)),
      duos: [...duos.entries()]
        .filter(([, d]) => d.games >= 2)
        .map(([name, d]) => ({ name, games: d.games, wins: d.wins, champions: [...d.champs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c) }))
        .sort((a, b) => b.games - a.games),
      total: games.length,
      byMode,
      champions: [...champs.entries()]
        .map(([id, c]) => ({ championId: id, name: championName(id), games: c.games, wins: c.wins, kda: (c.k + c.a) / Math.max(1, c.d) }))
        .sort((a, b) => b.games - a.games || b.wins - a.wins),
      augments: [...augs.entries()]
        .map(([id, a]) => ({ id, name: augmentName(id), games: a.games, wins: a.wins }))
        .sort((a, b) => b.games - a.games),
      recent: this.games.slice(0, 20).map((g) => ({
        ...g,
        championName: championName(g.championId),
        augmentNames: g.augments.map(augmentName),
      })),
    };
  }
}
