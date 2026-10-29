// Orchestration : suit le client League, construit l'état affiché et exécute les actions.
// Aucune dépendance à Electron : testable avec un faux client (voir test/engine.test.ts).

import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { LcuClient, discoverCredentials, liveClient, type Credentials } from './lcu';
import { Arammeta, type ChampionDetail, type DetailRow } from './arammeta';
import { GameData } from './gamedata';
import { History, parseGame, participantStats, hasFullDetail, type RawGame } from './history';
import { scoreCandidates, needsOf } from './advisor';
import { parseSession, readSubset, pickCard, takeFromBench, requestTradeDetailed, type ParsedChampSelect, type RawSession } from './champselect';
import { applyRunes, applySpells, applyItemSet, bestSpells, recommendedPage } from './loadout';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import { modeOf, opggModeOf, QUEUE_LABEL, SR_MAP_ID } from './modes';
import { wilson, verdictOf } from './stats';
import { Balance, badges } from './balance';
import { nextBuys, TRANSFORMS } from './nextbuy';
import { buildRole, championTags, compFromItems, counterItemsFor, damageKind, enemiesFromSession, enemyThreats, fedWeight, readTeams } from './counters';
import type { BalanceBadge } from './balance';
import type { CardCandidate, CardRead } from './cardmatch';
import { Usage, followStat } from './usage';
import { headlinerFromCards, historyHeadliner, type HeadlinerInfo } from './headliner';
import { AugmentInfo, buildProfile, fitOf } from './augfit';
import { OpggClient, OpggData, buildArgs, laneOf, LANE_LABEL, matchupFrom, counterPicksFrom, type Lane, type OpggAnalysis } from './opgg';
import type { MatchupView, SrSelect, AppState, CounterPanel, NextBuyPanel, AugmentPanel, AugmentRow, BuildPanel, ChampSelectView, GameDetail, HistoryEntry, HistoryGame, LogEntry, Mode, Rarity, Settings, StatItem } from './types';

export interface EngineOptions {
  dataDir: string;
  /** Dossier où déposer des captures brutes du client pour étudier de nouveaux champs (ex. headliner Mayhem). */
  probeDir?: string;
  /** Tests : téléchargement du module d'augments du wiki. */
  augInfoFetcher?: (url: string) => Promise<string>;
  discover?: () => Promise<Credentials | null>;
  live?: { port: number; host?: string };
  arammeta?: Arammeta;
  balance?: Balance;
  pollMs?: number;
}

const RARITIES: Rarity[] = ['kPrismatic', 'kGold', 'kSilver'];

export class Engine extends EventEmitter {
  state: AppState;
  private lcu: LcuClient | null = null;
  private meta: Arammeta;
  private balance: Balance;
  private game = new GameData();
  private history: History;
  private settingsFile: string;
  private discover: () => Promise<Credentials | null>;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastJson = '';
  private puuid: string | null = null;
  private parsed: ParsedChampSelect | null = null;
  private myChampionId = 0; // conservé du champ select jusqu'à la fin de la partie
  private lastChampion = { id: 0, seen: 0 };
  /** Fin de l'aperçu lancé par « Tester » : la boucle ne l'efface pas avant. */
  private previewUntil = 0;
  /** Télémétrie locale (probe-output/usage.json). */
  usage: Usage;
  /** Ce que fait chaque augment (wiki) : pour les rapprocher de ton build. */
  private augInfo: AugmentInfo;
  /** Données Faille (OP.GG, serveur MCP public). */
  opgg: OpggClient;
  private opggData: OpggData;
  /** Ton rôle sur la Faille (champ select, puis partie en cours) ; null en ARAM ou en partie sans rôles. */
  private lane: Lane | null = null;
  private srCache = new Map<string, Promise<OpggAnalysis | null>>();
  /** Ton build en cours : profil (critiques, AP…) et nombre d'items pris en compte. */
  private buildFit: { profile: ReturnType<typeof buildProfile>; seen: number } | null = null;
  /** Dernières cartes lues par choix d'augment pendant la partie en cours (pour savoir si tu as suivi la reco). */
  private offersThisGame = new Map<string, { round: number | null; ids: number[]; best: number | null }>();
  private missesThisGame = new Set<string>();
  /** Achats : inventaire et conseil au tick précédent (pour savoir si tu as suivi le conseil d'achat). */
  private lastBuy: { owned: number[]; reco: number | null; plan: number[] } | null = null;
  /** Conseils d'achat que tu as passés dans cette partie (nombre de fois). */
  private skippedBuys = new Map<number, number>();
  private lastSelectLine = '';
  private acceptedCheck = false;

  /** Acceptation automatique : uniquement en ARAM / Mayhem, une fois par partie trouvée, si l'option est active. */
  private async maybeAccept(): Promise<void> {
    if (!this.state.settings.autoAccept || this.acceptedCheck || !this.state.mode || !this.lcu) return;
    const rc = await this.lcu.get<{ state?: string; playerResponse?: string }>('/lol-matchmaking/v1/ready-check');
    if (rc?.state !== 'InProgress' || (rc.playerResponse && rc.playerResponse !== 'None')) return;
    const r = await this.lcu.request('POST', '/lol-matchmaking/v1/ready-check/accept');
    if (r.status >= 200 && r.status < 300) {
      this.acceptedCheck = true;
      this.log('success', 'Partie acceptée automatiquement');
    }
  }
  private loadoutDoneFor = 0;
  private recordedGame = false;
  private recordAttempts = 0;
  private recordStartedAt = 0;
  private pendingGameId = 0;

  private fallbackRecord(): void {
    this.recordedGame = true;
    this.log('info', `Enregistrement direct impossible après ${this.recordAttempts} essai(s) : récupération via l’historique du client`);
    // Le client met parfois quelques secondes à publier la partie dans son historique.
    setTimeout(() => void this.importHistory(), 5000);
  }
  private panelCache = new Map<number, AugmentPanel>();
  private buildCache = new Map<string, BuildPanel>();
  private importing = false;

  constructor(private opts: EngineOptions) {
    super();
    this.meta = opts.arammeta ?? new Arammeta(join(opts.dataDir, 'cache'));
    this.balance = opts.balance ?? new Balance(join(opts.dataDir, 'cache'));
    this.history = new History(join(opts.dataDir, 'history.json'));
    this.settingsFile = join(opts.dataDir, 'settings.json');
    this.augInfo = new AugmentInfo(join(opts.dataDir, 'cache'), opts.augInfoFetcher);
    this.opgg = new OpggClient(join(opts.dataDir, 'cache', 'opgg'), opts.probeDir ?? null);
    this.opggData = new OpggData(this.opgg);
    this.usage = new Usage(opts.probeDir ? join(opts.probeDir, 'usage.json') : null);
    this.discover = opts.discover ?? discoverCredentials;
    this.state = {
      connection: 'searching',
      phase: null,
      mode: null,
      queueId: null,
      summonerName: null,
      data: { patch: null, loadedAt: null, error: null },
      champSelect: null,
      augments: null,
      build: null,
      counters: null,
      nextBuy: null,
      augRound: null,
      stats: { total: 0, byMode: { aram: { games: 0, wins: 0 }, mayhem: { games: 0, wins: 0 }, sr: { games: 0, wins: 0 } }, champions: [], augments: [], recent: [], vsEnemies: [], withAllies: [], duos: [] },
      settings: { ...DEFAULT_SETTINGS },
      log: [],
    };
  }

  async start(): Promise<void> {
    this.state.settings = await loadSettings(this.settingsFile);
    await this.history.load();
    await this.usage.load();
    this.refreshStats();
    void this.refreshData(false);
    if (this.opts.probeDir) void this.probeOpgg();
    const loop = async () => {
      await this.tick();
      this.timer = setTimeout(loop, this.opts.pollMs ?? 1000);
    };
    void loop();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Message dans le journal (utilisé aussi par la fenêtre Electron). */
  note(level: LogEntry['level'], text: string): void {
    this.log(level, text);
    this.emitIfChanged();
  }

  /** Panneau d'augments pour un test hors partie : ton champion actuel, sinon celui de ta dernière partie. */
  async previewPanel(): Promise<boolean> {
    const id = this.myChampionId || this.state.augments?.championId || this.state.stats.recent[0]?.championId || 0;
    if (!id) return false;
    this.previewUntil = Date.now() + 20_000;
    if (!this.state.augments) this.state.augments = await this.augmentPanel(id);
    if (!this.state.build) this.state.build = await this.buildPanel(id, this.state.mode ?? 'mayhem');
    this.emitIfChanged();
    return !!(this.state.augments || this.state.build);
  }

  private log(level: LogEntry['level'], text: string): void {
    // Même message dans la minute (erreur qui se répète à chaque tick) : on ne le duplique pas
    const last = this.state.log[0];
    if (last && last.text === text && Date.now() - last.at < 60_000) return;
    this.state.log = [{ at: Date.now(), level, text }, ...this.state.log].slice(0, 40);
    this.persistLog(level, text);
  }

  /** Journal gardé dans probe-output/journal.txt (pour relire une partie après coup ; 1 Mo max). */
  private journalChecked = false;
  private persistLog(level: string, text: string): void {
    const dir = this.opts.probeDir;
    if (!dir) return;
    const file = join(dir, 'journal.txt');
    void (async () => {
      try {
        const fs = await import('node:fs/promises');
        if (!this.journalChecked) {
          this.journalChecked = true;
          const st = await fs.stat(file).catch(() => null);
          if (st && st.size > 1_000_000) await fs.writeFile(file, '');
        }
        await fs.mkdir(dir, { recursive: true });
        await fs.appendFile(file, `${new Date().toISOString()} [${level}] ${text}\n`);
      } catch {
        /* diagnostic seulement */
      }
    })();
  }

  private emitIfChanged(): void {
    const json = JSON.stringify(this.state);
    if (json !== this.lastJson) {
      this.lastJson = json;
      this.emit('state', this.state);
    }
  }

  async refreshData(force: boolean): Promise<void> {
    try {
      const t = await this.meta.load(force);
      this.state.data = { patch: t.patch_prefix, loadedAt: this.meta.loadedAt, error: null, clientPatch: this.state.data.clientPatch };
      if (t.ddv) this.game.ddragonVersion = t.ddv;
      this.panelCache.clear();
      this.buildCache.clear();
      this.refreshStats(); // noms des champions / augments (client fermé : seule source = arammeta)
    } catch (e) {
      this.state.data = { ...this.state.data, error: `Données arammeta indisponibles : ${(e as Error).message}` };
    }
    await this.balance.load(force).catch(() => undefined);
    await this.augInfo.load(force).catch(() => undefined);
    this.state.data.balance =
      this.balance.source === 'wiki' ? `wiki LoL, ${this.balance.size} champions` : `instantané embarqué patch 16.21 (wiki injoignable)`;
    this.emitIfChanged();
  }

  private masteryCache: { at: number; map: Map<number, { level: number; points: number }> } | null = null;

  /** Ta maîtrise par champion (LCU), relue au plus toutes les 10 minutes. */
  private async masteries(): Promise<Map<number, { level: number; points: number }>> {
    if (this.masteryCache && Date.now() - this.masteryCache.at < 600_000) return this.masteryCache.map;
    const map = new Map<number, { level: number; points: number }>();
    const rows = await this.lcu?.get<{ championId: number; championLevel: number; championPoints: number }[]>('/lol-champion-mastery/v1/local-player/champion-mastery');
    if (Array.isArray(rows)) for (const r of rows) map.set(r.championId, { level: r.championLevel, points: r.championPoints });
    this.masteryCache = { at: Date.now(), map };
    return map;
  }

  private namesOf(id: number): string[] {
    const m = this.meta.champion(id);
    return [m?.name_en ?? '', m?.alias ?? '', this.game.championName(id, '')].filter(Boolean);
  }

  /** « dégâts −5 % → −10 % » à partir de deux jeux de modificateurs. */
  private changeText(id: number): { at: number; text: string } | null {
    const c = this.balance.changeFor(this.namesOf(id));
    if (!c) return null;
    const before = badges(c.before).map((b) => b.label);
    const after = badges(c.after).map((b) => b.label);
    const date = new Date(c.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    return { at: c.at, text: `modifié le ${date} : ${before.join(', ') || 'neutre'} → ${after.join(', ') || 'neutre'}` };
  }

  /** Changements d'équilibrage récents, tes champions joués d'abord. */
  balanceChanges(): { championId: number; name: string; at: number; text: string; played: number }[] {
    const played = this.history.personal(null);
    const ids = [...new Set([...this.game.champions.keys(), ...Object.keys(this.meta.tierList?.champs ?? {}).map(Number)])].filter((id) => id > 0);
    return ids
      .map((id) => ({ id, ch: this.changeText(id) }))
      .filter((x): x is { id: number; ch: { at: number; text: string } } => !!x.ch)
      .map(({ id, ch }) => ({ championId: id, name: this.champName(id), at: ch.at, text: ch.text, played: played.get(id)?.games ?? 0 }))
      .sort((a, b) => b.played - a.played || b.at - a.at);
  }

  /** Badges d'équilibrage ARAM (wiki) d'un champion. */
  balanceOf(id: number, mode: Mode): BalanceBadge[] {
    if (mode === 'sr') return []; // modificateurs propres à l'ARAM
    const m = this.meta.champion(id);
    return badges(this.balance.forChampion([m?.name_en ?? '', m?.alias ?? '', this.game.championName(id, '')].filter(Boolean), mode));
  }

  private champName = (id: number, fallback?: string): string => this.game.championName(id, this.meta.champion(id)?.name_en || fallback);
  private augName = (id: number): string => this.game.augmentName(id, this.meta.tierList?.augs[String(id)]?.name_en);

  /** Panneau d'augments d'un champion quelconque (page champion de Mes stats). */
  async championAugments(championId: number): Promise<AugmentPanel | null> {
    if (!this.meta.tierList) return null;
    return this.augmentPanel(championId);
  }

  /** « Pentakill » pour une partie qui contient le marqueur GoH_PentakillAug… */
  private headlinerOf(augments: number[]): string | null {
    const id = augments.find((a) => this.game.isHeadlinerMarker(a));
    return id ? this.augName(id).replace(/\s*\(headliner\)$/, '') : null;
  }

  /** Build d'un champion quelconque (exploration hors partie) : Mayhem, ou Faille pour un rôle (stats classées). */
  async championBuild(championId: number, lane?: string): Promise<BuildPanel | null> {
    const l = laneOf(lane);
    return l ? this.srBuildPanel(championId, l, 'ranked') : this.buildPanel(championId, 'mayhem');
  }

  /**
   * Tier list Faille d'un rôle (OP.GG, patch en cours, classée) : champions joués au moins 5 % du temps dans ce
   * rôle, avec le palier OP.GG (1 = le plus fort), le winrate et le nombre de parties.
   */
  async laneTier(lane: string): Promise<{ id: number; name: string; winrate: number; games: number; tier: number | null; roleRate: number }[]> {
    const l = laneOf(lane);
    if (!l) return [];
    const meta = await this.opggData.laneMeta();
    const byName = new Map<string, number>();
    const key = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [id, c] of this.game.champions) {
      byName.set(key(c.name), id);
      byName.set(key(c.alias), id);
    }
    for (const [id, m] of Object.entries(this.meta.tierList?.champs ?? {})) if (m.name_en) byName.set(key(m.name_en), Number(id));
    const out: { id: number; name: string; winrate: number; games: number; tier: number | null; roleRate: number }[] = [];
    for (const rows of meta.values())
      for (const r of rows) {
        if (r.lane !== l || r.roleRate < 0.05) continue;
        const id = byName.get(key(r.champion)) ?? 0;
        if (id > 0) out.push({ id, name: this.champName(id), winrate: r.winRate, games: r.games, tier: r.tier, roleRate: r.roleRate });
      }
    return out.sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || b.winrate - a.winrate);
  }

  /** Rôles où le champion est joué (≥ 5 %), du plus joué au moins joué (OP.GG). */
  async championLanes(championId: number): Promise<{ lane: string; roleRate: number }[]> {
    const name = this.meta.champion(championId)?.name_en || this.champName(championId);
    const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const rows = (await this.opggData.laneMeta()).get(key) ?? [];
    return rows.filter((r) => r.roleRate >= 0.05).sort((a, b) => b.roleRate - a.roleRate).map((r) => ({ lane: r.lane, roleRate: r.roleRate }));
  }

  /** Ton rôle actuel (Faille), pour ouvrir la tier list sur le bon rôle. */
  currentLane(): string | null {
    return this.lane;
  }

  /** Tous les champions (noms du client, winrate Mayhem arammeta) pour l'exploration. */
  listChampions(): { id: number; name: string; winrate: number | null; games: number; tags: string[] }[] {
    const ids = new Set<number>([...this.game.champions.keys(), ...Object.keys(this.meta.tierList?.champs ?? {}).map(Number)]);
    return [...ids]
      .filter((id) => id > 0)
      .map((id) => {
        const m = this.meta.champion(id);
        return { id, name: this.champName(id), winrate: m?.wr ?? null, games: m?.g ?? 0, tags: m?.tags ?? [] };
      })
      .filter((c) => !c.name.startsWith('#'))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  /** Parties brutes (export / sauvegarde). */
  rawHistory(): HistoryGame[] {
    return this.history.games;
  }

  /** Onglet Historique : toutes les parties, noms et icônes résolus. */
  getHistory(): HistoryEntry[] {
    return this.history.games.map((g) => ({
      ...g,
      championName: this.champName(g.championId),
      championWr: this.meta.champion(g.championId)?.wr ?? null,
      headliner: historyHeadliner(g, this.headlinerOf(g.augments)),
      augmentIcons: g.augments.filter((id) => !this.game.isHeadlinerMarker(id)).map((id) => ({ id, name: this.augName(id), icon: this.game.augmentIcon(id) ?? this.meta.augmentIconUrl(id) })),
      itemIcons: (g.items ?? []).map((id) => this.game.item(id)),
    }));
  }

  private detailCache = new Map<number, GameDetail>();

  /** Les 10 joueurs d'une partie, lus dans le client à la demande (null si le client ne l'a plus). */
  async gameDetail(gameId: number): Promise<GameDetail | null> {
    const cached = this.detailCache.get(gameId);
    if (cached) return cached;
    if (!this.lcu) return null;
    const raw = await this.lcu.get<RawGame>(`/lol-match-history/v1/games/${gameId}`);
    if (!raw || !hasFullDetail(raw)) return null;
    const names = new Map((raw.participantIdentities ?? []).map((i) => [i.participantId, i.player]));
    const teams = new Map<number, GameDetail['teams'][number]>();
    for (const p of raw.participants ?? []) {
      const st = participantStats(p);
      const who = names.get(p.participantId);
      const team = teams.get(p.teamId) ?? { teamId: p.teamId, win: st.win, kills: 0, gold: 0, players: [] };
      team.kills += st.kills;
      team.gold += st.gold;
      team.players.push({
        name: who?.gameName ? `${who.gameName}${who.tagLine ? `#${who.tagLine}` : ''}` : who?.summonerName || this.champName(p.championId),
        championId: p.championId,
        championName: this.champName(p.championId),
        me: !!this.puuid && who?.puuid === this.puuid,
        level: st.level,
        kills: st.kills,
        deaths: st.deaths,
        assists: st.assists,
        damage: st.damage,
        taken: st.taken,
        healed: st.healed,
        gold: st.gold,
        cs: st.cs,
        items: st.items.map((id) => this.game.item(id)),
        spells: st.spells.map((id) => this.game.spell(id)),
        augments: st.augments.map((id) => ({ id, name: this.augName(id), icon: this.game.augmentIcon(id) })),
      });
      teams.set(p.teamId, team);
    }
    // ton équipe en premier, puis chaque équipe triée par dégâts
    const list = [...teams.values()].sort((a, b) => Number(b.players.some((x) => x.me)) - Number(a.players.some((x) => x.me)));
    for (const t of list) t.players.sort((a, b) => b.damage - a.damage);
    const detail: GameDetail = { gameId, durationSec: Number(raw.gameDuration || 0), teams: list };
    this.detailCache.set(gameId, detail);
    return detail;
  }

  private mirrorTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Copie de ton historique dans probe-output/ (dossier du projet) pour que les sessions de développement puissent
   * calibrer l'app sur tes vraies parties (poids de la maîtrise, pièges…). Regroupé : au plus une écriture / 30 s.
   */
  private mirrorHistory(): void {
    if (!this.opts.probeDir || this.mirrorTimer) return;
    this.mirrorTimer = setTimeout(async () => {
      this.mirrorTimer = null;
      try {
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir(this.opts.probeDir!, { recursive: true });
        await writeFile(join(this.opts.probeDir!, 'historique.json'), JSON.stringify({ exportedAt: Date.now(), games: this.history.games }));
      } catch {
        /* diagnostic seulement */
      }
    }, 30_000);
    this.mirrorTimer.unref?.();
  }

  private refreshStats(): void {
    this.mirrorHistory();
    const st = this.history.stats(this.champName, this.augName);
    // Marqueurs de headliner sans nom (« #3176 ») : ce ne sont pas des augments choisis, on ne les liste pas
    st.augments = st.augments.filter((x) => !(this.game.isHeadlinerMarker(x.id) || /^#\d+$/.test(x.name)));
    this.state.stats = { ...st, followReco: followStat(this.usage.events) };
    this.panelCache.clear(); // les stats perso affichées dans le panneau changent
  }

  // ---------------------------------------------------------------- boucle

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.tickInner();
    } catch (e) {
      this.log('warning', `Erreur interne : ${(e as Error).message}`);
    } finally {
      this.busy = false;
      this.emitIfChanged();
    }
  }

  private async tickInner(): Promise<void> {
    if (!this.lcu) {
      const creds = await this.discover();
      if (!creds) {
        this.setDisconnected();
        return;
      }
      this.lcu = new LcuClient(creds);
    }
    const r = await this.lcu.request<string>('GET', '/lol-gameflow/v1/gameflow-phase');
    if (r.status === 0 || r.status === 401 || r.status === 403) {
      this.lcu = null;
      this.setDisconnected();
      return;
    }
    if (this.state.connection !== 'connected') await this.onConnected();
    const phase = typeof r.data === 'string' ? r.data : 'None';
    const changed = phase !== this.state.phase;
    this.state.phase = phase;

    if (changed && ['Lobby', 'Matchmaking', 'ReadyCheck', 'ChampSelect', 'InProgress', 'GameStart'].includes(phase)) {
      await this.readQueue();
    }

    if (phase === 'ReadyCheck') await this.maybeAccept();
    else this.acceptedCheck = false;

    if (phase === 'ChampSelect' && this.state.mode) {
      this.recordedGame = false;
      this.recordAttempts = 0;
      this.recordStartedAt = 0;
      this.offersThisGame.clear();
      this.missesThisGame.clear();
      this.state.headliner = null;
      this.lastBuy = null;
      this.skippedBuys.clear();
      this.probedRounds.clear();
      await this.handleChampSelect();
    } else if (phase !== 'ChampSelect') {
      this.probedSelect = false;
      this.state.champSelect = null;
      this.parsed = null;
    }

    if ((phase === 'InProgress' || phase === 'GameStart' || phase === 'Reconnect') && this.state.mode) {
      await this.handleInGame();
    }

    if (phase !== 'InProgress' && phase !== 'Reconnect' && this.state.offered) this.state.offered = null;

    // Fin de partie : le détail (avec les augments) peut mettre du temps à être dispo → on réessaie pendant 45 s.
    const endPhase = phase === 'EndOfGame' || phase === 'PreEndOfGame' || phase === 'WaitingForStats';
    if (endPhase && this.state.mode && !this.recordedGame) {
      if (!this.recordStartedAt) this.recordStartedAt = Date.now();
      this.recordAttempts++;
      this.recordedGame = await this.recordFinishedGame();
      if (this.recordedGame) void this.refreshPlayer(); // LP et rang à jour
      if (!this.recordedGame && Date.now() - this.recordStartedAt > 45_000) this.fallbackRecord();
    }
    // Filet de sécurité : la fin de partie est passée sans enregistrement → on relit l'historique du client.
    if (!endPhase && this.recordStartedAt && !this.recordedGame) this.fallbackRecord();

    if (phase === 'None' || phase === 'Lobby') void this.checkPatch(); // limité à une fois par heure
    if (['None', 'Lobby', 'Matchmaking'].includes(phase) && Date.now() > this.previewUntil) {
      this.state.augments = null;
      this.state.build = null;
      this.state.counters = null;
      this.state.nextBuy = null;
      this.state.augRound = null;
      this.state.headliner = null;
      this.myChampionId = 0;
      this.lane = null;
      this.loadoutDoneFor = 0;
      this.lastChampion = { id: 0, seen: 0 };
    }
  }

  private setDisconnected(): void {
    this.state.player = null;
    if (this.state.connection === 'connected') this.log('info', 'Client League fermé');
    this.state.connection = 'searching';
    this.state.phase = null;
    this.state.champSelect = null;
    this.state.augments = null;
    this.state.build = null;
    this.state.counters = null;
    this.state.nextBuy = null;
  }

  private async onConnected(): Promise<void> {
    this.state.connection = 'connected';
    this.log('success', 'Connecté au client League');
    await this.game.load(this.lcu!);
    const me = await this.lcu!.get<{ puuid: string; gameName?: string; displayName?: string }>('/lol-summoner/v1/current-summoner');
    this.puuid = me?.puuid ?? null;
    this.state.summonerName = me?.gameName || me?.displayName || null;
    void this.refreshPlayer();
    this.refreshStats();
    void this.importHistory();
    void this.checkPatch();
  }

  /** Carte joueur : Riot ID, icône, niveau et rangs classés (client local, à la connexion et après chaque partie). */
  async refreshPlayer(): Promise<void> {
    const lcu = this.lcu;
    if (!lcu) return;
    const me = await lcu.get<{ gameName?: string; tagLine?: string; displayName?: string; profileIconId?: number; summonerLevel?: number }>('/lol-summoner/v1/current-summoner');
    if (!me) return;
    const ranked = await lcu.get<{ queues?: { queueType?: string; tier?: string; division?: string; leaguePoints?: number; wins?: number; losses?: number }[] }>('/lol-ranked/v1/current-ranked-stats');
    const QUEUE: Record<string, 'Solo/Duo' | 'Flex'> = { RANKED_SOLO_5x5: 'Solo/Duo', RANKED_FLEX_SR: 'Flex' };
    this.state.player = {
      riotId: me.gameName ? `${me.gameName}${me.tagLine ? `#${me.tagLine}` : ''}` : (me.displayName ?? ''),
      iconUrl: me.profileIconId != null ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${me.profileIconId}.jpg` : null,
      level: me.summonerLevel ?? null,
      ranks: (ranked?.queues ?? [])
        .filter((q) => q.queueType && QUEUE[q.queueType] && q.tier && q.tier !== 'NONE' && q.tier !== '')
        .map((q) => ({ queue: QUEUE[q.queueType!], tier: q.tier!, division: q.division && q.division !== 'NA' ? q.division : '', lp: q.leaguePoints ?? 0, wins: q.wins ?? 0, losses: q.losses ?? 0 })),
    };
    this.emitIfChanged();
  }

  private lastPatchCheck = 0;

  /**
   * Nouveau patch côté client (ex. 16.22) alors que les données arammeta sont encore du 16.21 : on force un
   * rechargement (au plus une fois par heure) et on le signale.
   */
  async checkPatch(): Promise<void> {
    if (!this.lcu || Date.now() - this.lastPatchCheck < 3600_000) return;
    this.lastPatchCheck = Date.now();
    const v = await this.lcu.get<string>('/lol-patch/v1/game-version');
    const client = typeof v === 'string' ? (v.match(/^(\d+)\.(\d+)/) ?? null) : null;
    const data = this.meta.tierList?.patch_prefix?.match(/^(\d+)\.(\d+)/) ?? null;
    if (!client || !data) return;
    const newer = Number(client[1]) * 100 + Number(client[2]) > Number(data[1]) * 100 + Number(data[2]);
    this.state.data.clientPatch = `${client[1]}.${client[2]}`;
    if (!newer) return;
    await this.refreshData(true);
    const now = this.meta.tierList?.patch_prefix;
    if (now && !now.startsWith(this.state.data.clientPatch)) {
      this.log('warning', `Ton client est en ${this.state.data.clientPatch}, arammeta n'a encore que le ${now} : les stats Mayhem peuvent être décalées quelques jours.`);
    } else this.log('success', `Données Mayhem mises à jour pour le patch ${now}`);
    this.emitIfChanged();
  }

  async importHistory(): Promise<{ added: number }> {
    if (!this.lcu || !this.puuid || this.importing) return { added: 0 };
    this.importing = true;
    try {
      const added = await this.history.importFromClient(this.lcu, this.puuid);
      if (added) this.log('success', `${added} partie(s) ARAM/Mayhem ajoutée(s) à ton historique`);
      const filled = await this.history.enrich(this.lcu, this.puuid);
      if (filled) this.log('info', `Détails (items, dégâts, compos) récupérés pour ${filled} partie(s) déjà enregistrée(s)`);
      this.refreshStats();
      return { added };
    } finally {
      this.importing = false;
      this.emitIfChanged();
    }
  }

  private async readQueue(): Promise<void> {
    const s = await this.lcu!.get<{ gameData?: { gameId?: number; queue?: { id?: number; gameMode?: string } } }>('/lol-gameflow/v1/session');
    if (s?.gameData?.gameId) this.pendingGameId = s.gameData.gameId; // repli si l'écran de fin ne donne pas l'ID
    const q = s?.gameData?.queue;
    this.state.queueId = q?.id ?? null;
    this.state.mode = modeOf(q?.id, q?.gameMode);
  }

  // ---------------------------------------------------------------- champ select

  /** Coéquipiers de ce champ select déjà croisés dans tes parties (par Riot ID, si le client le donne). */
  private matesOf(session: RawSession): ChampSelectView['mates'] {
    const ids = session.myTeam
      .filter((p) => p.cellId !== session.localPlayerCellId && p.gameName)
      .map((p) => `${p.gameName}${p.tagLine ? `#${p.tagLine}` : ''}`);
    if (!ids.length) return [];
    const out: NonNullable<ChampSelectView['mates']> = [];
    for (const name of ids) {
      const games = this.history.games.filter((g) => g.allyNames?.includes(name));
      if (games.length) out.push({ name, games: games.length, wins: games.filter((g) => g.win).length });
    }
    return out;
  }

  private probedSelect = false;

  /** Une capture du champ select par session (sans identifiants), pour vérifier les champs du client. */
  private async probeChampSelect(session: RawSession): Promise<void> {
    if (!this.opts.probeDir || this.probedSelect) return;
    this.probedSelect = true;
    const scrub = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(scrub)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /puuid|summonerId|accountId|gameName|tagLine|name/i.test(k) ? (x ? '·présent·' : x) : scrub(x)]))
          : v;
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(this.opts.probeDir, { recursive: true });
      await writeFile(join(this.opts.probeDir, `champselect-${Date.now()}.json`), JSON.stringify(scrub(session), null, 1));
    } catch {
      /* diagnostic seulement */
    }
  }

  private async handleChampSelect(): Promise<void> {
    const lcu = this.lcu!;
    const session = await lcu.get<RawSession>('/lol-champ-select/v1/session');
    if (!session?.myTeam) return;
    const subset = await readSubset(lcu);
    const parsed = parseSession(session, subset);
    const mode = this.state.mode as Mode;
    if (mode === 'sr') {
      // Faille : le champion survolé compte déjà (runes et build prêts avant le verrouillage)
      const meCell = session.myTeam.find((p) => p.cellId === session.localPlayerCellId);
      if (!parsed.myChampionId && meCell?.championPickIntent) parsed.myChampionId = meCell.championPickIntent;
      parsed.candidates = [];
    }
    this.parsed = parsed;
    if (parsed.myChampionId) this.myChampionId = parsed.myChampionId;
    const tier = this.meta.tierList;

    const candidates = scoreCandidates(
      { mode, allies: parsed.allies, candidates: parsed.candidates, personal: this.history.personal(null), names: this.champName },
      tier,
    );
    const mastery = await this.masteries();
    for (const c of candidates) {
      c.balance = this.balanceOf(c.championId, mode);
      const ch = this.changeText(c.championId);
      if (ch && Date.now() - ch.at < 14 * 86_400_000) c.balanceChange = ch.text;
      c.mastery = mastery.size ? (mastery.get(c.championId) ?? null) : undefined; // undefined : maîtrise illisible
    }
    void this.probeChampSelect(session);
    const view: ChampSelectView = {
      mates: this.matesOf(session),
      mode,
      queueId: this.state.queueId ?? 0,
      myChampionId: parsed.myChampionId,
      myChampionName: parsed.myChampionId ? this.champName(parsed.myChampionId) : '',
      allies: parsed.allies.map((id) => ({ championId: id, name: this.champName(id) })),
      candidates,
      cardsOpen: parsed.cards.length > 0,
      needs: needsOf(parsed.allies, tier),
      sr: mode === 'sr' ? await this.srSelect(session, parsed.myChampionId) : null,
      dataNote: mode === 'sr' ? null : !tier
        ? 'Données globales indisponibles : classement basé uniquement sur tes stats perso.'
        : mode === 'aram'
          ? 'ARAM classique : les winrates globaux viennent de Mayhem (arammeta) et comptent pour moitié.'
          : null,
    };
    this.state.champSelect = view;
    // Journal : ce que l'app conseillait et ce que tu avais, pour relire le champ select après la partie
    const top = [...candidates].sort((a, b) => b.score - a.score)[0];
    const cur = candidates.find((c) => c.source === 'current');
    let line = `Champ select : conseil ${top ? `${top.name} (${top.source}, ${top.score.toFixed(1)} pts, ${top.winrate != null ? Math.round(top.winrate * 100) : '?'} %)` : '—'} · tu as ${cur ? `${cur.name} (${cur.score.toFixed(1)} pts, ${cur.winrate != null ? Math.round(cur.winrate * 100) : '?'} %)` : '—'}`;
    const sr = view.sr;
    if (sr) {
      line = `Champ select Faille (${sr.queueLabel}, ${sr.laneLabel ?? 'rôle inconnu'}) : ${sr.me ? `${sr.me.name} ${Math.round(sr.me.winRate * 100)} % sur ${sr.me.games}` : 'pas de champion'}${sr.matchup ? ` · contre ${sr.matchup.opponent.name} ${Math.round(sr.matchup.myWinRate * 100)} % (${sr.matchup.verdict}, ${sr.matchup.games} parties)` : ''}${sr.counterPicks.length ? ` · counters : ${sr.counterPicks.map((c) => `${c.name} ${Math.round(c.winRate * 100)} %`).join(', ')}` : ''}`;
    }
    if (line !== this.lastSelectLine) {
      this.lastSelectLine = line;
      this.persistLog('jeu', line);
    }

    if (mode === 'mayhem' && parsed.myChampionId) this.state.augments = await this.augmentPanel(parsed.myChampionId);
    if (parsed.myChampionId) this.state.build = await this.buildPanel(parsed.myChampionId, mode);

    // Import auto quand ton champion est stable sur 2 relevés (évite de spammer pendant les échanges)
    const id = parsed.myChampionId;
    if (id && id === this.lastChampion.id) this.lastChampion.seen++;
    else this.lastChampion = { id, seen: 1 };
    if (id && this.lastChampion.seen >= 2 && this.loadoutDoneFor !== id) {
      this.loadoutDoneFor = id;
      void this.applyLoadout(false);
    }
  }

  async pickChampion(championId: number): Promise<{ ok: boolean; message: string }> {
    const lcu = this.lcu;
    const p = this.parsed;
    if (!lcu || !p) return { ok: false, message: 'Pas de champ select en cours' };
    const name = this.champName(championId);
    let ok = false;
    if (p.cards.includes(championId) && p.pickAction) ok = await pickCard(lcu, p.pickAction, championId);
    else if (p.bench.includes(championId)) ok = await takeFromBench(lcu, championId);
    else if (p.trades.has(championId)) {
      const t = await requestTradeDetailed(lcu, p.trades.get(championId)!);
      ok = t.ok;
      const message = ok ? `Échange proposé pour ${name} : ton allié doit accepter` : `Le client a refusé l’échange pour ${name} (${t.reason}) : l’allié a peut-être déjà échangé ou verrouillé`;
      this.log(ok ? 'success' : 'warning', message);
      await this.tick();
      return { ok, message };
    } else return { ok: false, message: `${name} n’est plus disponible` };
    const message = ok ? `${name} sélectionné` : `Le client a refusé ${name}`;
    this.log(ok ? 'success' : 'warning', message);
    await this.tick();
    return { ok, message };
  }

  async applyLoadout(manual = true): Promise<{ ok: boolean; message: string }> {
    const lcu = this.lcu;
    const id = this.parsed?.myChampionId;
    const mode = this.state.mode;
    if (!lcu || !id || !mode) return { ok: false, message: 'Aucun champion sélectionné' };
    const s = this.state.settings;
    const name = this.champName(id);
    const detail = mode === 'mayhem' ? await this.meta.detail(id) : null;
    const lane = mode === 'sr' ? await this.myLane(id) : null;
    const sra = lane ? await this.srAnalysis(id, lane) : null;
    const done: string[] = [];
    const failed: string[] = [];
    const run = async (enabled: boolean, label: string, fn: () => Promise<string>) => {
      if (!enabled) return;
      try {
        done.push(await fn());
      } catch (e) {
        failed.push(`${label} : ${(e as Error).message}`);
      }
    };
    if (mode === 'sr') {
      const page = sra?.runes && sra.runes.perks.length === 9 ? { primary: sra.runes.primary, sub: sra.runes.sub, perks: sra.runes.perks } : null;
      await run(manual || s.autoRunes, 'runes', () => applyRunes(lcu, id, page, SR_MAP_ID, lane ? LCU_POS[lane] : 'NONE'));
      if (sra?.spells.length === 2) await run(manual || s.autoSpells, 'sorts', () => applySpells(lcu, [sra.spells[0], sra.spells[1]]));
    } else {
      await run(manual || s.autoRunes, 'runes', () => applyRunes(lcu, id));
      await run(manual || s.autoSpells, 'sorts', () => applySpells(lcu, bestSpells(detail)));
    }
    await run(mode === 'mayhem' && s.autoItemSet, 'item set', () => applyItemSet(lcu, id, name, detail));
    if (done.length) this.log('success', `${name} : ${done.join(', ')}`);
    for (const f of failed) this.log('warning', `${name} — ${f}`);
    this.emitIfChanged();
    return { ok: failed.length === 0, message: [...done, ...failed].join(' · ') || 'Rien à importer (options désactivées)' };
  }

  // ---------------------------------------------------------------- en partie

  private async handleInGame(): Promise<void> {
    let id = this.myChampionId;
    if (!id && this.puuid) {
      // App lancée en cours de partie : la session de jeu du client indique le champion de chaque joueur.
      const gs = await this.lcu!.get<{ gameData?: { playerChampionSelections?: { puuid?: string; championId?: number }[] } }>('/lol-gameflow/v1/session');
      id = gs?.gameData?.playerChampionSelections?.find((p) => p.puuid === this.puuid)?.championId ?? 0;
      if (id) this.myChampionId = id;
    }
    if (!id) {
      // App lancée en cours de partie : on retrouve ton champion via l'API Live Client.
      const live = this.opts.live;
      const me = await liveClient<{ riotId?: string; summonerName?: string }>('activeplayer', live?.port, live?.host);
      const players = await liveClient<{ riotId?: string; summonerName?: string; rawChampionName?: string }[]>('playerlist', live?.port, live?.host);
      const mine = players?.find((p) => (me?.riotId && p.riotId === me.riotId) || (me?.summonerName && p.summonerName === me.summonerName));
      const alias = mine?.rawChampionName?.split('_').pop();
      if (alias) id = this.game.championIdByAlias(alias) ?? 0;
      this.myChampionId = id;
    }
    if (!id) return;
    if (this.state.mode === 'mayhem') this.state.augments = await this.augmentPanel(id);
    this.state.build = await this.buildPanel(id, this.state.mode as Mode);
    const snap = await this.liveSnapshot();
    this.state.counters = await this.counterPanel(id, snap);
    this.state.nextBuy = await this.nextBuyPanel(snap);
  }

  /**
   * Item achetable en ARAM / Mayhem ? arammeta liste tous les items finis vus en Mayhem (itemLut) : un item absent
   * (Guardian Angel, Chemtech Putrifier…) n'existe pas sur l'Abîme hurlant. Les items de base d'un item transformé
   * (Manamune) et les bottes passent aussi.
   */
  private inMayhem(id: number): boolean {
    const lut = this.meta.tierList?.itemLut;
    if (!lut || Object.keys(lut).length < 50) return true;
    if (lut[String(id)]) return true;
    if (Object.entries(TRANSFORMS).some(([to, from]) => from === id && lut[to])) return true;
    return this.game.isBoots(id);
  }

  /**
   * Une lecture de l'API Live Client par tick (officielle, lecture seule) : toi, et les 10 joueurs avec items et
   * scores. Ton joueur : par Riot ID, sinon par nom de jeu, sinon par champion (avant, un échec ici laissait tes
   * items vides et le prochain achat restait bloqué sur un item déjà acheté).
   */
  private async liveSnapshot(): Promise<LiveSnap | null> {
    const live = this.opts.live;
    const me = await liveClient<LiveMe>('activeplayer', live?.port, live?.host);
    if (!me) return null;
    const players = (await liveClient<LivePlayer[]>('playerlist', live?.port, live?.host)) ?? [];
    const champOf = (p: LivePlayer) => this.game.championIdByAlias(p.rawChampionName?.split('_').pop() ?? '') ?? this.game.championIdByAlias(p.championName ?? '') ?? 0;
    const mine =
      players.find((p) => me.riotId && p.riotId === me.riotId) ??
      players.find((p) => me.riotIdGameName && p.riotIdGameName === me.riotIdGameName) ??
      players.find((p) => me.summonerName && p.summonerName === me.summonerName) ??
      (this.myChampionId ? players.find((p) => champOf(p) === this.myChampionId) : undefined) ??
      null;
    return { me, players, mine, champOf };
  }

  /**
   * Diagnostic : à chaque choix d'augment, ce que l'API Live Client dit de toi (sans identifiants). But : savoir si
   * elle finit par lister tes augments en cours de partie, ce qui permettrait de tenir compte de ceux déjà pris.
   */
  private probedRounds = new Set<string>();
  private async probeRound(snap: LiveSnap): Promise<void> {
    const dir = this.opts.probeDir;
    const round = this.state.augRound;
    if (!dir || !round) return;
    const key = `${this.myChampionId}-${round}`;
    if (this.probedRounds.has(key)) return;
    this.probedRounds.add(key);
    const scrub = (o: object | null) => (o ? { ...o, riotId: '·', riotIdGameName: '·', riotIdTagLine: '·', summonerName: '·' } : null);
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `liveclient-choix${round}-${Date.now()}.json`), JSON.stringify({ round, activeplayer: scrub(snap.me as object), me: scrub(snap.mine as object | null) }, null, 1));
    } catch {
      /* diagnostic seulement */
    }
  }

  /** Or et items du joueur via l'API Live Client du jeu (officielle, lecture seule). */
  private async nextBuyPanel(snap: LiveSnap | null): Promise<NextBuyPanel | null> {
    const b = this.state.build;
    if (!b) return null;
    const me = snap?.me;
    if (!me || typeof me.currentGold !== 'number') return this.state.nextBuy;
    if (typeof me.level === 'number' && this.state.mode !== 'sr') this.state.augRound = 1 + Number(me.level >= 7) + Number(me.level >= 11) + Number(me.level >= 15);
    void this.probeRound(snap);
    const owned = (snap.mine?.items ?? []).map((i) => i.itemID);
    const buyable = (id: number) => this.game.specialRecipe(id) || TRANSFORMS[id] || id;
    const becomes = new Map<number, string>();
    for (const c of b.cores) for (const x of [...c.core, ...c.options]) if (buyable(x.id) !== x.id) becomes.set(buyable(x.id), x.name);
    const named = (t: { title: string; champions: { name: string }[] }) => (t.champions.length ? `${t.title} (${t.champions.slice(0, 3).map((c) => c.name).join(', ')})` : t.title);
    const r = nextBuys({
      owned,
      gold: me.currentGold,
      // Items qui se transforment (Muramana, Fimbulwinter, Seraph) : on conseille ce qui s'achète (Manamune…)
      cores: b.cores.map((c) => ({ core: c.core.map((x) => buyable(x.id)), options: c.options.map((o) => ({ id: buyable(o.id), winrate: o.winrate, games: o.games })) })),
      boots: b.boots.map((x) => x.id),
      counters: (this.state.counters?.threats ?? []).map((t) => ({ title: named(t), items: t.items.map((x) => buyable(x.id)), urgent: t.urgent })),
      allBoots: new Set([...b.boots.map((x) => x.id), 1001, 3006, 3009, 3020, 3047, 3111, 3158, 3008, ...[...this.game.items.keys()].filter((id) => this.game.isBoots(id))]),
      price: (id) => this.game.itemPrice(id) ?? this.meta.tierList?.itemLut?.[String(id)]?.p ?? null,
      components: (id) => this.game.components(id),
      specialRecipe: (id) => this.game.specialRecipe(id),
      complete: this.game.items.size ? (id) => this.game.isComplete(id) : undefined,
      ...(this.state.mode === 'sr' ? { labels: { core: 'cœur du build OP.GG', option: 'item suivant' } } : {}),
      skipped: new Set([...this.skippedBuys].filter(([, n]) => n >= 2).map(([id]) => id)),
    });
    const itemOf = (id: number) => this.game.item(id, this.meta.tierList?.itemLut?.[String(id)]?.e);
    // Télémétrie locale : chaque item fini acheté, comparé au conseil affiché juste avant
    const isDone = (id: number) => (this.game.items.size ? this.game.isComplete(id) : (this.game.itemPrice(id) ?? 0) >= 2000);
    if (this.lastBuy) {
      for (const id of owned)
        if (!this.lastBuy.owned.includes(id) && isDone(id)) {
          const reco = this.lastBuy.reco;
          const followed = reco === id || reco === this.game.specialRecipe(id);
          if (reco != null && !followed && !this.game.isBoots(id)) this.skippedBuys.set(reco, (this.skippedBuys.get(reco) ?? 0) + 1);
          this.usage.add({ type: 'item_bought', at: Date.now(), championId: this.myChampionId, id, reco, plan: this.lastBuy.plan, followed: reco === id || reco === this.game.specialRecipe(id) });
        }
    }
    // Ton build en cours, pour rapprocher les augments proposés de ce que tu construis vraiment
    const planned = r.plan.filter((x) => !x.owned).map((x) => x.id);
    const cat = (id: number) => this.game.categories(id);
    const known = (id: number) => cat(id).length > 0 && !this.game.isBoots(id);
    this.buildFit = { profile: buildProfile(owned, planned, cat), seen: owned.filter((id) => isDone(id) && known(id)).length + planned.filter(known).length };
    if (this.state.offered) {
      const o = this.state.offered;
      const fit = this.fitFor(o.ids, o.names);
      if (JSON.stringify(fit) !== JSON.stringify(o.fit)) this.state.offered = { ...o, fit };
    }
    const reco = r.rows[0]?.id ?? null;
    if (reco !== this.lastBuy?.reco && reco != null) this.persistLog('jeu', `Achat conseillé : ${itemOf(reco).name} (${r.rows[0].why}) · or ${Math.floor(me.currentGold)} · inventaire ${owned.map((i) => itemOf(i).name).join(', ') || 'vide'}`);
    this.lastBuy = { owned, reco, plan: r.rows.map((x) => x.id) };
    return {
      gold: Math.floor(me.currentGold),
      plan: r.plan.map((p) => ({ item: itemOf(p.id), owned: p.owned, ...(p.why ? { why: p.why } : {}) })),
      respawn: snap.mine?.isDead ? Math.ceil(snap.mine.respawnTimer ?? 0) : null,
      buildName: b.cores[r.coreIndex]?.name ?? null,
      buildInfo: b.cores[r.coreIndex]
        ? {
            winrate: b.cores[r.coreIndex].winrate,
            games: b.cores[r.coreIndex].games,
            count: b.cores.length,
            // ce qui a été ajouté au build pour leur équipe
            adapted: r.rows.filter((x) => x.why.startsWith('contre') || x.why.startsWith('bottes contre')).map((x) => this.game.item(x.id, this.meta.tierList?.itemLut?.[String(x.id)]?.e).name),
          }
        : null,
      rows: r.rows.map((x) => ({
        item: this.game.item(x.id, this.meta.tierList?.itemLut?.[String(x.id)]?.e),
        why: becomes.has(x.id) ? `${x.why} · devient ${becomes.get(x.id)} une fois chargé` : x.why,
        price: x.price,
        remaining: x.remaining,
        missing: Math.ceil(x.missing),
        ...(x.step ? { step: { item: this.game.item(x.step.id), price: x.step.price } } : {}),
      })),
    };
  }

  private probedGames = new Set<number>();
  private probedLive = new Set<number>();

  /** Côté jeu (API Live Client) : stats de partie et ton joueur — le headliner peut n'apparaître que là. */
  private async probeLive(gameId: number): Promise<void> {
    if (!this.opts.probeDir || !gameId || this.probedLive.has(gameId)) return;
    const live = this.opts.live;
    const stats = await liveClient('gamestats', live?.port, live?.host);
    if (!stats) return; // API pas encore prête : on réessaiera au tick suivant
    this.probedLive.add(gameId);
    const me = await liveClient<Record<string, unknown>>('activeplayer', live?.port, live?.host);
    const { mkdir, writeFile } = await import('node:fs/promises');
    try {
      await mkdir(this.opts.probeDir, { recursive: true });
      const safe = me ? { ...me, riotId: '·', riotIdGameName: '·', riotIdTagLine: '·', summonerName: '·' } : null;
      await writeFile(join(this.opts.probeDir, `liveclient-${gameId}.json`), JSON.stringify({ gamestats: stats, activeplayer: safe }, null, 1));
    } catch {
      /* diagnostic seulement */
    }
  }

  /**
   * Une fois par partie Mayhem : sauvegarde la session de jeu brute (sans identifiants) pour repérer les champs
   * des nouveautés (headliner du patch 26.21…). Lu par les sessions de développement, jamais envoyé ailleurs.
   */
  private async probeSession(raw: unknown, gameId: number): Promise<void> {
    if (!this.opts.probeDir || !gameId || this.probedGames.has(gameId)) return;
    this.probedGames.add(gameId);
    const scrub = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(scrub)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /puuid|summonerId|accountId|token|name/i.test(k) ? '·' : scrub(x)]))
          : v;
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(this.opts.probeDir, { recursive: true });
      await writeFile(join(this.opts.probeDir, `gameflow-session-${gameId}.json`), JSON.stringify(scrub(raw), null, 1));
    } catch {
      /* diagnostic seulement */
    }
  }

  /** Items situationnels contre l'équipe adverse (lue dans la session de jeu du client). */
  private async counterPanel(myId: number, snap: LiveSnap | null): Promise<CounterPanel | null> {
    if (!this.lcu || !this.puuid) return this.state.counters;
    const s = await this.lcu.get<{ gameData?: { gameId?: number; teamOne?: { puuid?: string; championId?: number }[]; teamTwo?: { puuid?: string; championId?: number }[] } }>(
      '/lol-gameflow/v1/session',
    );
    if (this.state.mode === 'mayhem') {
      void this.probeSession(s, s?.gameData?.gameId ?? 0);
      void this.probeLive(s?.gameData?.gameId ?? 0);
    }
    const enemies = enemiesFromSession(s?.gameData, this.puuid);
    if (!enemies.length) return this.state.counters;
    const one = s?.gameData?.teamOne ?? [];
    const two = s?.gameData?.teamTwo ?? [];
    const myTeam = one.some((p) => p.puuid === this.puuid) ? one : two;
    const allies = myTeam.filter((p) => p.puuid !== this.puuid).map((p) => p.championId ?? 0).filter((id) => id > 0);

    // En direct (API Live Client) : scores et items de chacun
    const live = new Map<number, LivePlayer>();
    for (const p of snap?.players ?? []) {
      const id = snap!.champOf(p);
      if (id) live.set(id, p);
    }
    const sc = (id: number) => live.get(id)?.scores;
    const weight = (id: number) => (sc(id) ? fedWeight(sc(id)!.kills ?? 0, sc(id)!.deaths ?? 0) : 1);
    const finished = (id: number) => (live.get(id)?.items ?? []).map((i) => i.itemID).filter((x) => (this.game.items.size ? this.game.isComplete(x) : (this.game.itemPrice(x) ?? 0) >= 2000));
    const laneView = this.state.mode === 'sr' ? await this.liveLane(myId, snap) : null;
    const gameKey = `${s?.gameData?.gameId ?? 0}-${myId}-${laneView?.opponent.id ?? 0}-${[...enemies, ...allies].map((id) => `${id}:${weight(id).toFixed(2)}:${finished(id).join('.')}`).join(',')}`;
    if (this.state.counters?.gameKey === gameKey) return this.state.counters;

    const cat = (i: number) => this.game.categories(i);
    // Profil corrigé par les items réellement achetés (ce que tu vois avec Tab)
    const comp = (id: number) => compFromItems(this.meta.champion(id)?.comp, finished(id), cat).comp;
    const built = (id: number) => compFromItems(this.meta.champion(id)?.comp, finished(id), cat).built;
    const role = buildRole(this.meta.champion(myId)?.comp);
    const base = enemyThreats(enemies.map((id) => ({ id, comp: comp(id), weight: weight(id) })), role);
    const member = (id: number) => ({ id, name: this.champName(id), comp: comp(id), items: finished(id), kills: sc(id)?.kills, deaths: sc(id)?.deaths });
    const read = readTeams(role, allies.map(member), enemies.map(member), base, cat, (i) => this.game.item(i).name);
    // Contre chaque menace : d'abord les items du build de TON champion qui y répondent (Death's Dance contre les
    // critiques sur Hecarim plutôt qu'un contre générique), puis les contres génériques
    const b = this.state.build;
    const tested = b ? [...b.cores.flatMap((c) => [...c.core.map((x) => ({ id: x.id, winrate: c.winrate })), ...c.options]), ...b.boots, ...(b.singles ?? [])] : [];
    const threats = [...base, ...read.extra]
      .map((t) => ({ ...t, items: (this.game.items.size ? counterItemsFor(t.key, t.items, tested, cat) : t.items).filter((i) => this.state.mode === 'sr' || this.inMayhem(i)) }))
      .filter((t) => t.items.length);
    const named = (id: number) => ({ id, name: this.champName(id) });
    const itemOf = (i: number) => this.game.item(i, this.meta.tierList?.itemLut?.[String(i)]?.e);
    const player = (id: number) => {
      const p = sc(id);
      return {
        ...named(id),
        dmg: damageKind(comp(id)),
        tags: [...(built(id) && built(id) !== damageKind(this.meta.champion(id)?.comp) ? [`construit ${built(id)}`] : []), ...championTags(comp(id))],
        ...(p ? { kda: `${p.kills ?? 0}/${p.deaths ?? 0}/${p.assists ?? 0}` } : {}),
        ...(p && weight(id) >= 1.6 ? { fed: `${p.kills ?? 0}/${p.deaths ?? 0}` } : {}),
        items: finished(id).map(itemOf),
      };
    };
    return {
      gameKey,
      role,
      enemies: enemies.map(player),
      allies: allies.map(player),
      threats: threats.map((t) => ({ ...t, champions: t.champions.map(named), items: t.items.map(itemOf) })),
      notes: read.notes,
      lane: laneView,
    };
  }

  /**
   * Pièges : augments pris dans au moins 4 % des parties du champion mais qui gagnent 3 points de moins que lui
   * (et au moins 300 parties pour que ce ne soit pas du bruit).
   */
  private trapsOf(championId: number, detail: ChampionDetail): (AugmentRow & { pick: number })[] {
    const champWr = this.meta.champion(championId)?.wr;
    if (champWr == null) return [];
    const mine = this.history.augmentRecord();
    return (detail.poolAugments ?? [])
      .filter((a) => a.pick >= 0.04 && a.g >= 300 && a.wr <= champWr - 0.03 && this.game.augmentExists(a.id))
      .sort((a, b) => b.pick - a.pick)
      .slice(0, 4)
      .map((a) => ({
        id: a.id,
        name: this.augName(a.id),
        icon: this.game.augmentIcon(a.id) ?? this.meta.augmentIconUrl(a.id),
        winrate: a.wr,
        lift: a.wr - champWr,
        games: a.g,
        personal: mine.get(a.id) ?? null,
        pick: a.pick,
      }));
  }

  /**
   * Winrate selon le moment du choix. Données du champion si assez de parties à ce choix (≥ 150), sinon winrate du
   * champion corrigé de l'effet moyen du moment pour cet augment (tous champions).
   */
  private roundsOf(id: number, wr: number, slots?: DetailRow['slots']): (number | null)[] {
    const g = this.meta.tierList?.augs[String(id)];
    return [0, 1, 2, 3].map((k) => {
      const own = slots?.[k];
      if (own && own.g >= 150) return shrink(own.wr, own.g, wr);
      const glob = g?.slots?.[k];
      if (glob && g?.lift != null && glob[0] >= 300) return Math.max(0, Math.min(1, wr + (glob[2] - g.lift)));
      return null;
    });
  }

  private poolByRarity(championId: number, detail: ChampionDetail): Record<Rarity, AugmentRow[]> {
    const champWr = this.meta.champion(championId)?.wr ?? 0.5;
    const mine = this.history.augmentRecord();
    const out = { kPrismatic: [], kGold: [], kSilver: [] } as Record<Rarity, AugmentRow[]>;
    const slotsByAug = new Map<number, DetailRow['slots']>();
    for (const side of [detail.top, detail.bot]) for (const rows of Object.values(side ?? {})) for (const r of rows ?? []) if (r.slots) slotsByAug.set(r.id, r.slots);
    for (const a of detail.poolAugments ?? []) {
      const rarity = this.meta.tierList?.augs[String(a.id)]?.rarity as Rarity | undefined;
      if (!rarity || !(rarity in out) || a.g < 100 || !this.game.augmentExists(a.id)) continue;
      out[rarity].push({
        id: a.id,
        name: this.augName(a.id),
        icon: this.game.augmentIcon(a.id) ?? this.meta.augmentIconUrl(a.id),
        // Winrate « rétréci » vers celui du champion selon le nombre de parties : un augment à 60 % sur 120 parties
        // ne doit pas passer devant un 56 % sur 5 000 (vraies parties du 28 oct. : conseils qui sautaient d'une carte
        // rare à l'autre à chaque reroll)
        winrate: shrink(a.wr, a.g, champWr),
        lift: shrink(a.wr, a.g, champWr) - champWr,
        games: a.g,
        personal: mine.get(a.id) ?? null,
        rounds: this.roundsOf(a.id, shrink(a.wr, a.g, champWr), slotsByAug.get(a.id)),
      });
    }
    for (const k of RARITIES) out[k].sort((x, y) => y.winrate - x.winrate);
    return out;
  }

  private async augmentPanel(championId: number): Promise<AugmentPanel | null> {
    if (this.panelCache.has(championId)) return this.panelCache.get(championId)!;
    if (!this.meta.tierList) return null;
    const detail = await this.meta.detail(championId);
    if (!detail) return null;
    const mine = this.history.augmentRecord();
    const row = (r: { id: number; wr: number; lift?: number; g: number; slots?: DetailRow['slots'] }): AugmentRow => ({
      id: r.id,
      name: this.augName(r.id),
      icon: this.game.augmentIcon(r.id) ?? this.meta.augmentIconUrl(r.id),
      winrate: r.wr,
      lift: r.lift ?? 0,
      games: r.g,
      personal: mine.get(r.id) ?? null,
      rounds: this.roundsOf(r.id, r.wr, r.slots),
    });
    const top = {} as AugmentPanel['top'];
    const avoid = {} as AugmentPanel['avoid'];
    for (const k of RARITIES) {
      const live = (r: { id: number }) => this.game.augmentExists(r.id); // retire les augments supprimés du jeu
      top[k] = (detail.top?.[k] ?? []).filter(live).slice(0, 6).map(row);
      avoid[k] = (detail.bot?.[k] ?? []).filter(live).slice(0, 3).map(row);
    }
    const panel: AugmentPanel = {
      championId,
      championName: this.champName(championId),
      patch: this.meta.tierList.patch_prefix,
      championWinrate: this.meta.champion(championId)?.wr ?? null,
      top,
      avoid,
      items: (detail.items?.top ?? []).slice(0, 3).map((i) => ({ name: this.game.itemComboName(i.slug, i.name_en), winrate: i.wr, games: i.g })),
      types: detail.augTypes
        ? {
            good: (detail.augTypes.top ?? []).filter((t) => t.lift > 0.005 && t.g >= 500).slice(0, 3).map((t) => ({ name: t.name_en, lift: t.lift, games: t.g })),
            bad: (detail.augTypes.bot ?? []).filter((t) => t.lift < -0.005 && t.g >= 500).slice(0, 3).map((t) => ({ name: t.name_en, lift: t.lift, games: t.g })),
          }
        : undefined,
      traps: this.trapsOf(championId, detail),
      all: this.poolByRarity(championId, detail),
      myTraps: [...mine.entries()]
        .filter(([id, r]) => r.games >= 4 && (r.wins + 2.5) / (r.games + 5) <= 0.4 && !this.game.isHeadlinerMarker(id))
        .sort((a, b) => a[1].wins / a[1].games - b[1].wins / b[1].games)
        .slice(0, 5)
        .map(([id, r]) => ({ id, name: this.augName(id), icon: this.game.augmentIcon(id) ?? this.meta.augmentIconUrl(id), games: r.games, wins: r.wins })),
    };
    this.panelCache.set(championId, panel);
    return panel;
  }

  // ---------------------------------------------------------------- build

  private async buildPanel(championId: number, mode: Mode): Promise<BuildPanel | null> {
    if (mode === 'sr') return this.srBuildPanel(championId);
    const key = `${championId}-${mode}`;
    if (this.buildCache.has(key)) return this.buildCache.get(key)!;
    const lcu = this.lcu;
    if (!lcu && mode !== 'mayhem') return null;
    const detail = mode === 'mayhem' ? await this.meta.detail(championId) : null;
    // Sans client (exploration), pas de runes recommandées mais le reste du build Mayhem reste valable
    const rec = lcu ? await recommendedPage(lcu, championId) : null;
    const enName = (id: number) => this.meta.tierList?.itemLut?.[String(id)]?.e;
    const stat = (id: number, wr: number, g: number): StatItem => ({ ...this.game.item(id, enName(id)), winrate: wr, games: g });

    const cores = (detail?.itemClusters?.groups ?? [])
      .filter((c) => c.g >= 300)
      .sort((a, b) => b.wr * Math.min(1, b.g / 1500) - a.wr * Math.min(1, a.g / 1500))
      .slice(0, 3)
      .map((c) => ({
        name: c.name_en,
        core: c.core.map((x) => this.game.item(x.id, enName(x.id))),
        options: (c.options ?? []).filter((o) => o.g >= 100).sort((a, b) => b.wr - a.wr).slice(0, 4).map((o) => stat(o.id, o.wr, o.g)),
        winrate: c.wr,
        games: c.g,
      }));
    const spellsFromMeta = (detail?.spells?.top ?? []).slice(0, 2).map((sp) => ({
      items: sp.slug.split('+').map((id) => this.game.spell(Number(id))),
      winrate: sp.wr,
      games: sp.g,
    }));
    const panel: BuildPanel = {
      championId,
      championName: this.champName(championId),
      mode,
      runes: rec
        ? { primary: this.game.perkStyle(rec.primary), secondary: this.game.perkStyle(rec.sub), perks: rec.perks.slice(0, 6).map((id) => this.game.perk(id)) }
        : null,
      spells: spellsFromMeta.length ? spellsFromMeta : [{ items: [this.game.spell(4), this.game.spell(32)], winrate: 0, games: 0 }],
      cores,
      boots: (detail?.boots?.top ?? []).slice(0, 3).map((b) => stat(Number(b.slug), b.wr, b.g)),
      singles: (() => {
        const shown = new Set(cores.flatMap((c) => [...c.core.map((x) => x.id), ...c.options.map((o) => o.id)]));
        const boots = new Set((detail?.boots?.top ?? []).map((b) => Number(b.slug)));
        return (detail?.singleItems?.top ?? [])
          .map((r) => ({ id: Number(r.slug), wr: r.wr, g: r.g }))
          .filter((r) => r.id && r.g >= 300 && !shown.has(r.id) && !boots.has(r.id))
          .slice(0, 6)
          .map((r) => stat(r.id, r.wr, r.g));
      })(),
      balance: this.balanceOf(championId, mode),
      note:
        mode === 'aram'
          ? 'ARAM classique : runes recommandées par le client. Les items et winrates détaillés n’existent que pour Mayhem (arammeta).'
          : null,
    };
    if (lcu) this.buildCache.set(key, panel); // sans client : pas de runes, on ne garde pas en cache
    return panel;
  }

  // ---------------------------------------------------------------- Faille de l'invocateur (OP.GG)

  /** Analyse OP.GG (champion × rôle × file), gardée en mémoire ; un échec est réessayé après 1 min. */
  private srAnalysis(id: number, lane: Lane, modeOverride?: ReturnType<typeof opggModeOf>): Promise<OpggAnalysis | null> {
    const mode = modeOverride ?? opggModeOf(this.state.queueId);
    const key = `${id}|${lane}|${mode}`;
    let p = this.srCache.get(key);
    if (!p) {
      const name = this.meta.champion(id)?.name_en || this.champName(id);
      p = this.opggData.analysis(name, this.game.championAlias(id), lane, mode).catch(() => null);
      this.srCache.set(key, p);
      void p.then((a) => {
        if (!a) setTimeout(() => this.srCache.delete(key), 60_000);
      });
    }
    return p;
  }

  /** Ton rôle : celui donné par le client, sinon le rôle principal du champion (partie sans rôles). */
  private async myLane(id: number): Promise<Lane | null> {
    if (this.lane) return this.lane;
    return this.opggData.mainLane(this.meta.champion(id)?.name_en || this.champName(id));
  }

  private matchupView(opp: number, m: { myWinRate: number; games: number }, guessed: boolean): MatchupView {
    const { lo, hi } = wilson(m.myWinRate, m.games);
    return { opponent: { id: opp, name: this.champName(opp) }, myWinRate: m.myWinRate, games: m.games, lo, hi, verdict: verdictOf(m.myWinRate, m.games), guessed };
  }

  /** Champ select Faille : ton rôle, ton champion, l'adversaire de lane probable et les counter-picks fiables. */
  private async srSelect(session: RawSession, myId: number): Promise<SrSelect> {
    const meCell = session.myTeam.find((p) => p.cellId === session.localPlayerCellId);
    const assigned = laneOf(meCell?.assignedPosition);
    if (assigned) this.lane = assigned;
    const lane = myId ? await this.myLane(myId) : assigned;
    const queueLabel = QUEUE_LABEL[this.state.queueId ?? 0] ?? 'Faille';
    const out: SrSelect = { lane, laneLabel: lane ? LANE_LABEL[lane] : null, queueLabel, me: null, matchup: null, counterPicks: [], dangers: [], note: null };
    if (!lane) {
      out.note = 'Rôle inconnu : choisis ou survole un champion pour voir ses stats.';
      return out;
    }
    if (!assigned) out.note = 'Partie sans rôles : rôle principal du champion supposé.';
    const locked = !!meCell?.championId && !(session.actions ?? []).flat().some((a) => a.actorCellId === session.localPlayerCellId && a.type === 'pick' && !a.completed);
    const mine = myId ? await this.srAnalysis(myId, lane) : null;
    if (myId && mine) {
      const { lo, hi } = wilson(mine.winRate, mine.games);
      out.me = { id: myId, name: this.champName(myId), locked, winRate: mine.winRate, games: mine.games, lo, hi, tier: mine.tier };
    } else if (myId) out.note = 'OP.GG injoignable ou pas de données pour ce champion dans ce rôle.';

    // Adversaires : picks verrouillés visibles ; leur rôle n'est pas donné par le client, on le devine (OP.GG)
    const enemies = (session.theirTeam ?? []).map((p) => p.championId).filter((id): id is number => !!id && id > 0);
    if (enemies.length) {
      const lanes = await this.opggData.guessLanes(enemies.map((id) => ({ id, name: this.meta.champion(id)?.name_en || this.champName(id) })));
      const opp = enemies.find((id) => lanes.get(id) === lane);
      if (opp) {
        const theirs = await this.srAnalysis(opp, lane);
        const m = matchupFrom(mine, theirs, myId, opp);
        if (m) out.matchup = this.matchupView(opp, m, true);
        else out.matchup = { opponent: { id: opp, name: this.champName(opp) }, myWinRate: 0.5, games: 0, lo: 0, hi: 1, verdict: 'incertain', guessed: true };
        if (!locked) {
          const taken = new Set([...session.myTeam.map((p) => p.championId), ...enemies, ...(session.actions ?? []).flat().filter((a) => a.type === 'ban' && a.completed).map((a) => a.championId)]);
          const mastery = await this.masteries();
          out.counterPicks = counterPicksFrom(theirs, (wr, n) => wilson(wr, n).lo, 6)
            .filter((c) => !taken.has(c.id))
            .slice(0, 4)
            .map((c) => ({ ...c, name: this.champName(c.id, c.name), mastery: mastery.get(c.id)?.level ?? null }));
        }
      }
      // Ennemis (tous rôles) qui battent ton champion d'après OP.GG
      out.dangers = (mine?.losesTo ?? []).filter((c) => enemies.includes(c.id) && c.id !== opp && c.games >= 200).map((c) => ({ id: c.id, name: this.champName(c.id, c.name), myWinRate: c.myWinRate, games: c.games }));
    }
    return out;
  }

  /** Build Faille depuis OP.GG : départ, cœur, 4e/5e/6e items classés par borne basse de confiance, bottes, runes, sorts, compétences. */
  private async srBuildPanel(id: number, laneOverride?: Lane, modeOverride?: ReturnType<typeof opggModeOf>): Promise<BuildPanel | null> {
    const lane = laneOverride ?? (await this.myLane(id));
    const mode = modeOverride ?? opggModeOf(this.state.queueId);
    const key = `${id}-sr-${lane}-${mode}`;
    if (this.buildCache.has(key)) return this.buildCache.get(key)!;
    const a = lane ? await this.srAnalysis(id, lane, mode) : null;
    const opName = new Map<number, string>();
    for (const x of [a?.core, a?.boots, a?.starter, ...(a?.fourth ?? []), ...(a?.fifth ?? []), ...(a?.sixth ?? [])]) x?.ids.forEach((id, k) => x.names?.[k] && opName.set(id, x.names[k]));
    const itemOf = (i: number) => this.game.item(i, opName.get(i) ?? this.meta.tierList?.itemLut?.[String(i)]?.e);
    const stat = (x: { ids: number[]; winrate: number; games: number }): StatItem => ({ ...itemOf(x.ids[0]), winrate: x.winrate, games: x.games });
    const core = a?.core?.ids ?? [];
    const opts = new Map<number, StatItem>();
    for (const x of [...(a?.fourth ?? []), ...(a?.fifth ?? []), ...(a?.sixth ?? [])]) {
      const i = x.ids[0];
      if (!i || x.games < 50 || core.includes(i)) continue;
      const prev = opts.get(i);
      if (!prev || prev.games < x.games) opts.set(i, stat(x));
    }
    const options = [...opts.values()].sort((p, q) => wilson(q.winrate, q.games).lo - wilson(p.winrate, p.games).lo).slice(0, 5);
    const rec = !a?.runes && this.lcu ? await recommendedPage(this.lcu, id, SR_MAP_ID, lane ? LCU_POS[lane] : 'NONE') : null;
    const runes = a?.runes ?? (rec ? { ...rec, winrate: 0, games: 0 } : null);
    const queue = modeOverride ? 'Classée' : (QUEUE_LABEL[this.state.queueId ?? 0] ?? 'Faille');
    const panel: BuildPanel = {
      championId: id,
      championName: this.champName(id),
      mode: 'sr',
      lane: lane ? LANE_LABEL[lane] : null,
      source: a ? 'OP.GG' : 'client',
      runes: runes
        ? {
            primary: this.game.perkStyle(runes.primary, a?.runes?.primaryName),
            secondary: this.game.perkStyle(runes.sub, a?.runes?.subName),
            perks: runes.perks.slice(0, 6).map((p, i) => this.game.perk(p, a?.runes?.names?.[i])),
          }
        : null,
      spells: a?.spells.length === 2 ? [{ items: a.spells.map((sp) => this.game.spell(sp)), winrate: 0, games: 0 }] : [],
      cores: core.length ? [{ name: 'OP.GG', core: core.map(itemOf), options, winrate: a!.core!.winrate, games: a!.core!.games }] : [],
      boots: a?.boots ? [stat(a.boots)] : [],
      starter: (a?.starter?.ids ?? []).map(itemOf),
      skills: a && a.skillMax.length ? { order: a.skillOrder, max: a.skillMax } : null,
      matchups: a
        ? {
            beats: a.beats.filter((c) => c.games >= 200).slice(0, 5).map((c) => ({ id: c.id, name: this.champName(c.id, c.name), winrate: c.myWinRate, games: c.games, ...wilson(c.myWinRate, c.games) })),
            losesTo: a.losesTo.filter((c) => c.games >= 200).slice(0, 5).map((c) => ({ id: c.id, name: this.champName(c.id, c.name), winrate: c.myWinRate, games: c.games, ...wilson(c.myWinRate, c.games) })),
          }
        : undefined,
      balance: [],
      note: a
        ? `${queue} · ${lane ? LANE_LABEL[lane] : ''} : stats OP.GG du patch (${a.games.toLocaleString('fr-FR')} parties, ${Math.round(a.winRate * 100)} % de victoires).`
        : 'OP.GG injoignable : runes recommandées du client, pas de build détaillé.',
    };
    if (a) this.buildCache.set(key, panel);
    return panel;
  }

  /** En partie (Faille) : ton rôle et ton adversaire direct d'après l'API Live Client (champ « position »). */
  private async liveLane(myId: number, snap: LiveSnap | null): Promise<MatchupView | null> {
    const mine = snap?.mine;
    const lane = laneOf(mine?.position);
    if (!snap || !mine || !lane) return this.state.counters?.lane ?? null;
    this.lane = lane;
    const opp = snap.players.find((p) => p.team !== mine.team && laneOf(p.position) === lane);
    const oppId = opp ? snap.champOf(opp) : 0;
    if (!oppId) return null;
    const [a, b] = await Promise.all([this.srAnalysis(myId, lane), this.srAnalysis(oppId, lane)]);
    const m = matchupFrom(a, b, myId, oppId);
    return m ? this.matchupView(oppId, m, false) : { opponent: { id: oppId, name: this.champName(oppId) }, myWinRate: 0.5, games: 0, lo: 0, hi: 1, verdict: 'incertain', guessed: false };
  }

  // ---------------------------------------------------------------- fin de partie

  /** true quand la partie est enregistrée (ou déjà présente). */
  private async recordFinishedGame(): Promise<boolean> {
    const lcu = this.lcu;
    if (!lcu || !this.puuid) return false;
    const eog = await lcu.get<{ gameId?: number }>('/lol-end-of-game/v1/eog-stats-block');
    const gameId = eog?.gameId || this.pendingGameId;
    if (!gameId) return false;
    if (this.history.has(gameId)) return true;
    const detail = await lcu.get<Parameters<typeof parseGame>[0]>(`/lol-match-history/v1/games/${gameId}`);
    const game = detail ? parseGame(detail, this.puuid) : null;
    if (!game) return false;
    if (this.state.headliner && game.mode === 'mayhem') game.headliner = this.state.headliner.key;
    await this.history.add(game);
    this.recordPicks(gameId, game.augments, game.win);
    this.log('success', `Partie enregistrée : ${this.champName(game.championId)} (${game.win ? 'victoire' : 'défaite'}, ${game.augments.length} augments)`);
    this.refreshStats();
    return true;
  }

  // ---------------------------------------------------------------- cartes lues à l'écran

  /** Augments que les cartes peuvent proposer (pool du champion en partie Mayhem), null s'il n'y a rien à lire. */
  cardPool(): CardCandidate[] | null {
    const p = this.state.augments;
    if (!p || this.state.mode !== 'mayhem' || (this.state.phase !== 'InProgress' && Date.now() > this.previewUntil)) return null;
    const out = new Map<number, CardCandidate>();
    for (const r of ['kPrismatic', 'kGold', 'kSilver'] as Rarity[]) {
      const rows = p.all?.[r]?.length ? p.all[r] : [...p.top[r], ...p.avoid[r]];
      for (const a of rows) out.set(a.id, { id: a.id, name: a.name, rarity: r });
    }
    // Tous les augments du jeu aussi : une carte rarement prise sur ce champion doit être reconnue quand même
    // (1re vraie partie : 2e et 3e choix jamais lus en entier à cause de ça)
    for (const c of this.allAugmentsPool()) if (!out.has(c.id)) out.set(c.id, c);
    return out.size ? [...out.values()] : null;
  }

  /** Pour un test hors partie : tous les augments connus (client + arammeta), rareté approximative. */
  allAugmentsPool(): CardCandidate[] {
    const out = new Map<number, CardCandidate>();
    const rar = (r?: string): Rarity => (/prism/i.test(r ?? '') ? 'kPrismatic' : /gold/i.test(r ?? '') ? 'kGold' : 'kSilver');
    for (const [id, a] of Object.entries(this.meta.tierList?.augs ?? {})) out.set(Number(id), { id: Number(id), name: this.augName(Number(id)), rarity: rar((a as { rarity?: string }).rarity) });
    for (const id of this.game.augments.keys()) if (!out.has(id)) out.set(id, { id, name: this.augName(id), rarity: 'kSilver' });
    return [...out.values()].filter((c) => !c.name.startsWith('#'));
  }

  /** Meilleure carte parmi celles lues, d'après le winrate au moment du choix (comme l'affichage). */
  bestOffered(ids: number[]): number | null {
    const p = this.state.augments;
    if (!p) return null;
    const round = this.state.augRound;
    const rows = new Map<number, AugmentRow>();
    for (const r of ['kPrismatic', 'kGold', 'kSilver'] as Rarity[]) for (const a of [...(p.all?.[r] ?? []), ...p.top[r], ...p.avoid[r]]) rows.set(a.id, a);
    const at = (a: AugmentRow) => (round ? a.rounds?.[round - 1] : null) ?? a.winrate;
    for (const a of this.state.offered?.extra ?? []) if (!rows.has(a.id)) rows.set(a.id, a);
    const known = ids.map((id) => rows.get(id)).filter((a): a is AugmentRow => !!a);
    const fit = (a: AugmentRow) => this.state.offered?.fit?.[a.id]?.delta ?? 0;
    return known.length ? known.sort((a, b) => at(b) + fit(b) - (at(a) + fit(a)))[0].id : null;
  }

  /** Diagnostic : schéma des outils OP.GG et une réponse type, copiés dans probe-output/ (pour lire les données Faille). */
  private async probeOpgg(): Promise<void> {
    const ok = await this.opgg.connect();
    if (!ok) {
      this.persistLog('warning', `OP.GG : ${this.opgg.lastError ?? 'aucun outil'}`);
      return;
    }
    this.persistLog('info', `OP.GG : ${this.opgg.tools.length} outils (${this.opgg.tools.map((t) => t.name).join(', ')})`);
    for (const [tool, want, file] of [
      ['lol_get_champion_analysis', { champion: 'Ahri', position: 'mid', mode: 'ranked' }, 'opgg-sample-analysis.json'],
      ['lol_get_lane_matchup_guide', { champion: 'Ahri', position: 'mid', mode: 'ranked' }, 'opgg-sample-matchup.json'],
      ['lol_get_champion_analysis', { champion: 'Ahri', position: 'none', mode: 'aram' }, 'opgg-sample-aram.json'],
    ] as const) {
      const t = this.opgg.tool(tool);
      if (!t) continue;
      const args = buildArgs(t, want);
      try {
        const r = await this.opgg.call(tool, args);
        await this.opgg.dump(file, { args, result: r });
      } catch (e) {
        await this.opgg.dump(file, { args, error: (e as Error).message });
      }
    }
    await this.probeLaneMeta();
  }

  /** Diagnostic Faille : la méta des rôles telle que l'app la lit (sert à deviner le rôle des ennemis). */
  private async probeLaneMeta(): Promise<void> {
    const meta = await this.opggData.laneMeta();
    const sample = [...meta.entries()].slice(0, 8);
    await this.opgg.dump('opgg-sample-lanemeta.json', { champions: meta.size, sample });
    this.persistLog('info', `OP.GG méta des rôles : ${meta.size} champions lus`);
  }

  /** Correction de chaque carte selon ton build en cours (voir augfit.ts). */
  private fitFor(ids: number[], names: string[]): Record<number, { delta: number; why: string | null; good: boolean }> | undefined {
    const b = this.buildFit;
    if (!b || !this.augInfo.size) return undefined;
    const out: Record<number, { delta: number; why: string | null; good: boolean }> = {};
    ids.forEach((id, i) => {
      const f = fitOf(this.augInfo.tags(names[i] ?? this.augName(id)), b.profile, b.seen);
      if (f.delta) out[id] = f;
    });
    return Object.keys(out).length ? out : undefined;
  }

  /** Cartes absentes des données du champion : winrate estimé avec l'effet moyen de l'augment (tous champions). */
  private estimatedRows(ids: number[]): AugmentRow[] {
    const p = this.state.augments;
    if (!p) return [];
    const inPanel = new Set<number>();
    for (const r of ['kPrismatic', 'kGold', 'kSilver'] as Rarity[]) for (const a of [...(p.all?.[r] ?? []), ...p.top[r], ...p.avoid[r]]) inPanel.add(a.id);
    const champWr = p.championWinrate ?? 0.5;
    const out: AugmentRow[] = [];
    for (const id of ids) {
      if (inPanel.has(id)) continue;
      const g = this.meta.tierList?.augs[String(id)];
      if (!g) continue;
      const lift = g.lift ?? 0;
      out.push({
        id,
        name: this.augName(id),
        icon: this.game.augmentIcon(id) ?? this.meta.augmentIconUrl(id),
        winrate: champWr + lift,
        lift,
        games: (g.slots ?? []).reduce((n, x) => n + (x?.[0] ?? 0), 0),
        personal: this.history.augmentRecord().get(id) ?? null,
        rounds: (g.slots ?? []).map((x) => (x ? champWr + x[2] : null)),
        estimated: true,
      });
    }
    return out;
  }

  /** Résultat d'une lecture d'écran (null = plus de cartes à l'écran). */
  setOffered(read: CardRead | null): void {
    if (!read) {
      if (!this.state.offered) return;
      this.state.offered = null;
      this.emitIfChanged();
      return;
    }
    for (const text of read.misses)
      if (!this.missesThisGame.has(text) && this.missesThisGame.size < 30) {
        this.missesThisGame.add(text);
        this.usage.add({ type: 'ocr_miss', at: Date.now(), text });
      }
    const prev = this.state.offered;
    if (prev && prev.ids.join() === read.ids.join() && prev.unsure === read.unsure) return;
    const extra = this.estimatedRows(read.ids);
    this.state.offered = { ids: read.ids, names: read.names, rarity: read.rarity, unsure: read.unsure, at: Date.now(), ...(extra.length ? { extra } : {}) };
    this.state.offered.fit = this.fitFor(read.ids, read.names);
    const best = read.unsure ? null : this.bestOffered(read.ids);
    const round = this.state.augRound;
    this.persistLog('jeu', `Cartes lues (choix ${round ?? '?'}) : ${read.names.join(' · ')}${read.unsure ? ` — ${read.unsure}` : best != null ? ` → conseil : ${this.augName(best)}` : ''}`);
    this.usage.add({ type: 'cards_seen', at: Date.now(), championId: this.state.augments?.championId ?? 0, round, ids: read.ids, best, unsure: !!read.unsure });
    // Un même niveau peut proposer 2 choix (augment normal puis carte headliner, ex. Pentakill HEAVY / POWER / THRASH) :
    // on les garde séparément, sinon le 2e écrasait le 1er (vu en vraie partie le 28 oct.)
    const kind = read.ids.every((id) => id >= 3170 && id < 3200) ? 'headliner' : 'augment';
    const hl = read.unsure ? null : headlinerFromCards(read.ids);
    if (hl) this.setHeadliner(hl, 'cartes');
    if (!read.unsure) this.offersThisGame.set(`${round ?? 0}:${kind}`, { round, ids: read.ids, best });
    this.emitIfChanged();
  }

  /** Headliner reconnu en partie (bannière lue à l'écran, ou cartes propres au headliner). Le premier reconnu reste. */
  setHeadliner(h: HeadlinerInfo, source: 'écran' | 'cartes', text?: string): void {
    if (this.state.headliner) return;
    this.state.headliner = { key: h.key, name: h.name, source, tips: h.tips };
    this.persistLog('jeu', `Headliner : ${h.name} (${source === 'écran' ? `lu à l'écran : « ${text ?? h.name} »` : 'd’après les cartes'})`);
    this.usage.add({ type: 'headliner_seen', at: Date.now(), key: h.key, source, ...(text ? { text } : {}) });
    this.emitIfChanged();
  }

  /** Fin de partie : pour chaque choix lu à l'écran, quel augment a été pris, et était-ce la recommandation ? */
  private recordPicks(gameId: number, augments: number[], win: boolean): void {
    for (const o of this.offersThisGame.values()) {
      const picked = o.ids.find((id) => augments.includes(id)) ?? null;
      this.usage.add({ type: 'card_picked', at: Date.now(), gameId, round: o.round, ids: o.ids, best: o.best, picked, followed: picked != null && picked === o.best, win });
    }
    this.offersThisGame.clear();
  }

  // ---------------------------------------------------------------- réglages

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    this.state.settings = { ...this.state.settings, ...patch };
    await saveSettings(this.settingsFile, this.state.settings);
    this.emitIfChanged();
    return this.state.settings;
  }
}

/** Moyenne bayésienne : un winrate sur peu de parties est ramené vers `prior` (400 parties « virtuelles »). */
export function shrink(wr: number, games: number, prior: number, k = 400): number {
  return (wr * games + prior * k) / (games + k);
}

interface LiveMe {
  currentGold?: number;
  level?: number;
  riotId?: string;
  riotIdGameName?: string;
  summonerName?: string;
}

interface LivePlayer {
  riotId?: string;
  riotIdGameName?: string;
  summonerName?: string;
  championName?: string;
  rawChampionName?: string;
  team?: string;
  /** Faille : TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY (vide en ARAM). */
  position?: string;
  isDead?: boolean;
  respawnTimer?: number;
  items?: { itemID: number }[];
  scores?: { kills?: number; deaths?: number; assists?: number };
}

const LCU_POS: Record<Lane, string> = { top: 'TOP', jungle: 'JUNGLE', mid: 'MIDDLE', adc: 'BOTTOM', support: 'UTILITY' };

interface LiveSnap {
  me: LiveMe;
  players: LivePlayer[];
  mine: LivePlayer | null;
  champOf: (p: LivePlayer) => number;
}
