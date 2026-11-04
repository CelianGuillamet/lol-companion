// Orchestration : suit le client League, construit l'état affiché et exécute les actions.
// Aucune dépendance à Electron : testable avec un faux client (voir test/engine.test.ts).

import { EventEmitter } from 'node:events';
import { GameDataAcquisitionEngine } from './intelligence/acquisition';
import { RealTimeIntelligenceStore } from './intelligence/store';
import { join } from 'node:path';
import { LcuClient, discoverCredentials, liveClient, type Credentials } from './lcu';
import { Arammeta, type ChampionDetail, type DetailRow } from './arammeta';
import { GameData } from './gamedata';
import { isRemake, played } from './remake';
import { endFlags, History, parseGame, participantStats, hasFullDetail, type RawGame } from './history';
import { scoreCandidates, needsOf, fillAdvice } from './advisor';
import { parseSession, readSubset, pickCard, hoverBanAction, takeFromBench, requestTradeDetailed, type ParsedChampSelect, type RawSession } from './champselect';
import { parseCollection, poolReport, type Collection, type PoolReport } from './pool';
import { applyRunes, applySpells, applyItemSet, bestSpells, recommendedPage } from './loadout';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import { isLeagueClassic, modeOf, opggModeOf, QUEUE_LABEL, SR_MAP_ID } from './modes';
import { wilson, verdictOf } from './stats';
import { Balance, badges } from './balance';
import { Combos, comboNote, protectCombos } from './combos';
import { augmentChange, championChange, patchNumber } from './patchchanges';
import { ANVIL_ID, ANVIL_NAME, ANVIL_PRICE, anvilAdvice, anvilPick, anvilsBought } from './anvil';
import { ELIXIR_IDS, ELIXIR_PRICE, ELIXIRS, elixirAdvice, elixirBought, elixirRole, elixirUntil } from './elixir';
import { BAG_SLOTS, expandOwned, itemSlot, nextBuys, optionsForSlot, TRANSFORMS, type BuildCore , optionLabel } from './nextbuy';
import { nextSkill, pointsOffPlan, skillLevels, spentPoints, type LiveAbilities, type SkillLevels } from './skills';
import { gameOfBuy, itemValues, reviewBuys, type BuyReview } from './buyreview';
import { buildRole, championTags, compFromItems, counterItemsFor, damageKind, damageSplit, enemiesFromSession, enemyThreats, fedWeight, readTeams } from './counters';
import { rerollLostOf, reviewChoice, reviewGame, type GameReview, type ReviewCard } from './review';
import type { BalanceBadge } from './balance';
import type { CardCandidate, CardRead } from './cardmatch';
import { Usage, followStat, type ItemBought, type UsageEvent } from './usage';
import { cardRarity, headlinerByKey, headlinerFromCards, historyHeadliner, isSkinText, NEXT_RARITY, rarityJump, type HeadlinerInfo } from './headliner';
import { drawFromSeen, ghostCards, offerChoice, offerKind, seenBefore, settleOffers, type OfferSlot } from './offers';
import { adviseReroll, measuredCards, reviewDraw, type RerollAdvice } from './reroll';
import { AugmentInfo, buildProfile, isMelee } from './augfit';
import { fitWithAlternatives, openCores, preferredCore, type TakenAugment } from './buildchoice';
import { hasHaste, newCardHint } from './cardhints';
import { boundFit, boundItems, boundTarget, legendaryHint, noSellItems, questDone, questItems, unknownBound } from './itembound';
import { banOptions } from './bans';
import { CooldownData, ddragonCandidates } from './cooldowns';
import { goldGap, probePlayers, riftStage, sampleSlot, type GapInput } from './goldgap';
import { laneCs } from './lanecs';
import { hasSmite, LANE_MAP_END_SEC, laneMapPanel, pairLanes, type LanePair, type LanePlayer, type LaneRate } from './lanemap';
import type { AppUpdate } from './appversion';
import type { GoldGapPanel, LaneCsPanel, LaneMapPanel, SwiftplaySlot } from './types';
import { buildGuide, guideCounters, guideRate, readGuide, type GuideData } from './laneguide';
import { compareLoadout, nothingBought, readSlots, SLOT_QUEUES, slotFit, swiftplayStarter, type LobbySlot } from './quickplay';
import { type OpggMode, OpggClient, OpggData, buildArgs, laneOf, LANE_LABEL, matchupFrom, normChamp, counterPicksFrom, dangersFrom, type Lane, type OpggAnalysis } from './opgg';
import type { Candidate, LaneGuide, MatchupView, SrBans, SrSelect, AppState, CounterPanel, NextBuyPanel, AugmentPanel, AugmentRow, BuildPanel, ChampSelectView, ComboNote, PatchChange, GameDetail, HistoryEntry, HistoryGame, ItemStat, LogEntry, Mode, Rarity, Settings, SkillNext, StatItem } from './types';

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
  combos?: Combos;
  pollMs?: number;
  /** Tests : téléchargement des fichiers Data Dragon (cooldowns). */
  ddragonFetcher?: (url: string) => Promise<string>;
}

const RARITIES: Rarity[] = ['kPrismatic', 'kGold', 'kSilver'];

/** Tirage en cours : suivi des relances, et de quoi les noter après la partie. */
interface DrawTrack {
  round: number | null;
  rarity: Rarity | null;
  ids: number[];
  rolled: Set<number>;
  /** Cartes d'un cran au-dessus déjà notées (`noteRarityJump`). */
  jumps: Set<number>;
  /** Une relance de la partie n'a pas changé de rareté. */
  stayed: boolean;
  seen: Set<number>;
  /** Cartes vues aux tirages précédents de la partie. */
  before: Set<number>;
  steps: ReviewCard[][];
  pool?: number[];
  upgraded?: number[] | null;
}

export class Engine extends EventEmitter {
  state: AppState;
  private cooldowns: CooldownData;
  private lcu: LcuClient | null = null;
  private meta: Arammeta;
  private balance: Balance;
  private combos: Combos;
  private game = new GameData();
  private readonly intelligenceStore = new RealTimeIntelligenceStore();
  private readonly acquisition: GameDataAcquisitionEngine;
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
  /** Guides de matchup OP.GG (clé moi|lui|rôle|court) ; `null` = rien de lisible, réessayé après 1 min en cas d'échec. */
  private guides = new Map<string, LaneGuide | null>();
  private guideCaptures = 0;
  private guessedOpp: { key: string; id: number } | null = null;
  /** Rôles donnés au salon ou au champ select : Swiftplay ne les confirme pas forcément en partie. */
  private allyLanes = new Map<number, Lane>();
  /** Winrates de matchup du guide OP.GG, clé `moi|lui|rôle`. */
  private laneRates = new Map<string, LaneRate | null>();
  /** Matchups complets d'un champion dans un rôle, par partie : clé `id|rôle`, `null` tant que la réponse n'est pas là. */
  private roleGuides = new Map<string, GuideData | null>();
  private picksSeen = new Set<string>();
  private laneMapKey = '';
  private lanePairs: LanePair[] | null = null;
  /** Ton build en cours : profil (critiques, AP…) et nombre d'items pris en compte. */
  private buildFit: { profile: ReturnType<typeof buildProfile>; alternatives: ReturnType<typeof buildProfile>[]; seen: number; owned: Set<number>; planned: Set<number>; legendary: string[] | null } | null = null;
  /** Items qu'une carte supposée prise interdit de vendre (Ultra Hydra). */
  private noSell: number[] = [];
  /** Build changé à cause d'un augment supposé pris, pour `build_lean` en fin de partie. */
  private leanThisGame: { from: string; to: string; items: number[]; augments: number[]; bought: boolean } | null = null;
  private leanCore: number | null = null;
  /** Augments liés à un item supposés pris cette partie (carte conseillée), pour `item_bound` en fin de partie. */
  private boundThisGame = new Map<number, { item: number; bought: boolean }>();
  /** Items de quête vus dans ton inventaire cette partie, par augment : convertis, ils en disparaissent. */
  private questSeen = new Map<number, Set<number>>();
  /** Items de quête finie, à ne plus conseiller. */
  private questGone: number[] = [];
  /** Départ affiché, jusqu'au 1er achat. */
  private starterShown: { advised: number[]; swapped: boolean } | null = null;
  /** Dernières cartes lues par choix d'augment pendant la partie en cours (pour savoir si tu as suivi la reco). */
  /** Tirage en cours, pour suivre les cartes déjà relancées. */
  private draw: DrawTrack | null = null;
  private unknownBoundSeen = new Set<string>();
  private offersThisGame = new Map<string, OfferSlot & { best: number | null; cards: ReviewCard[]; draw?: DrawTrack | null }>();
  private missesThisGame = new Set<string>();
  private backfilling = false;
  private headlinerText: string | null = null;
  /** Achats : inventaire et conseil au tick précédent (pour savoir si tu as suivi le conseil d'achat). */
  private lastBuy: { owned: number[]; reco: number | null; plan: number[]; why?: string } | null = null;
  private lastResale: string | null = null;
  /** Fin de l'effet de l'élixir bu (ms), et ce qu'il faut pour voir le prochain achat : l'API ne dit rien d'un élixir. */
  private elixirEnd: number | null = null;
  private elixirTick: { gold: number; owned: string; id: number } | null = null;
  private elixirNoted = false;
  private anvilTick: { gold: number; owned: string } | null = null;
  private anvilNoted = false;
  private anvilCount = 0;
  private buysThisGame: ItemBought[] = [];
  private lastCandidates: Candidate[] = [];
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
    this.acquisition = new GameDataAcquisitionEngine(opts.live);
    this.meta = opts.arammeta ?? new Arammeta(join(opts.dataDir, 'cache'));
    this.balance = opts.balance ?? new Balance(join(opts.dataDir, 'cache'));
    this.combos = opts.combos ?? new Combos(join(opts.dataDir, 'cache'));
    this.history = new History(join(opts.dataDir, 'history.json'));
    this.settingsFile = join(opts.dataDir, 'settings.json');
    this.augInfo = new AugmentInfo(join(opts.dataDir, 'cache'), opts.augInfoFetcher);
    this.opgg = new OpggClient(join(opts.dataDir, 'cache', 'opgg'), opts.probeDir ?? null);
    this.opggData = new OpggData(this.opgg);
    this.usage = new Usage(opts.probeDir ? join(opts.probeDir, 'usage.json') : null);
    this.cooldowns = new CooldownData(join(opts.dataDir, 'cache'), opts.ddragonFetcher);
    this.discover = opts.discover ?? discoverCredentials;
    this.state = {
      connection: 'searching',
      intelligence: null,
      phase: null,
      mode: null,
      queueId: null,
      summonerName: null,
      data: { patch: null, loadedAt: null, error: null },
      champSelect: null,
      swiftplay: null,
      augments: null,
      build: null,
      counters: null,
      nextBuy: null,
      skillNext: null,
      augRound: null,
      liveLevel: null,
      stats: { total: 0, recorded: 0, byMode: { aram: { games: 0, wins: 0 }, mayhem: { games: 0, wins: 0 }, sr: { games: 0, wins: 0 } }, champions: [], augments: [], recent: [], vsEnemies: [], withAllies: [], duos: [] },
      settings: { ...DEFAULT_SETTINGS },
      log: [],
    };
  }

  async start(): Promise<void> {
    this.state.settings = await loadSettings(this.settingsFile);
    await this.history.load();
    if (this.history.corruptBackup) this.log('warning', `Historique illisible : copie gardée dans ${this.history.corruptBackup}, l'app repart d'un historique vide.`);
    await this.usage.load();
    this.refreshStats();
    void this.refreshData(false);
    if (this.opts.probeDir) void this.probeOpgg();
    this.runLoop();
  }

  /**
   * Boucle de lecture du client. Chaque démarrage a son numéro : un tick encore en cours au moment de `stop()` (ou
   * d'un redémarrage) ne reprogramme rien en se terminant, sinon la boucle repartait après l'arrêt.
   */
  private loopGen = 0;
  private runLoop(): void {
    const gen = ++this.loopGen;
    const loop = async () => {
      await this.tick();
      if (gen !== this.loopGen) return; // arrêtée (ou relancée) pendant le tick
      this.timer = setTimeout(loop, this.opts.pollMs ?? 1000);
    };
    void loop();
  }

  stop(): void {
    this.loopGen++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** La boucle tourne-t-elle (démarrée et pas arrêtée) ? Pour les tests et le diagnostic. */
  get looping(): boolean {
    return this.timer !== null;
  }

  /** Message dans le journal (utilisé aussi par la fenêtre Electron). */
  note(level: LogEntry['level'], text: string): void {
    this.log(level, text);
    this.emitIfChanged();
  }

  /** Version en cours, une fois au lancement, notée pour savoir quel code a joué une partie. */
  setAppVersion(version: string): void {
    this.state.appVersion = version;
    this.usage.add({ type: 'app_start', at: Date.now(), version });
    this.log('info', `Version ${version} lancée`);
    this.emitIfChanged();
  }

  setUpdate(update: AppUpdate | null): void {
    this.state.update = update;
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

  /** Copie du texte des augments dans probe-output/ : les sessions n'ont pas accès au cache, hors du dossier du projet. */
  private async mirrorAugmentTexts(): Promise<void> {
    if (!this.opts.probeDir || !this.augInfo.size) return;
    const { copyFile, mkdir } = await import('node:fs/promises');
    await mkdir(this.opts.probeDir, { recursive: true }).catch(() => undefined);
    await copyFile(this.augInfo.file, join(this.opts.probeDir, 'wiki-mayhem-augments.lua')).catch(() => undefined);
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
      this.state.data = { patch: t.patch_prefix, loadedAt: this.meta.loadedAt, error: null, clientPatch: this.state.data.clientPatch, opggPatch: this.state.data.opggPatch };
      if (t.ddv) this.game.ddragonVersion = t.ddv;
      this.panelCache.clear();
      void this.backfillReviews();
      this.buildCache.clear();
      this.refreshStats(); // noms des champions / augments (client fermé : seule source = arammeta)
    } catch (e) {
      this.state.data = { ...this.state.data, error: `Données arammeta indisponibles : ${(e as Error).message}` };
    }
    await this.balance.load(force).catch(() => undefined);
    await this.augInfo.load(force).catch(() => undefined);
    await this.mirrorAugmentTexts();
    await this.combos.load(force).catch(() => undefined);
    this.panelCache.clear(); // les avis sont dans le panneau
    this.state.data.combos = `${this.combos.source === 'site' ? 'arammayhem.com' : 'instantané embarqué du 3 nov. (site injoignable)'}, ${this.combos.rows.length} combos`;
    this.state.data.balance =
      this.balance.source === 'wiki' ? `wiki LoL, ${this.balance.size} champions` : `instantané embarqué patch 16.21 (wiki injoignable)`;
    this.emitIfChanged();
  }

  private masteryCache: { at: number; map: Map<number, { level: number; points: number }> } | null = null;
  private collectionCache: { at: number; col: Collection | null } | null = null;
  private collectionSeen = false;
  private poolExtra = new Set<number>();

  /** Ta maîtrise par champion (LCU), relue au plus toutes les 10 minutes. */
  private async masteries(): Promise<Map<number, { level: number; points: number }>> {
    if (this.masteryCache && Date.now() - this.masteryCache.at < 600_000) return this.masteryCache.map;
    const map = new Map<number, { level: number; points: number }>();
    const rows = await this.lcu?.get<{ championId: number; championLevel: number; championPoints: number }[]>('/lol-champion-mastery/v1/local-player/champion-mastery');
    if (Array.isArray(rows)) for (const r of rows) map.set(r.championId, { level: r.championLevel, points: r.championPoints });
    this.masteryCache = { at: Date.now(), map };
    return map;
  }

  /** Ta collection (10 min de cache), `null` si le client ne la donne pas : rien n'est alors filtré. */
  private async collection(): Promise<Collection | null> {
    if (this.collectionCache && Date.now() - this.collectionCache.at < 600_000) return this.collectionCache.col;
    const col = parseCollection(await this.lcu?.get<unknown>('/lol-champions/v1/owned-champions-minimal'));
    this.collectionCache = { at: Date.now(), col };
    if (col && !this.collectionSeen) {
      this.collectionSeen = true;
      const total = this.listChampions().length;
      this.persistLog('jeu', `Collection : ${col.owned.size} champions à toi, ${col.free.size} gratuits, sur ${total}`);
      this.usage.add({ type: 'pool_seen', at: Date.now(), owned: col.owned.size, free: col.free.size, total });
    }
    return col;
  }

  /** Quels champions débloquer pour de meilleures cartes en ARAM / Mayhem. `null` : client fermé ou pas de stats globales. */
  async poolReport(): Promise<PoolReport | null> {
    if (!this.meta.tierList) return null;
    const col = await this.collection();
    return col ? poolReport(col, this.listChampions()) : null;
  }

  /**
   * Retire du banc ce que tu ne peux pas prendre. Le wiki dit la rotation des 4 dernières semaines tirable aussi, ce
   * que l'endpoint ne montre pas : un champion qu'on t'a vraiment proposé compte donc comme tien jusqu'à la fin.
   */
  private async dropUnreachable(parsed: ParsedChampSelect): Promise<string[]> {
    const col = await this.collection();
    if (!col) return [];
    const has = (id: number) => col.owned.has(id) || col.free.has(id) || this.poolExtra.has(id);
    for (const id of [...parsed.cards, parsed.myChampionId]) {
      if (!id || has(id)) continue;
      this.poolExtra.add(id);
      this.persistLog('jeu', `Collection : ${this.champName(id)} proposé hors de ta collection lue`);
      this.usage.add({ type: 'pool_outside', at: Date.now(), championId: id });
    }
    const out = parsed.candidates.filter((c) => c.source === 'bench' && !has(c.championId)).map((c) => c.championId);
    parsed.candidates = parsed.candidates.filter((c) => !out.includes(c.championId));
    return out.map((id) => this.champName(id));
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

  /** Nom de champion (client ou OP.GG, en anglais) → id. */
  private championIdByName(): (name: string) => number | undefined {
    const byName = new Map<string, number>();
    const key = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [id, c] of this.game.champions) {
      byName.set(key(c.name), id);
      byName.set(key(c.alias), id);
    }
    for (const [id, m] of Object.entries(this.meta.tierList?.champs ?? {})) if (m.name_en) byName.set(key(m.name_en), Number(id));
    return (name) => byName.get(key(name));
  }

  /**
   * Tier list Faille d'un rôle (OP.GG, patch en cours, classée) : champions joués au moins 5 % du temps dans ce
   * rôle, avec le palier OP.GG (1 = le plus fort), le winrate et le nombre de parties.
   */
  async laneTier(lane: string): Promise<{ id: number; name: string; winrate: number; games: number; tier: number | null; roleRate: number }[]> {
    const l = laneOf(lane);
    if (!l) return [];
    const meta = await this.opggData.laneMeta();
    const idOf = this.championIdByName();
    const out: { id: number; name: string; winrate: number; games: number; tier: number | null; roleRate: number }[] = [];
    for (const rows of meta.values())
      for (const r of rows) {
        if (r.lane !== l || r.roleRate < 0.05) continue;
        const id = idOf(r.champion) ?? 0;
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
      headliner: historyHeadliner(g, this.headlinerOf(g.augments), this.rarityJumps(g)),
      augmentIcons: g.augments.filter((id) => !this.game.isHeadlinerMarker(id)).map((id) => ({ id, name: this.augName(id), icon: this.game.augmentIcon(id) ?? this.meta.augmentIconUrl(id) })),
      itemIcons: (g.items ?? []).map((id) => this.game.item(id)),
    }));
  }

  /** Tirages de la revue d'une partie où une carte a un cran d'avance : la trace de Command Line, bannière ratée ou pas. */
  private rarityJumps(g: HistoryGame): number {
    return (g.review?.choices ?? []).filter((c) => rarityJump(c.cards.map((k) => this.rarityOfCard(k.id, k.name))) != null).length;
  }

  private rarityOfCard(id: number, name: string): Rarity | null {
    return cardRarity(this.meta.tierList?.augs[String(id)]?.rarity as Rarity | undefined, this.augInfo.tier(name));
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
        await this.handleClientUnavailable();
        return;
      }
      this.lcu = new LcuClient(creds);
    }
    const r = await this.lcu.request<string>('GET', '/lol-gameflow/v1/gameflow-phase');
    if (r.status === 0 || r.status === 401 || r.status === 403) {
      this.lcu = null;
      await this.handleClientUnavailable();
      return;
    }
    const reconnected = this.state.connection !== 'connected';
    if (reconnected) await this.onConnected();
    const phase = typeof r.data === 'string' ? r.data : 'None';
    const changed = reconnected || phase !== this.state.phase;
    this.state.phase = phase;

    if (changed && ['Lobby', 'Matchmaking', 'ReadyCheck', 'ChampSelect', 'InProgress', 'GameStart', 'Reconnect'].includes(phase)) {
      await this.readQueue();
    }

    if (phase === 'ReadyCheck') await this.maybeAccept();
    else this.acceptedCheck = false;

    await this.swiftplayPanel(phase);
    if (phase !== 'ChampSelect') this.selectSkipped = false;

    if (phase === 'ChampSelect' && this.state.mode) {
      this.recordedGame = false;
      this.recordAttempts = 0;
      this.recordStartedAt = 0;
      this.offersThisGame.clear();
      this.boundThisGame.clear();
      this.questSeen.clear();
      this.questGone = [];
      this.starterShown = null;
      this.leanThisGame = null;
      this.leanCore = null;
      this.draw = null;
      this.missesThisGame.clear();
      this.state.headliner = null;
      this.lastBuy = null;
      this.buysThisGame = [];
      this.deferredThisGame.clear();
      this.skippedBuys.clear();
      this.probedRounds.clear();
      this.liveRange = 0;
      this.liveCard = null;
      this.state.goldGap = null;
      this.goldSamples.clear();
      this.state.laneCs = null;
      this.csSamples.clear();
      this.state.laneMap = null;
      this.laneMapKey = '';
      this.lanePairs = null;
      this.lastGameTime = null;
      this.elixirEnd = null;
      this.elixirTick = null;
      this.elixirNoted = false;
      this.anvilTick = null;
      this.anvilNoted = false;
      this.anvilCount = 0;
      await this.handleChampSelect();
    } else if (phase !== 'ChampSelect') {
      this.probedSelect = false;
      this.state.champSelect = null;
      this.parsed = null;
    }

    if (['InProgress', 'GameStart', 'Reconnect'].includes(phase) && !this.leagueClassic) {
      this.state.intelligence = this.intelligenceStore.update(await this.acquisition.poll(), {
        sessionId: this.pendingGameId ? String(this.pendingGameId) : null,
        championId: (alias) => this.game.championIdByAlias(alias),
      });
    } else {
      this.intelligenceStore.reset();
      this.state.intelligence = null;
    }

    if ((phase === 'InProgress' || phase === 'GameStart' || phase === 'Reconnect') && this.state.mode) {
      await this.handleInGame();
    }

    if (phase !== 'InProgress' && phase !== 'Reconnect') {
      this.readSeq++; // une lecture d'écran commencée avant ne concerne plus rien
      if (this.state.offered) this.state.offered = null;
    }

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
      this.state.skillNext = null;
      this.skillTrack = null;
      this.state.goldGap = null;
      this.state.laneCs = null;
      this.state.laneMap = null;
      this.state.augRound = null;
      this.state.liveLevel = null;
      this.state.headliner = null;
      this.myChampionId = 0;
      this.lane = null;
      this.allyLanes.clear();
      this.roleGuides.clear();
      this.picksSeen.clear();
      this.laneMapKey = '';
      this.lanePairs = null;
      this.loadoutDoneFor = 0;
      this.lastChampion = { id: 0, seen: 0 };
    }
  }

  private setDisconnected(): void {
    this.state.intelligence = null;
    this.state.headliner = null;
    this.state.augRound = null;
    this.state.offered = null;
    this.readSeq++;
    this.state.player = null;
    if (this.state.connection === 'connected') this.log('info', 'Client League fermé');
    this.state.connection = 'searching';
    this.state.phase = null;
    this.state.mode = null;
    this.state.queueId = null;
    this.myChampionId = 0;
    this.lane = null;
    this.state.champSelect = null;
    this.state.augments = null;
    this.state.build = null;
    this.state.counters = null;
    this.state.nextBuy = null;
    this.state.skillNext = null;
    this.state.goldGap = null;
    this.state.laneCs = null;
    this.state.laneMap = null;
  }

  /** Le serveur du jeu peut rester accessible pendant une reconnexion du client LCU. */
  private async handleClientUnavailable(): Promise<void> {
    this.setDisconnected();
    const result = await this.acquisition.poll();
    if (result.snapshot) {
      this.state.intelligence = this.intelligenceStore.update(result, {
        championId: (alias) => this.game.championIdByAlias(alias),
      });
      this.state.phase = 'InProgress';
    } else {
      this.intelligenceStore.reset();
    }
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
    void this.importHistory().finally(() => this.backfillReviews());
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

  /** Partie League Classic en cours : ni stats, ni lecture (Riot, voir `isLeagueClassic`). */
  private leagueClassic = false;

  private async readQueue(): Promise<void> {
    const s = await this.lcu!.get<{ gameData?: { gameId?: number; queue?: { id?: number; gameMode?: string; description?: string; name?: string } } }>('/lol-gameflow/v1/session');
    if (s?.gameData?.gameId) this.pendingGameId = s.gameData.gameId; // repli si l'écran de fin ne donne pas l'ID
    const q = s?.gameData?.queue;
    this.state.queueId = q?.id ?? null;
    const label = q?.description || q?.name;
    this.state.mode = modeOf(q?.id, q?.gameMode, label);
    const classic = isLeagueClassic(label);
    if (classic && !this.leagueClassic) this.log('info', 'League Classic : rien à afficher ici, Riot demande que ces parties restent sans stats.');
    this.leagueClassic = classic;
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
      const games = played(this.history.games).filter((g) => g.allyNames?.includes(name));
      if (games.length) out.push({ name, games: games.length, wins: games.filter((g) => g.win).length });
    }
    return out;
  }

  private probedSelect = false;
  /** Session de champ select sans choix (Swiftplay). */
  private selectSkipped = false;

  /** Une capture du champ select par session (sans identifiants), pour vérifier les champs du client. */
  private async probeChampSelect(session: RawSession): Promise<void> {
    if (!this.opts.probeDir || this.probedSelect) return;
    this.probedSelect = true;
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(this.opts.probeDir, { recursive: true });
      await writeFile(join(this.opts.probeDir, `champselect-${Date.now()}.json`), JSON.stringify(scrub(session), null, 1));
    } catch {
      /* diagnostic seulement */
    }
  }

  // ---------------------------------------------------------------- salon Swiftplay

  private slotsKey = '';
  private slotsBusy = false;
  private slotsRetryAt = 0;
  private slotCaptures = 0;

  /** Salon Swiftplay : tes 2 choix comparés à OP.GG. OP.GG ne bloque pas la boucle, le panneau arrive quand il est prêt. */
  private async swiftplayPanel(phase: string): Promise<void> {
    if (phase !== 'Lobby' && phase !== 'Matchmaking') {
      this.state.swiftplay = null;
      this.slotsKey = '';
      return;
    }
    const lobby = await this.lcu?.get<unknown>('/lol-lobby/v2/lobby');
    const read = readSlots(lobby);
    if (!read) {
      this.state.swiftplay = null;
      this.slotsKey = '';
      return;
    }
    const key = `${phase}|${JSON.stringify(read)}`;
    if (this.slotsBusy || (key === this.slotsKey && Date.now() < this.slotsRetryAt)) return;
    const logged = key.slice(key.indexOf('|')) === this.slotsKey.slice(this.slotsKey.indexOf('|'));
    this.slotsKey = key;
    this.slotsBusy = true;
    void this.captureSlots(lobby);
    try {
      const slots = await Promise.all(read.slots.map((s) => this.swiftplaySlot(s)));
      if (this.slotsKey !== key) return;
      this.state.swiftplay = { queueLabel: QUEUE_LABEL[read.queueId] ?? 'Swiftplay', queued: phase === 'Matchmaking', slots };
      this.slotsRetryAt = slots.some((s) => s.winRate == null) ? Date.now() + 65_000 : Number.POSITIVE_INFINITY;
      if (!logged) {
        this.persistLog('jeu', `Salon ${this.state.swiftplay.queueLabel} : ${slots.map((s) => `${s.name} ${s.lane ?? 'rôle inconnu'} ${s.winRate != null ? `${Math.round(s.winRate * 100)} %` : '?'}${s.fit ? `, ${s.fit.rank ?? 'hors rôle'}/${s.fit.of}` : ''}, sorts ${s.spellsOk == null ? '?' : s.spellsOk ? 'OK' : 'différents'}${s.smiteMissing ? ' (sans Châtiment)' : ''}, runes ${s.runes}`).join(' · ')}`);
        this.usage.add({ type: 'swiftplay_slots', at: Date.now(), slots: slots.map((s) => ({ championId: s.championId, lane: s.lane, winRate: s.winRate, rank: s.fit?.rank, of: s.fit?.of, main: s.fit?.main?.lane ?? null, spellsOk: s.spellsOk, smiteMissing: s.smiteMissing, runes: s.runes, runesOff: s.runesOff })) });
      }
      this.emitIfChanged();
    } finally {
      this.slotsBusy = false;
    }
  }

  private async swiftplaySlot(s: LobbySlot): Promise<SwiftplaySlot> {
    const name = this.meta.champion(s.championId)?.name_en || this.champName(s.championId);
    const lane = s.lane ?? (await this.opggData.mainLane(name).catch(() => null));
    const a = lane ? await this.srAnalysis(s.championId, lane, 'ranked') : null;
    const gap = compareLoadout(s, a ? { spells: a.spells, runes: a.runes } : null);
    const key = s.runes?.perks[0];
    const wantKey = a?.runes?.perks[0];
    return {
      championId: s.championId,
      name: this.champName(s.championId),
      change: this.srChange(s.championId),
      lane: lane ? LANE_LABEL[lane] : null,
      laneGuessed: !s.lane,
      winRate: a ? a.winRate : null,
      games: a?.games ?? 0,
      fit: lane ? await this.swiftplayFit(name, lane) : null,
      mine: lane ? this.history.roleRecord(s.championId, lane) : { games: 0, wins: 0 },
      spellsOk: gap.spellsOk,
      smiteMissing: gap.smiteMissing,
      spells: s.spells.filter((x) => x > 0).map((x) => this.game.spell(x)),
      spellsWanted: (a?.spells ?? []).map((x) => this.game.spell(x)),
      runes: gap.runes,
      runesOff: gap.runesOff,
      keystone: key ? this.game.perk(key) : null,
      keystoneWanted: wantKey ? this.game.perk(wantKey, a?.runes?.names?.[0]) : null,
      styleWanted: a?.runes ? this.game.perkStyle(a.runes.primary, a.runes.primaryName) : null,
      starter: swiftplayStarter(a?.starter?.ids ?? []).map((id, i) => this.game.item(id, a?.starter?.ids[i] === id ? a.starter?.names?.[i] : this.meta.tierList?.itemLut?.[String(id)]?.e)),
    };
  }

  private async swiftplayFit(name: string, lane: Lane): Promise<SwiftplaySlot['fit']> {
    const meta = await this.opggData.laneMeta().catch(() => null);
    const fit = meta ? slotFit(meta.get(normChamp(name)) ?? [], meta.values(), lane) : null;
    if (!fit) return null;
    const idOf = this.championIdByName();
    const stronger = fit.stronger.flatMap((r) => {
      const id = idOf(r.champion);
      return id ? [{ id, name: this.champName(id, r.champion), winRate: r.winRate }] : [];
    });
    return { rank: fit.rank, of: fit.of, main: fit.main ? { ...fit.main, lane: LANE_LABEL[fit.main.lane] } : null, stronger };
  }

  /** Capture du salon et des pages liées, sans identifiants : la tranche suivante (appliquer depuis l'app) en dépend. */
  private async captureSlots(lobby: unknown): Promise<void> {
    if (!this.opts.probeDir || this.slotCaptures >= 3) return;
    this.slotCaptures++;
    const l = lobby as { gameConfig?: Record<string, unknown>; localMember?: { playerSlots?: unknown } };
    const pages = (await this.lcu?.get<Record<string, unknown>[]>('/lol-perks/v1/pages')) ?? [];
    const linked = (Array.isArray(pages) ? pages : [])
      .filter((p) => Array.isArray(p.quickPlayChampionIds) && p.quickPlayChampionIds.length)
      .map((p) => ({ id: p.id, isTemporary: p.isTemporary, isEditable: p.isEditable, current: p.current, quickPlayChampionIds: p.quickPlayChampionIds, primaryStyleId: p.primaryStyleId, subStyleId: p.subStyleId, selectedPerkIds: p.selectedPerkIds }));
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(this.opts.probeDir, { recursive: true });
      await writeFile(join(this.opts.probeDir, `lobby-swiftplay-${Date.now()}.json`), JSON.stringify(scrub({ gameConfig: { queueId: l.gameConfig?.queueId, gameMode: l.gameConfig?.gameMode }, playerSlots: l.localMember?.playerSlots, linked }), null, 1));
    } catch {
      /* diagnostic seulement */
    }
  }

  private async handleChampSelect(): Promise<void> {
    const lcu = this.lcu!;
    const session = await lcu.get<RawSession>('/lol-champ-select/v1/session');
    if (!session?.myTeam) return;
    this.selectSkipped = !!session.skipChampionSelect;
    const subset = await readSubset(lcu);
    const parsed = parseSession(session, subset);
    const mode = this.state.mode as Mode;
    if (mode === 'sr') {
      // Faille : le champion survolé compte déjà (runes et build prêts avant le verrouillage)
      const meCell = session.myTeam.find((p) => p.cellId === session.localPlayerCellId);
      if (!parsed.myChampionId && meCell?.championPickIntent) parsed.myChampionId = meCell.championPickIntent;
      parsed.candidates = [];
    }
    const notOwned = mode === 'sr' ? [] : await this.dropUnreachable(parsed);
    this.parsed = parsed;
    if (parsed.myChampionId) this.myChampionId = parsed.myChampionId;
    const tier = this.meta.tierList;

    const candidates = scoreCandidates(
      { mode, allies: parsed.allies, candidates: parsed.candidates, personal: this.history.personal(null), names: this.champName },
      tier,
    );
    this.lastCandidates = candidates;
    const mastery = await this.masteries();
    for (const c of candidates) {
      c.balance = this.balanceOf(c.championId, mode);
      const ch = this.changeText(c.championId);
      if (ch && Date.now() - ch.at < 14 * 86_400_000) c.balanceChange = ch.text;
      const patched = mode === 'sr' ? null : championChange(this.namesOf(c.championId), mode, this.state.data.patch, this.state.data.clientPatch);
      if (patched) c.patchChange = patched;
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
      // Avec ton champion : « il manque » ne doit plus citer ce qu'il apporte
      needs: needsOf(parsed.myChampionId ? [...parsed.allies, parsed.myChampionId] : parsed.allies, tier),
      fillAdvice: fillAdvice(candidates),
      ...(notOwned.length ? { notOwned } : {}),
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
      line = `Champ select Faille (${sr.queueLabel}, ${sr.laneLabel ?? 'rôle inconnu'}) : ${sr.me ? `${sr.me.name} ${Math.round(sr.me.winRate * 100)} % sur ${sr.me.games}` : 'pas de champion'}${sr.matchup ? ` · contre ${sr.matchup.opponent.name} ${Math.round(sr.matchup.myWinRate * 100)} % (${sr.matchup.verdict}, ${sr.matchup.games} parties)` : ''}${sr.counterPicks.length ? ` · counters : ${sr.counterPicks.map((c) => `${c.name} ${Math.round(c.winRate * 100)} %`).join(', ')}` : ''}${sr.bans?.options.length ? ` · bans : ${sr.bans.options.map((b) => b.name).join(', ')}` : ''}`;
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
      // Swiftplay : la session dure 1 à 2 s, sans choix ; une écriture ici ne change rien à la partie
      if (!this.selectSkipped) void this.applyLoadout(false);
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
    if (this.selectSkipped) return { ok: false, message: 'En Swiftplay, runes et sorts se règlent au salon, avant la file' };
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
    this.state.skillNext = this.skillPanel(snap);
    this.lastGameTime = await this.gameTime();
    this.state.goldGap = this.goldGapPanel(snap);
    this.state.laneCs = this.laneCsPanel(snap);
    this.state.laneMap = this.laneMapView(snap);
  }

  /** Temps de jeu (API Live Client `gamestats`) ; null hors partie ou API muette. */
  private async gameTime(): Promise<number | null> {
    const live = this.opts.live;
    const stats = await liveClient<{ gameTime?: number }>('gamestats', live?.port, live?.host);
    return typeof stats?.gameTime === 'number' ? stats.gameTime : null;
  }

  /** Temps de jeu de la dernière lecture de `gamestats`, null hors partie. */
  private lastGameTime: number | null = null;
  /** Écart d'objets toutes les 5 minutes, pour `gold_gap`. */
  private goldSamples = new Map<number, { t: number; gap: number; levels: number }>();

  /** Écart d'objets : ce que montre le tableau des scores, valorisé au prix du patch. Jamais de conseil de jeu. */
  private goldGapPanel(snap: LiveSnap | null): GoldGapPanel | null {
    if (!snap?.mine?.team) return this.state.goldGap ?? null;
    const players: GapInput[] = snap.players
      .filter((p) => p.team)
      .map((p) => {
        const id = snap.champOf(p);
        return {
          championId: id,
          championName: id ? this.game.championName(id, p.championName) : (p.championName ?? p.rawChampionName?.split('_').pop() ?? '?'),
          ally: p.team === snap.mine!.team,
          me: p === snap.mine,
          level: p.level ?? 1,
          position: p.position ?? '',
          items: p.items ?? [],
        };
      });
    const panel = goldGap(players, (id) => this.game.itemPrice(id) ?? this.meta.tierList?.itemLut?.[String(id)]?.p ?? null, this.state.mode);
    if (panel && this.lastGameTime != null) {
      const slot = sampleSlot(this.lastGameTime);
      if (slot > 0 && !this.goldSamples.has(slot)) this.goldSamples.set(slot, { t: Math.round(this.lastGameTime), gap: panel.gap, levels: panel.levelGap });
    }
    return panel;
  }

  /** Tes CS et ceux de ton vis-à-vis toutes les 5 minutes, pour `cs_gap`. */
  private csSamples = new Map<number, { t: number; mine: number; theirs: number | null }>();

  /** Tes CS face à ton adversaire de lane (Faille) : l'adversaire vient du bloc lane, le rôle du jeu ou du salon. Jamais de conseil. */
  private laneCsPanel(snap: LiveSnap | null): LaneCsPanel | null {
    const mine = snap?.mine;
    if (this.state.mode !== 'sr' || !snap || !mine) return null;
    const lane = laneOf(mine.position) ?? this.lane;
    const opp = this.state.counters?.lane ?? null;
    const foe = opp ? snap.players.find((p) => p.team !== mine.team && snap.champOf(p) === opp.opponent.id) : undefined;
    const panel = laneCs({ lane, mine: mine.scores?.creepScore, theirs: foe?.scores?.creepScore, opponent: foe && opp ? opp.opponent : null, guessed: !!opp?.guessed, gameTime: this.lastGameTime });
    if (panel && this.lastGameTime != null) {
      const slot = sampleSlot(this.lastGameTime);
      if (slot > 0 && !this.csSamples.has(slot)) this.csSamples.set(slot, { t: Math.round(this.lastGameTime), mine: panel.mine, theirs: panel.theirs });
    }
    return panel;
  }

  /** Ordre des points pris pendant la partie, pour `skills_taken`. `partial` : app lancée en cours de partie, le début manque. */
  private skillTrack: { levels: SkillLevels; taken: string; partial: boolean } | null = null;

  /** Le prochain point à mettre et son sort. Rien sans ordre connu (OP.GG injoignable) : mieux vaut ne rien dire. */
  private skillPanel(snap: LiveSnap | null): SkillNext | null {
    const levels = skillLevels(snap?.me.abilities);
    const level = snap?.me.level;
    if (!levels || !level) return this.state.skillNext ?? null;
    const partial = spentPoints(levels) > 1;
    const t = (this.skillTrack ??= { levels: partial ? levels : { Q: 0, W: 0, E: 0, R: 0 }, taken: '', partial });
    for (const k of ['Q', 'W', 'E', 'R'] as const) t.taken += k.repeat(Math.max(0, levels[k] - t.levels[k]));
    t.levels = levels;
    const plan = this.state.build?.skills;
    if (!plan?.order.length) return null;
    const key = nextSkill(plan.order, plan.max, levels, level);
    if (!key) return null;
    return { key, name: snap?.me.abilities?.[key]?.displayName ?? null, rank: levels[key] + 1, pending: level > spentPoints(levels), max: plan.max, source: plan.source ?? null };
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
    this.dropSkinHeadliner(players.map((p) => p.skinName ?? ''));
    return { me, players, mine, champOf };
  }

  /**
   * Diagnostic : à chaque choix d'augment, ce que l'API Live Client dit de toi (sans identifiants). But : savoir si
   * elle finit par lister tes augments en cours de partie, ce qui permettrait de tenir compte de ceux déjà pris.
   */
  private probedRounds = new Set<string>();
  /** Plus grande portée lue dans la partie (0 tant que le Live Client ne la donne pas), pour le pool de relance. */
  private liveRange = 0;
  private liveCard: { haste: number | null; ultimate: string | null } | null = null;
  private async probeRound(snap: LiveSnap): Promise<void> {
    const dir = this.opts.probeDir;
    const rift = this.state.mode === 'sr';
    const round = rift ? riftStage(this.lastGameTime) : this.state.augRound;
    if (!dir || !round) return;
    const key = `${rift ? 'faille-' : ''}${this.myChampionId}-${round}`;
    if (this.probedRounds.has(key)) return;
    this.probedRounds.add(key);
    const scrub = (o: object | null) => (o ? { ...o, riotId: '·', riotIdGameName: '·', riotIdTagLine: '·', summonerName: '·' } : null);
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `liveclient-${rift ? 'faille' : 'choix'}${round}-${Date.now()}.json`), JSON.stringify({ round, gameTime: this.lastGameTime, activeplayer: scrub(snap.me as object), me: scrub(snap.mine as object | null), players: probePlayers(snap.players) }, null, 1));
    } catch {
      /* diagnostic seulement */
    }
  }

  /**
   * Items à acheter pour les augments liés à un item. L'augment pris n'est connu qu'en fin de partie : on suppose la
   * carte conseillée (suivie sur 68 choix de 86), en le disant. Un mauvais pari passe après 2 achats différents (`skipped`).
   */
  private boundBuys(owned: Set<number>, cores: BuildCore[]): { id: number; why: string }[] {
    if (this.state.mode !== 'mayhem') return [];
    const role = buildRole(this.meta.champion(this.myChampionId)?.comp);
    const out: { id: number; why: string }[] = [];
    const seen = new Set<number>();
    const gone: number[] = [];
    const noSell = new Set<number>();
    for (const o of this.offersThisGame.values()) {
      if (o.kind !== 'augment' || o.best == null || seen.has(o.best)) continue;
      seen.add(o.best);
      const name = this.augName(o.best);
      const had = this.questSeen.get(o.best) ?? new Set<number>();
      if (questDone(name, owned, had)) gone.push(...questItems(name));
      for (const x of noSellItems(name)) noSell.add(x);
      const id = boundTarget(name, owned, cores, role, had, (i) => this.game.item(i, this.meta.tierList?.itemLut?.[String(i)]?.e).name);
      for (const q of questItems(name)) if (owned.has(q)) had.add(q);
      this.questSeen.set(o.best, had);
      const track = this.boundThisGame.get(o.best);
      if (id != null && !out.some((x) => x.id === id)) out.push({ id, why: `pour ${name}, si tu l'as pris` });
      if (id != null) this.boundThisGame.set(o.best, { item: id, bought: false });
      else if (track) track.bought = true;
    }
    for (const [id, t] of this.boundThisGame) if (!seen.has(id) && !t.bought) this.boundThisGame.delete(id);
    this.questGone = gone;
    this.noSell = [...noSell];
    return out;
  }

  /** Cartes conseillées aux choix passés, sans les augments liés à un item : `boundBuys` s'en occupe. */
  private takenAugments(): TakenAugment[] {
    if (this.state.mode !== 'mayhem' || !this.augInfo.size) return [];
    const ids = new Set<number>();
    for (const o of this.offersThisGame.values()) if (o.kind === 'augment' && o.best != null) ids.add(o.best);
    return [...ids].map((id) => ({ id, name: this.augName(id), tags: this.augInfo.tags(this.augName(id)) })).filter((a) => !boundItems(a.name));
  }

  /** Noms anglais : c'est eux que lit le fichier de combos, le client peut être dans une autre langue. */
  private augNameEn(id: number): string {
    return this.meta.tierList?.augs[String(id)]?.name_en ?? this.augName(id);
  }

  /** Avis de la communauté sur ces cartes pour ce champion. `taken` : cartes conseillées aux choix passés. */
  private comboNotes(championId: number, ids: number[], taken: number[] = []): Record<number, ComboNote> {
    const out: Record<number, ComboNote> = {};
    const names = taken.map((id) => this.augNameEn(id));
    for (const id of ids) {
      const note = comboNote(this.combos.rows, this.namesOf(championId), this.augNameEn(id), names);
      if (note) out[id] = note;
    }
    return out;
  }

  /** Cartes modifiées par un patch que les stats n'ont pas encore (affichage seulement, hors classement). */
  private patchChanges(ids: number[]): Record<number, PatchChange> {
    const out: Record<number, PatchChange> = {};
    for (const id of ids) {
      const change = augmentChange(this.augNameEn(id), this.state.data.patch, this.state.data.clientPatch);
      if (change) out[id] = change;
    }
    return out;
  }

  /** Cartes conseillées aux choix d'avant : une relecture du tirage en cours n'en est pas un. */
  private assumedBefore(round: number | null): number[] {
    const ids = new Set<number>();
    for (const o of this.offersThisGame.values()) if (o.kind === 'augment' && o.best != null && o.round !== round) ids.add(o.best);
    return [...ids];
  }

  /** Faille, rien d'acheté : le conseil d'achat vise le build, il ne dit pas par quoi commencer. */
  private starterPanel(b: BuildPanel, owned: number[]): NextBuyPanel['starter'] {
    if (this.state.mode !== 'sr' || !b.starter?.length) return null;
    const items = b.starter;
    if (nothingBought(owned)) {
      const swapped = Boolean(b.starterSwapped);
      if (!this.starterShown) this.persistLog('jeu', `Départ conseillé : ${items.map((x) => x.name).join(' + ')}${swapped ? ' (Doran remplacé par le Gardien)' : ''}`);
      this.starterShown ??= { advised: items.map((x) => x.id), swapped };
      return { items, swapped };
    }
    if (this.starterShown) {
      this.usage.add({ type: 'starter', at: Date.now(), championId: this.myChampionId, queueId: this.state.queueId, owned, ...this.starterShown });
      this.starterShown = null;
    }
    return null;
  }

  /** Or et items du joueur via l'API Live Client du jeu (officielle, lecture seule). */
  private async nextBuyPanel(snap: LiveSnap | null): Promise<NextBuyPanel | null> {
    const b = this.state.build;
    if (!b) return null;
    const me = snap?.me;
    if (!me || typeof me.currentGold !== 'number') return this.state.nextBuy;
    // Le choix reste 4 au-delà : l'augment du niveau 21 (Superfans) suit le même chemin que celui de K/DA (`choice: 1`), avec les stats du choix 4.
    if (typeof me.level === 'number' && this.state.mode !== 'sr') {
      this.state.augRound = 1 + Number(me.level >= 7) + Number(me.level >= 11) + Number(me.level >= 15);
      this.state.liveLevel = me.level;
    }
    this.liveRange = Math.max(this.liveRange, me.championStats?.attackRange ?? 0);
    this.liveCard = { haste: me.championStats?.abilityHaste ?? null, ultimate: me.abilities?.R?.displayName ?? null };
    void this.probeRound(snap);
    void this.cooldowns.loadAny(ddragonCandidates(this.state.data.clientPatch, this.game.ddragonVersion)); // valeurs de revente
    const owned = (snap.mine?.items ?? []).map((i) => i.itemID);
    const slotted = snap.mine?.items ?? [];
    const bag = slotted.length && slotted.every((i) => typeof i.slot === 'number') ? slotted.filter((i) => i.slot! < BAG_SLOTS).map((i) => i.itemID) : undefined;
    const buyable = (id: number) => this.game.specialRecipe(id) || TRANSFORMS[id] || id;
    const becomes = new Map<number, string>();
    for (const c of b.cores) for (const x of [...c.core, ...c.options]) if (buyable(x.id) !== x.id) becomes.set(buyable(x.id), x.name);
    const named = (t: { title: string; champions: { name: string }[] }) => (t.champions.length ? `${t.title} (${t.champions.slice(0, 3).map((c) => c.name).join(', ')})` : t.title);
    // Faille : les options se comparent au rang de l'item à acheter (OP.GG), bottes à part
    const isDone = (id: number) => (this.game.items.size ? this.game.isComplete(id) : (this.game.itemPrice(id) ?? 0) >= 2000);
    const isItem = (id: number) => isDone(id) && !this.game.isBoots(id);
    const slot = itemSlot(owned, isItem);
    const ownedAll = new Set(expandOwned(owned, (id) => this.game.specialRecipe(id)));
    const bySlot = (coreIds: number[], options: { id: number; winrate: number; games?: number }[]) =>
      optionsForSlot(options, b.slotStats?.[slot], (id) => ownedAll.has(id) || coreIds.includes(id), buyable);
    const sameInventory = this.lastBuy != null && [...this.lastBuy.owned].sort().join() === [...owned].sort().join();
    // Items qui se transforment (Muramana, Fimbulwinter, Seraph) : on conseille ce qui s'achète (Manamune…)
    const cores = b.cores.map((c) => ({ core: c.core.map((x) => buyable(x.id)), options: bySlot(c.core.map((x) => buyable(x.id)), c.options.map((o) => ({ id: buyable(o.id), winrate: o.winrate, games: o.games }))) }));
    const bound = this.boundBuys(ownedAll, cores);
    const cat = (id: number) => this.game.categories(id);
    const components = (id: number) => this.game.components(id);
    const choices = b.cores.map((c, k) => ({ items: cores[k].core, winrate: c.winrate, games: c.games }));
    const lean = preferredCore(choices, this.takenAugments(), owned, cat, components);
    const leanChanged = (lean?.index ?? null) !== this.leanCore;
    this.leanCore = lean?.index ?? null;
    if (lean) {
      const items = choices[lean.index].items;
      const to = b.cores[lean.index].name;
      if (this.leanThisGame?.to !== to) this.leanThisGame = { from: b.cores[lean.base].name, to, items, augments: lean.augments.map((a) => a.id), bought: false };
    }
    const itemWinrates = itemValues(b.slotStats?.[slot]?.length ? b.slotStats[slot] : b.itemStats, buyable);
    const r = nextBuys({
      owned,
      bag,
      keep: sameInventory && !leanChanged ? this.lastBuy!.reco : null,
      prefer: lean?.index ?? null,
      gold: me.currentGold,
      cores,
      bound,
      gone: this.questGone,
      noSell: this.noSell,
      boots: b.boots.map((x) => x.id),
      counters: (this.state.counters?.threats ?? []).map((t) => ({ key: t.key, title: named(t), items: t.items.map((x) => buyable(x.id)), urgent: t.urgent })),
      value: (id) => itemWinrates.get(id) ?? null,
      allBoots: new Set([...b.boots.map((x) => x.id), 1001, 3006, 3009, 3020, 3047, 3111, 3158, 3008, ...[...this.game.items.keys()].filter((id) => this.game.isBoots(id))]),
      price: (id) => this.game.itemPrice(id) ?? this.meta.tierList?.itemLut?.[String(id)]?.p ?? null,
      components: (id) => this.game.components(id),
      sellValue: (id) => this.cooldowns.sellValue(id),
      specialRecipe: (id) => this.game.specialRecipe(id),
      complete: this.game.items.size ? (id) => this.game.isComplete(id) : undefined,
      ...(this.state.mode === 'sr' ? { labels: { core: 'cœur du build OP.GG', option: b.slotStats?.[slot]?.length ? `${slot}e item` : 'item suivant' } } : {}),
      ...(this.state.mode !== 'sr' ? { labels: { core: 'build le plus gagnant', option: optionLabel(slot) } } : {}),
      ...(lean ? { labels: { core: `build ${b.cores[lean.index].name}, pour ${lean.augments.map((a) => a.name).join(', ')}, si tu l'as pris`, option: optionLabel(slot) } } : {}),
      skipped: new Set([...this.skippedBuys].filter(([, n]) => n >= 2).map(([id]) => id)),
    });
    const itemOf = (id: number) => this.game.item(id, this.meta.tierList?.itemLut?.[String(id)]?.e);
    // Télémétrie locale : chaque item fini acheté, comparé au conseil affiché juste avant
    if (this.lastBuy) {
      let at = itemSlot(this.lastBuy.owned, isItem);
      for (const id of owned)
        if (!this.lastBuy.owned.includes(id) && isDone(id)) {
          const reco = this.lastBuy.reco;
          const followed = reco === id || reco === this.game.specialRecipe(id);
          if (reco != null && !followed && !this.game.isBoots(id)) this.skippedBuys.set(reco, (this.skippedBuys.get(reco) ?? 0) + 1);
          const stats = b.slotStats?.[at]?.length ? b.slotStats[at] : null;
          const buy = this.withValues({ type: 'item_bought', at: Date.now(), championId: this.myChampionId, id, reco, plan: this.lastBuy.plan, followed, ...(this.lastBuy.why ? { why: this.lastBuy.why } : {}), ...(stats ? { slot: at } : {}) }, stats ?? b.itemStats);
          if (isItem(id)) at++;
          this.usage.add(buy);
          this.buysThisGame.push(buy);
        }
    }
    // Ton build en cours, pour rapprocher les augments proposés de ce que tu construis vraiment
    const planned = r.plan.filter((x) => !x.owned).map((x) => x.id);
    const known = (id: number) => cat(id).length > 0 && !this.game.isBoots(id);
    if (this.leanThisGame?.items.some((id) => ownedAll.has(id))) this.leanThisGame.bought = true;
    // Pour noter une carte liée à un item, le plan ne compte pas l'item ajouté à cause de cette carte (sinon elle se justifierait toute seule)
    const inBuild = new Set([...cores[r.coreIndex]?.core ?? [], ...cores[r.coreIndex]?.options.map((o) => o.id) ?? []]);
    const added = new Set(bound.map((x) => x.id).filter((id) => !inBuild.has(id)));
    const alternatives = this.state.mode === 'mayhem' ? openCores(choices, owned, components).open.filter((k) => k !== r.coreIndex).map((k) => buildProfile(owned, choices[k].items, cat)) : [];
    this.buildFit = { profile: buildProfile(owned, planned, cat), alternatives, seen: owned.filter((id) => isDone(id) && known(id)).length + planned.filter(known).length, owned: ownedAll, planned: new Set([...inBuild, ...planned].filter((id) => !added.has(id))), legendary: slotted.length && !bag ? null : [...slotted].sort((x, y) => x.slot! - y.slot!).filter((i) => i.slot! < BAG_SLOTS && isItem(i.itemID)).map((i) => itemOf(i.itemID).name) };
    if (this.state.offered) {
      const o = this.state.offered;
      const fit = this.fitFor(o.ids, o.names);
      if (JSON.stringify(fit) !== JSON.stringify(o.fit)) this.state.offered = { ...o, fit };
      const hints = this.cardHints(o.ids);
      if (JSON.stringify(hints) !== JSON.stringify(o.hints)) this.state.offered = { ...this.state.offered, hints };
    }
    const reco = r.rows[0]?.id ?? null;
    if (reco !== this.lastBuy?.reco && reco != null) {
      const room = r.rows[0].room;
      const roomNote = room ? (room.sell != null ? ` · sac plein, vendre ${itemOf(room.sell).name}` : room.held ? ' · sac plein, composants gardés' : ' · sac plein, rien à vendre') : '';
      this.persistLog('jeu', `Achat conseillé : ${itemOf(reco).name} (${r.rows[0].why}) · or ${Math.floor(me.currentGold)} · inventaire ${owned.map((i) => itemOf(i).name).join(', ') || 'vide'}${roomNote}`);
      if (bag && bag.length >= BAG_SLOTS) this.usage.add({ type: 'bag_full', at: Date.now(), championId: this.myChampionId, gold: Math.floor(me.currentGold), reco, sell: room?.sell ?? null, blocked: Boolean(room), bag, level: me.level ?? null });
    }
    const resale = r.rows[0]?.resale;
    const resaleKey = resale ? `${reco}:${resale.sell.join()}` : null;
    if (resale && resaleKey !== this.lastResale) {
      this.persistLog('jeu', `Revente : ${resale.sell.map((id) => itemOf(id).name).join(', ')} (+${resale.gain} or) pour acheter ${itemOf(reco!).name}, il manquait ${Math.ceil(r.rows[0].missing)} or`);
      this.usage.add({ type: 'resale', at: Date.now(), championId: this.myChampionId, gold: Math.floor(me.currentGold), reco: reco!, gap: Math.ceil(r.rows[0].missing), gain: resale.gain, sell: resale.sell, full: (bag?.length ?? 0) >= BAG_SLOTS, level: me.level ?? null });
    }
    this.lastResale = resaleKey;
    for (const d of r.deferred) {
      if (this.deferredThisGame.has(d.id)) continue;
      this.deferredThisGame.add(d.id);
      this.persistLog('jeu', `Menace après le build : ${itemOf(d.id).name} ${Math.round(d.value * 100)} % contre ${itemOf(d.by).name} ${Math.round(d.byValue * 100)} % (${d.title})`);
      this.usage.add({ type: 'threat_deferred', at: Date.now(), championId: this.myChampionId, key: d.key ?? '', id: d.id, by: d.by, value: d.value, byValue: d.byValue });
    }
    this.lastBuy = { owned, reco, plan: r.rows.map((x) => x.id), why: r.rows[0]?.why };
    const starter = this.starterPanel(b, owned);
    const idle = !r.rows.length || (r.rows[0].room?.sell === null && !r.rows[0].room.held);
    const anvil = this.anvilPanel(snap, owned, idle, (id) => isDone(id));
    const elixir = this.elixirPanel(snap, owned, idle, (id) => isDone(id), anvil?.price ?? 0);
    return {
      gold: Math.floor(me.currentGold),
      anvil,
      elixir,
      starter,
      ...(r.deferred.length ? { deferred: r.deferred.map((d) => ({ key: d.key ?? '', item: itemOf(d.id), by: itemOf(d.by), value: d.value, byValue: d.byValue })) } : {}),
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
        ...(x.room ? { room: { sell: x.room.sell != null ? itemOf(x.room.sell) : null, ...(x.room.held ? { held: true } : {}) } } : {}),
        ...(x.resale ? { resale: { items: x.resale.sell.map(itemOf), gain: x.resale.gain } } : {}),
      })),
    };
  }

  /** Mayhem, rien d'autre à acheter : l'enclume, et les achats vus à l'or. Rôle lu comme pour l'élixir. */
  private anvilPanel(snap: LiveSnap, owned: number[], idle: boolean, isDone: (id: number) => boolean): NextBuyPanel['anvil'] {
    const me = snap.me!;
    const gold = me.currentGold!;
    const now = Date.now();
    const key = [...owned].sort().join();
    const price = this.game.itemPrice(ANVIL_ID) ?? ANVIL_PRICE;
    const was = this.anvilTick;
    const seen = was ? anvilsBought(was.gold, gold, was.owned === key, price) : 0;
    if (seen) {
      this.anvilCount += seen;
      this.persistLog('jeu', `Enclume achetée (${this.anvilCount} cette partie) · or ${Math.floor(gold)}`);
      this.usage.add({ type: 'anvil', at: now, championId: this.myChampionId, gold: Math.floor(gold), level: me.level ?? null, bought: true, count: seen });
    }
    const advice = anvilAdvice({ isMayhem: this.state.mode === 'mayhem', level: me.level, gold, idle, price, onMap: this.cooldowns.onMap(ANVIL_ID, 12) });
    this.anvilTick = advice ? { gold, owned: key } : null;
    if (!advice) return null;
    if (advice.buy && !this.anvilNoted) {
      this.anvilNoted = true;
      this.persistLog('jeu', `Enclume conseillée, rien d'autre à acheter · or ${Math.floor(gold)} · niveau ${me.level ?? '?'}`);
      this.usage.add({ type: 'anvil', at: now, championId: this.myChampionId, gold: Math.floor(gold), level: me.level ?? null, bought: false });
    }
    const comp = this.meta.champion(this.myChampionId)?.comp;
    const role = elixirRole(buildRole(comp), compFromItems(comp, owned.filter((id) => isDone(id)), (id) => this.game.categories(id)).built);
    return { item: { ...this.game.item(ANVIL_ID, ANVIL_NAME), name: ANVIL_NAME }, price: advice.price, buy: advice.buy, missing: advice.missing, bought: this.anvilCount, pick: anvilPick(role, this.state.counters?.damage?.phys) };
  }

  /** Rien d'autre à acheter : l'élixir de ton build, et le suivi de celui que tu as bu. `reserved` : or gardé pour l'enclume, qui passe d'abord. */
  private elixirPanel(snap: LiveSnap, owned: number[], idle: boolean, isDone: (id: number) => boolean, reserved = 0): NextBuyPanel['elixir'] {
    const me = snap.me!;
    const gold = me.currentGold!;
    const now = Date.now();
    const key = [...owned].sort().join();
    const respawn = snap.mine?.isDead ? snap.mine.respawnTimer : null;
    const was = this.elixirTick;
    const price = this.game.itemPrice(was?.id ?? 0) ?? ELIXIR_PRICE;
    if (was && elixirBought(was.gold, gold, was.owned === key, price)) {
      this.elixirEnd = elixirUntil(now, respawn);
      this.persistLog('jeu', `Élixir acheté : ${this.game.item(was.id).name} · or ${Math.floor(gold)}`);
      this.usage.add({ type: 'elixir', at: now, championId: this.myChampionId, id: was.id, gold: Math.floor(gold), level: me.level ?? null, bought: true });
    }
    // Pas sac plein, l'élixir attend dans le sac : le boire est un geste à toi, on n'en conseille pas un 2e.
    if (owned.some((id) => ELIXIR_IDS.has(id))) {
      this.elixirTick = null;
      return null;
    }
    const finished = owned.filter((id) => isDone(id));
    const comp = this.meta.champion(this.myChampionId)?.comp;
    const role = elixirRole(buildRole(comp), compFromItems(comp, finished, (id) => this.game.categories(id)).built);
    const id = ELIXIRS[role].id;
    const advice = elixirAdvice({
      role,
      level: me.level,
      gold: gold - reserved,
      idle,
      price: this.game.itemPrice(id) ?? ELIXIR_PRICE,
      onMap: this.cooldowns.onMap(id, this.state.mode === 'sr' ? 11 : 12),
      until: this.elixirEnd,
      now,
    });
    this.elixirTick = advice?.buy ? { gold, owned: key, id } : null;
    if (!advice) return null;
    if (advice.buy && !this.elixirNoted) {
      this.elixirNoted = true;
      this.persistLog('jeu', `Élixir conseillé : ${advice.name}, rien d'autre à acheter · or ${Math.floor(gold)} · inventaire ${owned.map((x) => this.game.item(x).name).join(', ')}`);
      this.usage.add({ type: 'elixir', at: now, championId: this.myChampionId, id, gold: Math.floor(gold), level: me.level ?? null, bought: false });
    }
    return { item: this.game.item(id, advice.name), perk: advice.perk, price: advice.price, left: advice.left, buy: advice.buy };
  }

  /** Complète un achat avec ce qu'il faut pour le juger : winrates de la même source, bottes, conseil couvert. */
  private withValues(e: ItemBought, stats: ItemStat[] | undefined): ItemBought {
    const values = itemValues(stats, (id) => this.game.specialRecipe(id) || TRANSFORMS[id] || id);
    const mine = values.get(e.id);
    const reco = e.reco == null ? undefined : values.get(e.reco);
    const covers = e.reco != null && !e.followed && this.coversAdvice(e.id, e.reco);
    const boots = this.game.isBoots(e.id) || (e.reco != null && this.game.isBoots(e.reco));
    return {
      ...e,
      ...(mine ? { value: mine.winrate, games: mine.games } : {}),
      ...(reco ? { recoValue: reco.winrate, recoGames: reco.games } : {}),
      ...(covers ? { covers } : {}),
      ...(boots ? { boots } : {}),
    };
  }

  /** Autre item, même effet : le conseil est un composant de l'item acheté, ou les deux répondent à la même menace. */
  private coversAdvice(id: number, reco: number): boolean {
    const parts = new Set<number>();
    const walk = (x: number, depth: number) => {
      for (const c of this.game.components(x)) {
        parts.add(c);
        if (depth < 3) walk(c, depth + 1);
      }
    };
    walk(id, 0);
    if (parts.has(reco)) return true;
    return (this.state.counters?.threats ?? []).some((t) => t.items.some((x) => x.id === id) && t.items.some((x) => x.id === reco));
  }

  /** Menaces déjà notées cette partie (`threat_deferred`, une ligne par item). */
  private deferredThisGame = new Set<number>();
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
    if (this.state.mode === 'mayhem' || this.state.mode === 'sr') {
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
    const gameKey = `${s?.gameData?.gameId ?? 0}-${myId}-${laneView?.opponent.id ?? 0}:${laneView?.games ?? 0}${laneView?.guide ? 'g' : ''}-${[...enemies, ...allies].map((id) => `${id}:${weight(id).toFixed(2)}:${finished(id).join('.')}`).join(',')}`;
    if (this.state.counters?.gameKey === gameKey) return this.state.counters;

    const cat = (i: number) => this.game.categories(i);
    // Profil corrigé par les items réellement achetés (ce que tu vois avec Tab)
    const comp = (id: number) => compFromItems(this.meta.champion(id)?.comp, finished(id), cat).comp;
    const built = (id: number) => compFromItems(this.meta.champion(id)?.comp, finished(id), cat).built;
    const role = buildRole(this.meta.champion(myId)?.comp);
    const foes = enemies.map((id) => ({ id, comp: comp(id), weight: weight(id) }));
    const base = enemyThreats(foes, role);
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
      jungle: this.state.mode === 'sr' && this.lane === 'jungle',
      damage: damageSplit(foes),
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
    panel.combos = this.comboNotes(championId, Object.values(panel.all ?? {}).flat().map((a) => a.id));
    panel.changes = this.patchChanges(Object.values(panel.all ?? {}).flat().map((a) => a.id));
    panel.change = championChange(this.namesOf(championId), 'mayhem', this.state.data.patch, this.state.data.clientPatch);
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
      itemStats: (detail?.singleItems?.top ?? []).map((r) => ({ id: Number(r.slug), winrate: r.wr, games: r.g })).filter((r) => r.id),
      balance: this.balanceOf(championId, mode),
      note:
        mode === 'aram'
          ? 'ARAM classique : runes recommandées par le client. Les items et winrates détaillés n’existent que pour Mayhem (arammeta).'
          : null,
    };
    this.attachAramSkills(panel);
    if (lcu) this.buildCache.set(key, panel); // sans client : pas de runes, on ne garde pas en cache
    return panel;
  }

  /**
   * ARAM et Mayhem : ordre des compétences d'OP.GG (file ARAM, ils n'ont pas de file Mayhem ; le rôle n'y change rien).
   * Sans attendre : OP.GG lent ou coupé ne doit pas retarder le build, l'ordre arrive au tour suivant.
   */
  private attachAramSkills(panel: BuildPanel): void {
    void this.srAnalysis(panel.championId, 'top', 'aram').then((a) => {
      if (a?.skillMax.length && a.skillOrder.length) panel.skills = { order: a.skillOrder, max: a.skillMax, source: 'OP.GG, ARAM' };
    });
  }

  // ---------------------------------------------------------------- Faille de l'invocateur (OP.GG)

  /** Analyse OP.GG (champion × rôle × file), gardée en mémoire ; un échec est réessayé après 1 min. */
  private srAnalysis(id: number, lane: Lane, modeOverride?: OpggMode): Promise<OpggAnalysis | null> {
    const mode = modeOverride ?? opggModeOf(this.state.queueId);
    const key = `${id}|${lane}|${mode}`;
    let p = this.srCache.get(key);
    if (!p) {
      const name = this.meta.champion(id)?.name_en || this.champName(id);
      p = this.opggData.analysis(name, this.game.championAlias(id), lane, mode).catch(() => null);
      this.srCache.set(key, p);
      void p.then((a) => {
        if (!a) setTimeout(() => this.srCache.delete(key), 60_000);
        else this.noteOpggPatch(a);
      });
    }
    return p;
  }

  /** Patch des stats OP.GG : le plus récent vu, noté une fois par valeur pour mesurer son délai après un patch. */
  private noteOpggPatch(a: OpggAnalysis): void {
    const seen = this.state.data.opggPatch;
    if (!a.statsPatch || a.statsPatch === seen) return;
    if ((patchNumber(a.statsPatch) ?? 0) < (patchNumber(seen) ?? 0)) return;
    this.state.data.opggPatch = a.statsPatch;
    this.persistLog('info', `Stats OP.GG : patch ${a.statsPatch}${this.state.data.clientPatch ? `, client en ${this.state.data.clientPatch}` : ''}`);
    this.usage.add({ type: 'opgg_patch', at: Date.now(), stats: a.statsPatch, client: this.state.data.clientPatch ?? null });
  }

  /** Changement de patch d'un champion en Faille : seulement si OP.GG a des stats d'avant ce patch. */
  private srChange(id: number): PatchChange | undefined {
    return championChange(this.namesOf(id), 'sr', this.state.data.opggPatch, this.state.data.clientPatch) ?? undefined;
  }

  /** Ton rôle : celui donné par le client, sinon le rôle principal du champion (partie sans rôles). */
  private async myLane(id: number): Promise<Lane | null> {
    if (this.lane) return this.lane;
    return this.opggData.mainLane(this.meta.champion(id)?.name_en || this.champName(id));
  }

  private matchupView(opp: number, m: { myWinRate: number; games: number }, guessed: boolean): MatchupView {
    const { lo, hi } = wilson(m.myWinRate, m.games);
    return { opponent: { id: opp, name: this.champName(opp), change: this.srChange(opp) }, myWinRate: m.myWinRate, games: m.games, lo, hi, verdict: verdictOf(m.myWinRate, m.games), guessed };
  }

  /** Champ select Faille : ton rôle, ton champion, l'adversaire de lane probable et les counter-picks fiables. */
  private async srSelect(session: RawSession, myId: number): Promise<SrSelect> {
    const meCell = session.myTeam.find((p) => p.cellId === session.localPlayerCellId);
    const assigned = laneOf(meCell?.assignedPosition);
    if (assigned) this.lane = assigned;
    for (const p of session.myTeam) {
      const l = laneOf(p.assignedPosition);
      if (l && p.championId > 0) this.allyLanes.set(p.championId, l);
    }
    const lane = myId ? await this.myLane(myId) : assigned;
    const queueLabel = QUEUE_LABEL[this.state.queueId ?? 0] ?? 'Faille';
    const out: SrSelect = { lane, laneLabel: lane ? LANE_LABEL[lane] : null, queueLabel, me: null, matchup: null, counterPicks: [], dangers: [], bans: null, note: null };
    if (!lane) {
      out.note = 'Rôle inconnu : choisis ou survole un champion pour voir ses stats.';
      return out;
    }
    if (!assigned) out.note = 'Partie sans rôles : rôle principal du champion supposé.';
    const locked = !!meCell?.championId && !(session.actions ?? []).flat().some((a) => a.actorCellId === session.localPlayerCellId && a.type === 'pick' && !a.completed);
    const mine = myId ? await this.srAnalysis(myId, lane) : null;
    if (myId && mine) {
      const { lo, hi } = wilson(mine.winRate, mine.games);
      out.me = { id: myId, name: this.champName(myId), locked, winRate: mine.winRate, games: mine.games, lo, hi, tier: mine.tier, change: this.srChange(myId) };
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
        else out.matchup = { opponent: { id: opp, name: this.champName(opp), change: this.srChange(opp) }, myWinRate: 0.5, games: 0, lo: 0, hi: 1, verdict: 'incertain', guessed: true };
        if (myId) out.matchup = this.withGuide(out.matchup, myId, lane);
        if (!locked) {
          const taken = new Set([...session.myTeam.map((p) => p.championId), ...enemies, ...(session.actions ?? []).flat().filter((a) => a.type === 'ban' && a.completed).map((a) => a.championId)]);
          const mastery = await this.masteries();
          const col = await this.collection();
          const playable = (id: number) => !col || col.owned.has(id) || col.free.has(id);
          // Le guide liste tout le rôle, l'analyse seulement 3 champions : elle sert en attendant la réponse
          const full = guideCounters(this.roleGuide(opp, lane, myId), opp);
          out.counterPicks = counterPicksFrom(full.length ? { losesTo: full } : theirs, (wr, n) => wilson(wr, n).lo, full.length ? full.length : 6)
            .filter((c) => !taken.has(c.id) && playable(c.id))
            .slice(0, 4)
            .map((c) => ({ ...c, name: this.champName(c.id, c.name), mastery: mastery.get(c.id)?.level ?? null, change: this.srChange(c.id) }));
          if (full.length) this.notePicks(opp, lane, full.length, out.counterPicks);
        }
      }
      // Tes matchups connus contre les autres ennemis : utile si l'un d'eux vient dans ta lane, le rôle en face étant deviné
      const own = myId ? guideCounters(this.roleGuide(myId, lane, opp), myId) : [];
      out.dangers = dangersFrom(own.length ? own : mine?.losesTo ?? [], enemies, opp, mine?.winRate ?? 0.5, (wr, n) => wilson(wr, n).hi)
        .map((c) => ({ id: c.id, name: this.champName(c.id, c.name), myWinRate: c.myWinRate, games: c.games }));
    }
    out.bans = await this.srBans(session, lane, mine, myId);
    return out;
  }

  /** Tous les matchups d'un champion dans un rôle. Ne bloque jamais le champ select : ils arrivent à la lecture suivante, 1 appel OP.GG par champion. */
  private roleGuide(id: number, lane: Lane, against?: number): GuideData | null {
    const key = `${id}|${lane}`;
    if (this.roleGuides.has(key)) return this.roleGuides.get(key) ?? null;
    this.roleGuides.set(key, null);
    // Liste supposée la même quel que soit l'adversaire demandé (vu sur Ahri seulement) : on demande quand même le vrai
    void this.opggData.matchupGuide(this.guideWho(id), this.guideWho(against || id), lane).then((raw) => {
      if (raw == null) throw new Error('guide OP.GG absent');
      this.roleGuides.set(key, readGuide(raw, lane));
    }).catch(() => setTimeout(() => this.roleGuides.delete(key), 60_000));
    return null;
  }

  private notePicks(oppId: number, lane: Lane, known: number, picks: SrSelect['counterPicks']): void {
    const key = `${oppId}|${lane}`;
    if (this.picksSeen.has(key)) return;
    this.picksSeen.add(key);
    this.persistLog('jeu', `Counter-picks contre ${this.champName(oppId)} (${known} matchups lus) : ${picks.map((c) => `${c.name} ${Math.round(c.winRate * 100)} %`).join(', ') || 'aucun net'}`);
    this.usage.add({ type: 'counter_picks', at: Date.now(), opponentId: oppId, lane, known, picks: picks.map((c) => ({ id: c.id, rate: c.winRate, games: c.games, mastery: c.mastery })) });
  }

  /** Bans conseillés tant que ton ban reste à valider ; null sur une file sans bans (Swiftplay) ou sans données. */
  private async srBans(session: RawSession, lane: Lane, mine: OpggAnalysis | null, myId: number): Promise<SrBans | null> {
    const actions = (session.actions ?? []).flat().filter((a) => a.type === 'ban');
    const own = actions.find((a) => a.actorCellId === session.localPlayerCellId && !a.completed);
    if (!own) return null;
    const meta = await this.opggData.laneMeta();
    if (!meta.size) return null;
    const cells = new Set(session.myTeam.map((p) => p.cellId));
    const excluded = new Set(
      [
        ...actions.filter((a) => a.completed || (cells.has(a.actorCellId) && a.id !== own.id)).map((a) => a.championId),
        ...(session.bans?.myTeamBans ?? []),
        ...(session.bans?.theirTeamBans ?? []),
        ...session.myTeam.flatMap((p) => [p.championId, p.championPickIntent ?? 0]),
        ...(session.theirTeam ?? []).map((p) => p.championId),
      ].filter((id) => id > 0),
    );
    const lanes = new Set<Lane>([lane]);
    for (const p of session.myTeam) {
      const l = laneOf(p.assignedPosition);
      if (l && (p.championId > 0 || (p.championPickIntent ?? 0) > 0)) lanes.add(l);
    }
    // Sans ça, seuls 6 champions ont un matchup : les autres ne sont jugés que sur leur winrate global
    const all = myId ? guideCounters(this.roleGuide(myId, lane), myId) : [];
    const known = mine && all.length ? { ...mine, losesTo: all, beats: [] } : mine;
    const options = banOptions({ meta, lanes: [...lanes], myLane: lane, mine: known, excluded, idOf: this.championIdByName() }).map((o) => ({
      id: o.id,
      name: this.champName(o.id, o.name),
      gain: o.gain,
      laneLabel: LANE_LABEL[o.lane],
      share: o.share,
      myWinRate: o.myWinRate,
      winRate: o.winRate,
      change: this.srChange(o.id),
    }));
    return { myTurn: own.isInProgress, hovered: own.championId, lanes: lanes.size, options };
  }

  /** Survole un ban conseillé. Ne le valide jamais : la confirmation reste dans le client. */
  async hoverBan(championId: number): Promise<{ ok: boolean; message: string }> {
    const lcu = this.lcu;
    if (!lcu) return { ok: false, message: 'Pas de champ select en cours' };
    const name = this.champName(championId);
    const session = await lcu.get<RawSession>('/lol-champ-select/v1/session');
    const own = (session?.actions ?? []).flat().find((a) => a.actorCellId === session?.localPlayerCellId && a.type === 'ban' && !a.completed);
    if (!own?.isInProgress) return { ok: false, message: 'Ce n’est pas ton tour de bannir' };
    const ok = await hoverBanAction(lcu, own, championId);
    const message = ok ? `${name} survolé : confirme le ban dans le client` : `Le client a refusé ${name}`;
    this.log(ok ? 'success' : 'warning', message);
    await this.tick();
    return { ok, message };
  }

  /** Build Faille depuis OP.GG : départ, cœur, 4e/5e/6e items classés par borne basse de confiance, bottes, runes, sorts, compétences. */
  private async srBuildPanel(id: number, laneOverride?: Lane, modeOverride?: ReturnType<typeof opggModeOf>): Promise<BuildPanel | null> {
    const lane = laneOverride ?? (await this.myLane(id));
    const mode = modeOverride ?? opggModeOf(this.state.queueId);
    const swift = !modeOverride && SLOT_QUEUES.has(this.state.queueId ?? 0);
    const key = `${id}-sr-${lane}-${mode}${swift ? '-swift' : ''}`;
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
    const slotRows = (list: OpggAnalysis['fourth']) => list.filter((x) => x.ids[0]).map((x) => ({ id: x.ids[0], winrate: x.winrate, games: x.games }));
    const queue = modeOverride ? 'Classée' : (QUEUE_LABEL[this.state.queueId ?? 0] ?? 'Faille');
    const starter = swift ? swiftplayStarter(a?.starter?.ids ?? []) : (a?.starter?.ids ?? []);
    const panel: BuildPanel = {
      championId: id,
      championName: this.champName(id),
      mode: 'sr',
      change: this.srChange(id) ?? null,
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
      slotStats: a ? { 4: slotRows(a.fourth), 5: slotRows(a.fifth), 6: slotRows(a.sixth) } : undefined,
      cores: core.length ? [{ name: 'OP.GG', core: core.map(itemOf), options, winrate: a!.core!.winrate, games: a!.core!.games }] : [],
      boots: a?.boots ? [stat(a.boots)] : [],
      starter: starter.map(itemOf),
      starterSwapped: swift && starter.some((x, i) => x !== a?.starter?.ids[i]),
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
    // Swiftplay : `position` n'est pas confirmée en partie, le rôle donné au faux champ select vaut pour la partie
    const lane = laneOf(mine?.position) ?? (mine ? this.lane : null);
    if (!snap || !mine || !lane) return this.state.counters?.lane ?? null;
    this.lane = lane;
    const foes = snap.players.filter((p) => p.team !== mine.team);
    const smite = foes.find((p) => hasSmite(p.summonerSpells));
    // Le Châtiment dit le jungler adverse à coup sûr, là où le rôle deviné se trompe sur un jungler atypique
    const opp = foes.find((p) => laneOf(p.position) === lane) ?? (lane === 'jungle' ? smite : undefined);
    const guessed = !opp && !foes.some((p) => laneOf(p.position));
    const oppId = opp ? snap.champOf(opp) : guessed ? await this.guessOpponent(foes.map(snap.champOf).filter(Boolean), lane, smite ? snap.champOf(smite) : 0) : 0;
    if (!oppId) return null;
    const [a, b] = await Promise.all([this.srAnalysis(myId, lane), this.srAnalysis(oppId, lane)]);
    const m = matchupFrom(a, b, myId, oppId);
    const view: MatchupView = m ? this.matchupView(oppId, m, guessed) : { opponent: { id: oppId, name: this.champName(oppId) }, myWinRate: 0.5, games: 0, lo: 0, hi: 1, verdict: 'incertain', guessed };
    return this.withGuide(view, myId, lane);
  }

  /** Aucun rôle adverse donné par le jeu : on le devine une fois par partie (OP.GG), pas à chaque lecture. */
  private async guessOpponent(foes: number[], lane: Lane, jungler = 0): Promise<number> {
    const key = `${lane}|${[...foes].sort((a, b) => a - b).join(',')}`;
    if (this.guessedOpp?.key === key) return this.guessedOpp.id;
    const lanes = await this.opggData.guessLanes(foes.map((id) => this.opggWho(id)), new Map<number, Lane>(jungler ? [[jungler, 'jungle']] : [])).catch(() => new Map<number, Lane>());
    const id = foes.find((f) => lanes.get(f) === lane) ?? 0;
    this.guessedOpp = { key, id };
    return id;
  }

  private opggWho(id: number): { id: number; name: string } {
    return { id, name: this.meta.champion(id)?.name_en || this.champName(id) };
  }

  /** Les 2 équipes placées par rôle : le jeu, puis le salon et le Châtiment, puis la méta OP.GG (marqué deviné). */
  private async placeTeam(players: LivePlayer[], snap: LiveSnap, read: (p: LivePlayer, id: number) => Lane | null): Promise<LanePlayer[]> {
    const ids = players.map(snap.champOf).filter(Boolean);
    const sure = new Map<number, Lane>();
    for (const p of players) {
      const id = snap.champOf(p);
      const lane = id ? read(p, id) : null;
      if (lane && ![...sure.values()].includes(lane)) sure.set(id, lane);
    }
    const lanes = sure.size === ids.length ? sure : await this.opggData.guessLanes(ids.map((id) => this.opggWho(id)), sure).catch(() => sure);
    return ids.map((id) => ({ id, name: this.champName(id), lane: sure.get(id) ?? lanes.get(id) ?? null, sure: sure.has(id) }));
  }

  /** Une lecture par duel, une fois par partie. OP.GG injoignable : nouvel essai au tick suivant la minute. */
  private async loadLaneMap(snap: LiveSnap, key: string): Promise<void> {
    const mine = snap.mine!;
    const myId = snap.champOf(mine);
    const team = snap.players.filter((p) => p.team === mine.team);
    const foes = snap.players.filter((p) => p.team !== mine.team);
    const allies = await this.placeTeam(team, snap, (p, id) => laneOf(p.position) ?? (id === myId ? this.lane : null) ?? this.allyLanes.get(id) ?? null);
    const smite = foes.find((p) => hasSmite(p.summonerSpells));
    const enemies = await this.placeTeam(foes, snap, (p) => laneOf(p.position) ?? (p === smite ? 'jungle' : null));
    const pairs = pairLanes(allies, enemies, myId);
    await Promise.all(pairs.map(async (p) => {
      const k = `${p.ally.id}|${p.enemy.id}|${p.lane}`;
      if (this.laneRates.get(k)) return;
      const raw = await this.opggData.matchupGuide(this.guideWho(p.ally.id), this.guideWho(p.enemy.id), p.lane).catch(() => null);
      this.laneRates.set(k, guideRate(readGuide(raw, p.lane), null, p.ally.id, p.enemy.id));
    }));
    if (this.laneMapKey !== key) return;
    this.lanePairs = pairs;
    const panel = laneMapPanel(pairs, (p) => this.rateOfPair(p));
    this.persistLog('info', `Duels de la partie : ${panel ? panel.rows.map((r) => `${r.laneLabel} ${r.ally.name}-${r.enemy.name} ${r.rate == null ? '?' : Math.round(r.rate * 100)}${r.guessed ? ' (deviné)' : ''}`).join(', ') : `${pairs.length} duel(s) sans chiffre`}`);
  }

  private rateOfPair(p: LanePair): LaneRate | null {
    return this.laneRates.get(`${p.ally.id}|${p.enemy.id}|${p.lane}`) ?? null;
  }

  /** Les duels de la partie, Faille seulement, jusqu'à 15 min. Ne bloque jamais l'écran : ils arrivent quand OP.GG a répondu. */
  private laneMapView(snap: LiveSnap | null): LaneMapPanel | null {
    if (this.state.mode !== 'sr' || !snap?.mine) return null;
    const team = (side: boolean) => snap.players.filter((p) => (p.team === snap.mine!.team) === side).map(snap.champOf).filter(Boolean).sort((a, b) => a - b);
    const key = `${team(true).join(',')}|${team(false).join(',')}`;
    if (!team(true).length || !team(false).length) return null;
    if (this.laneMapKey !== key) {
      this.laneMapKey = key;
      this.lanePairs = null;
      void this.loadLaneMap(snap, key).catch(() => setTimeout(() => { if (this.laneMapKey === key) this.laneMapKey = ''; }, 60_000));
    }
    if (!this.lanePairs || (this.lastGameTime ?? 0) >= LANE_MAP_END_SEC) return null;
    return laneMapPanel(this.lanePairs, (p) => this.rateOfPair(p));
  }

  /** Ajoute le guide s'il est déjà là, et le demande sinon : OP.GG ne doit pas retarder le reste de l'écran. */
  private withGuide(view: MatchupView, myId: number, lane: Lane): MatchupView {
    const short = SLOT_QUEUES.has(this.state.queueId ?? 0);
    const key = `${myId}|${view.opponent.id}|${lane}|${short ? 1 : 0}`;
    if (!this.guides.has(key)) {
      this.guides.set(key, null);
      void this.loadGuide(key, myId, view.opponent.id, lane, short).catch(() => setTimeout(() => this.guides.delete(key), 60_000));
    }
    // L'analyse OP.GG ne connaît que 6 matchups par champion : le guide comble les autres
    const rate = view.games ? null : this.laneRates.get(`${myId}|${view.opponent.id}|${lane}`);
    const filled = rate ? this.matchupView(view.opponent.id, rate, view.guessed) : view;
    const guide = this.guides.get(key);
    return guide ? { ...filled, guide } : filled;
  }

  private guideWho(id: number): { id: number; name: string; alias?: string; names: string[] } {
    const name = this.opggWho(id).name;
    const alias = this.game.championAlias(id);
    return { id, name, alias, names: [name, this.champName(id), alias ?? ''].filter(Boolean) };
  }

  private async loadGuide(key: string, myId: number, oppId: number, lane: Lane, short: boolean): Promise<void> {
    const me = this.guideWho(myId);
    const them = this.guideWho(oppId);
    // Ces 2 réponses donnent aussi les matchups complets : pas d'appel en double pour les counter-picks
    const roles = [[`${myId}|${lane}`, myId], [`${oppId}|${lane}`, oppId]] as const;
    for (const [k] of roles) if (!this.roleGuides.has(k)) this.roleGuides.set(k, null);
    const [rawMine, rawTheirs] = await Promise.all([this.opggData.matchupGuide(me, them, lane), this.opggData.matchupGuide(them, me, lane)]);
    if (rawMine == null) throw new Error('guide OP.GG absent');
    if (this.guideCaptures < 3) {
      this.guideCaptures++;
      await this.opgg.dump(`opgg-matchup-${me.name}-${them.name}.json`.replace(/[^a-zA-Z0-9.-]/g, '_'), { lane, mine: rawMine, theirs: rawTheirs }).catch(() => undefined);
    }
    const mine = readGuide(rawMine, lane);
    const theirs = readGuide(rawTheirs, lane);
    if (mine) this.roleGuides.set(roles[0][0], mine);
    if (theirs) this.roleGuides.set(roles[1][0], theirs);
    this.laneRates.set(`${myId}|${oppId}|${lane}`, guideRate(mine, theirs, myId, oppId));
    const guide = buildGuide(mine, theirs, me, { ...them, name: this.champName(oppId) }, short);
    this.guides.set(key, guide);
    this.usage.add({
      type: 'lane_guide', at: Date.now(), championId: myId, opponentId: oppId, lane, queueId: this.state.queueId ?? null,
      pace: !!guide?.pace, tips: guide?.tips.length ?? 0, style: !!guide?.style, laneEdge: guide?.laneEdge ?? null, killEdge: guide?.killEdge ?? null,
      unread: [mine?.laneAdvantage != null && !guide?.laneEdge ? 'lane' : '', mine?.soloKillAdvantage != null && !guide?.killEdge ? 'kill' : ''].filter(Boolean),
    });
    this.persistLog('info', `Guide de lane contre ${them.name} : ${guide?.pace?.text ?? 'rythme sans écart net'}, ${guide?.tips.length ?? 0} conseil(s)`);
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
    this.usage.add({ type: 'game_end', at: Date.now(), gameId, durationSec: game.durationSec, win: game.win, ...endFlags(detail!, this.puuid) });
    if (this.state.headliner && game.mode === 'mayhem') game.headliner = this.state.headliner.key;
    if (game.mode === 'sr' && !game.position && this.lane) game.position = this.lane;
    const remake = isRemake(game);
    const review = this.reviewOfGame(game.augments);
    if (review) game.review = review;
    const buys = reviewBuys(this.buysThisGame.filter((e) => e.championId === game.championId), (id) => this.itemName(id));
    if (buys) game.buys = buys;
    this.buysThisGame = [];
    this.deferredThisGame.clear();
    await this.history.add(game);
    this.recordPicks(gameId, game.augments, game.win, remake);
    const scored = this.lastCandidates.find((c) => c.championId === game.championId);
    if (scored && !remake) this.usage.add({ type: 'champ_scored', at: Date.now(), gameId, championId: scored.championId, score: scored.score, winrate: scored.winrate, synergy: scored.parts?.synergy ?? 0, comp: scored.parts?.comp ?? 0, win: game.win });
    if (this.skillTrack?.taken && !remake) {
      const { taken, partial } = this.skillTrack;
      const plan = this.state.build?.skills;
      this.usage.add({ type: 'skills_taken', at: Date.now(), gameId, championId: game.championId, taken, partial, win: game.win, ...(plan?.order.length && !partial ? { plan: plan.order.join(''), off: pointsOffPlan(taken, plan.order, plan.max) } : {}) });
    }
    this.skillTrack = null;
    if (this.goldSamples.size && !remake) this.usage.add({ type: 'gold_gap', at: Date.now(), gameId, mode: game.mode, samples: [...this.goldSamples.values()], win: game.win });
    this.goldSamples.clear();
    if (this.lanePairs && !remake) this.usage.add({ type: 'lane_map', at: Date.now(), gameId, rows: this.lanePairs.map((p) => ({ lane: p.lane, ally: p.ally.id, enemy: p.enemy.id, mine: p.mine, guessed: p.guessed, rate: this.rateOfPair(p)?.myWinRate ?? null, games: this.rateOfPair(p)?.games ?? 0 })), win: game.win });
    if (this.csSamples.size && !remake) this.usage.add({ type: 'cs_gap', at: Date.now(), gameId, lane: this.lane, opponent: this.state.counters?.lane?.opponent.id ?? null, guessed: !!this.state.counters?.lane?.guessed, samples: [...this.csSamples.values()], win: game.win });
    this.csSamples.clear();
    this.log('success', `Partie enregistrée : ${this.champName(game.championId)} (${remake ? 'annulée' : game.win ? 'victoire' : 'défaite'}, ${game.augments.length} augments)`);
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

  private panelRows(p: AugmentPanel): Map<number, AugmentRow> {
    const rows = new Map<number, AugmentRow>();
    for (const r of ['kPrismatic', 'kGold', 'kSilver'] as Rarity[]) for (const a of [...(p.all?.[r] ?? []), ...p.top[r], ...p.avoid[r]]) rows.set(a.id, a);
    return rows;
  }

  /** Cartes proposées et leur valeur au moment du choix (la même que le conseil en partie), pour la revue. */
  private reviewCards(p: AugmentPanel, ids: number[], round: number | null, fit?: Record<number, { delta: number }>): ReviewCard[] {
    const rows = this.panelRows(p);
    for (const a of this.estimatedRows(ids, p)) if (!rows.has(a.id)) rows.set(a.id, a);
    return ids.flatMap((id) => {
      const a = rows.get(id);
      if (!a) return [];
      const value = ((round ? a.rounds?.[round - 1] : null) ?? a.winrate) + (fit?.[id]?.delta ?? 0);
      return [{ id, name: a.name, value, games: a.games, estimated: !!a.estimated }];
    });
  }

  /** Revue des choix de la partie qui vient de finir (cartes lues à l'écran), à garder avec la partie. */
  private reviewOfGame(augments: number[]): GameReview | null {
    const choices = settleOffers([...this.offersThisGame.values()], augments)
      .filter(({ offer }) => offer.cards.length)
      .map(({ offer, picked }) => {
        const c = reviewChoice(offer.round, offer.cards, picked, offer.choice);
        const d = offer.draw;
        const reroll = picked != null && d?.pool ? reviewDraw(d.steps, d.pool, d.upgraded ?? null) : null;
        return reroll ? { ...c, reroll } : c;
      });
    const review = reviewGame(choices);
    return review && { ...review, rerollsDone: true };
  }

  /**
   * Parties jouées avant la revue : `usage.json` garde les cartes proposées et la carte prise, mais pas leur valeur.
   * On les note avec les stats actuelles (marqué `approx`). Sans stats pour un champion, la partie reste sans revue.
   */
  async backfillReviews(): Promise<number> {
    if (this.backfilling || !this.meta.tierList) return 0;
    this.backfilling = true;
    try {
      const picks = new Map<number, Extract<UsageEvent, { type: 'card_picked' }>[]>();
      for (const e of this.usage.events) if (e.type === 'card_picked') picks.set(e.gameId, [...(picks.get(e.gameId) ?? []), e]);
      const found = new Map<number, GameReview>();
      for (const g of this.history.games) {
        const list = picks.get(g.gameId);
        if (g.review?.rerollsDone || g.mode !== 'mayhem' || !list) continue;
        const panel = await this.augmentPanel(g.championId);
        if (!panel) continue;
        const review =
          g.review ??
          reviewGame(
            list.filter((e) => !e.ids.every((id) => id >= 3170 && id < 3200)).map((e) => reviewChoice(e.round, this.reviewCards(panel, e.ids, e.round), e.picked, e.choice)),
            true,
          );
        if (review) found.set(g.gameId, this.withOldRerolls(review, g, list, panel));
      }
      const bought = await this.backfillBuys();
      if (!found.size && !bought.size) return 0;
      await this.history.setReviews(found, bought);
      this.state.reviews = (this.state.reviews ?? 0) + found.size + bought.size;
      if (found.size) this.persistLog('info', `Revue des choix : ${found.size} ancienne${found.size > 1 ? 's' : ''} partie${found.size > 1 ? 's' : ''} notée${found.size > 1 ? 's' : ''}`);
      if (bought.size) this.persistLog('info', `Revue des achats : ${bought.size} ancienne${bought.size > 1 ? 's' : ''} partie${bought.size > 1 ? 's' : ''} notée${bought.size > 1 ? 's' : ''}`);
      this.emitIfChanged();
      return found.size + bought.size;
    } catch (e) {
      this.persistLog('warning', `Revue des anciennes parties impossible : ${(e as Error).message}`);
      return 0;
    } finally {
      this.backfilling = false;
    }
  }

  /** Partie d'avant la v1.66 : ses relances se relisent dans `cards_seen`, avec les stats actuelles. */
  private withOldRerolls(review: GameReview, g: HistoryGame, picks: Extract<UsageEvent, { type: 'card_picked' }>[], panel: AugmentPanel): GameReview {
    const seen = this.usage.events.filter((e): e is Extract<UsageEvent, { type: 'cards_seen' }> => e.type === 'cards_seen');
    const choices = review.choices.map((c) => {
      const pick = picks.find((e) => e.round === c.round && (e.choice ?? 0) === (c.choice ?? 0) && e.picked === c.picked);
      if (!pick || c.picked == null) return c;
      const steps = drawFromSeen(seen, { championId: g.championId, round: c.round, ids: pick.ids, from: g.createdAt, until: pick.at }).map((ids) => this.reviewCards(panel, ids, c.round));
      const rarity = steps[0] && this.drawRarity(steps[0].map((x) => x.id));
      if (!rarity) return c;
      const known = new Set([...steps[0].map((x) => x.id), ...seenBefore(seen, { championId: g.championId, from: g.createdAt, until: pick.at }, steps[0].map((x) => x.id))]);
      const up = g.headliner === 'commandline' ? NEXT_RARITY[rarity] : undefined;
      const reroll = reviewDraw(steps, this.poolValues(panel, rarity, known, c.round, false), up ? this.poolValues(panel, up, known, c.round, false) : null);
      return reroll ? { ...c, reroll } : c;
    });
    return { ...review, choices, rerollLost: choices.reduce((n, c) => n + rerollLostOf(c), 0), rerollsDone: true, rerollsApprox: true };
  }

  /** Rareté d'un tirage dont la lecture ne l'a pas gardée : celle de la majorité de ses cartes. */
  private drawRarity(ids: number[]): Rarity | null {
    const of = ids.map((id) => this.meta.tierList?.augs[String(id)]?.rarity);
    const rarity = of.find((r, i) => r && of.indexOf(r) !== i);
    return rarity === 'kPrismatic' || rarity === 'kGold' || rarity === 'kSilver' ? rarity : null;
  }

  /** Achats des parties Mayhem sans revue : `usage.json` les garde sans valeur, on prend les stats actuelles. */
  private async backfillBuys(): Promise<Map<number, BuyReview>> {
    const list = new Map<number, ItemBought[]>();
    const games = this.history.games.filter((g) => g.mode === 'mayhem' && !g.buys);
    for (const e of this.usage.events) {
      if (e.type !== 'item_bought') continue;
      const g = gameOfBuy(e, games);
      if (g) list.set(g.gameId, [...(list.get(g.gameId) ?? []), e]);
    }
    const out = new Map<number, BuyReview>();
    for (const g of games) {
      const events = list.get(g.gameId);
      if (!events) continue;
      const stats = (await this.buildPanel(g.championId, 'mayhem'))?.itemStats;
      const review = reviewBuys(events.map((e) => this.withValues(e, stats)), (id) => this.itemName(id), true);
      if (review) out.set(g.gameId, review);
    }
    return out;
  }

  private itemName(id: number): string {
    return this.game.item(id, this.meta.tierList?.itemLut?.[String(id)]?.e).name;
  }

  /** Meilleure carte parmi celles lues, d'après le winrate au moment du choix (comme l'affichage). */
  bestOffered(ids: number[]): number | null {
    const p = this.state.augments;
    if (!p) return null;
    const round = this.state.augRound;
    const rows = this.panelRows(p);
    const at = (a: AugmentRow) => (round ? a.rounds?.[round - 1] : null) ?? a.winrate;
    for (const a of this.state.offered?.extra ?? []) if (!rows.has(a.id)) rows.set(a.id, a);
    const known = ids.map((id) => rows.get(id)).filter((a): a is AugmentRow => !!a);
    const fit = (a: AugmentRow) => this.state.offered?.fit?.[a.id]?.delta ?? 0;
    // Même règle qu'à l'écran (`presentOfferedCards`) : une seule carte mesurée sur 3 ne fait pas un conseil
    if (ids.length === 3 && known.length < 2) return null;
    return known.length ? known.sort((a, b) => at(b) + fit(b) - (at(a) + fit(a)))[0].id : null;
  }

  /** Noms des cartes lues sans aucune ligne de stats, ni pour ce champion ni dans la tier list : hors classement. */
  private withoutStats(read: CardRead, kind: OfferSlot['kind']): string[] {
    const p = this.state.augments;
    if (!p || read.unsure || kind !== 'augment') return [];
    const rows = this.panelRows(p);
    const extra = new Set((this.state.offered?.extra ?? []).map((a) => a.id));
    return read.names.filter((_, i) => !rows.has(read.ids[i]) && !extra.has(read.ids[i]));
  }

  /** Valeur d'un augment au moment du choix, comme dans le classement affiché. */
  private rowValue(a: AugmentRow, fit?: Record<number, { delta: number }>, round = this.state.augRound): number {
    return ((round ? a.rounds?.[round - 1] : null) ?? a.winrate) + (fit?.[a.id]?.delta ?? 0);
  }

  /** Retire d'une lecture complète les cartes vues à un choix précédent : elle redevient partielle, donc sans conseil. */
  private withoutGhosts(read: CardRead): CardRead {
    const d = this.draw;
    if (!d || read.unsure) return read;
    const ghosts = ghostCards(read.ids, d, this.state.augRound);
    if (!ghosts.length) return read;
    this.persistLog('jeu', `Carte déjà vue retirée de la lecture : ${ghosts.map((i) => read.names[i]).join(', ')}`);
    const keep = <T,>(xs: T[]) => xs.filter((_, i) => !ghosts.includes(i));
    const ids = keep(read.ids);
    return { ...read, ids, names: keep(read.names), unsure: `${ids.length} cartes sur 3 reconnues` };
  }

  /**
   * Suit les relances du tirage en cours (une carte nouvelle à côté de cartes gardées) et donne le conseil. Une carte
   * relancée avant la 1re lecture n'est pas vue comme telle : le bouton en jeu fait foi.
   */
  private rerollAdvice(read: CardRead): RerollAdvice | null {
    const panel = this.state.augments;
    const round = this.state.augRound;
    const d = this.draw;
    if (d && d.round === round && d.ids.some((id) => read.ids.includes(id))) {
      for (const id of read.ids) {
        if (!d.ids.includes(id)) d.rolled.add(id);
        d.seen.add(id);
      }
      d.ids = read.ids;
    } else {
      // Une carte vue dans un choix précédent ne revient pas de la partie (0 sur 439, 17 attendues) : `seen` couvre toute la partie
      this.draw = { round, rarity: read.rarity, ids: read.ids, rolled: new Set(), jumps: new Set(), stayed: d?.stayed ?? false, seen: new Set([...(d?.seen ?? []), ...read.ids]), before: new Set(d?.seen), steps: [] };
    }
    const draw = this.draw!;
    this.noteRarityJump(read, draw);
    if (!panel || !draw.rarity || read.ids.length !== 3) return null;
    draw.steps.push(this.reviewCards(panel, read.ids, round, this.state.offered?.fit));
    const rows = this.panelRows(panel);
    for (const a of this.state.offered?.extra ?? []) if (!rows.has(a.id)) rows.set(a.id, a);
    const fit = this.state.offered?.fit;
    const cards = measuredCards(read.ids.map((id) => {
      const a = rows.get(id);
      return { id, value: a ? this.rowValue(a, fit) : null, rolled: draw.rolled.has(id) };
    }));
    if (!cards) return null;
    const up = this.state.headliner?.key === 'commandline' && !draw.rolled.size ? NEXT_RARITY[draw.rarity] : undefined;
    const pool = this.poolValues(panel, draw.rarity, draw.seen);
    const upgraded = up ? this.poolValues(panel, up, draw.seen) : null;
    draw.pool ??= pool;
    if (draw.upgraded === undefined) draw.upgraded = upgraded;
    return adviseReroll(
      cards,
      pool,
      upgraded,
    );
  }

  /**
   * Une carte a un cran d'avance sur les 2 autres : c'est Command Line, même si la bannière a été ratée (2 lues sur 4 le 3 nov.).
   * La relance qui monte est alors faite, y compris si elle a eu lieu avant la 1re lecture : le conseil ne doit plus la compter.
   */
  private noteRarityJump(read: CardRead, draw: DrawTrack): void {
    if (this.state.mode !== 'mayhem') return;
    const rarities = read.ids.map((id, i) => this.rarityOfCard(id, read.names[i]));
    const at = rarityJump(rarities);
    if (at == null) {
      // Une relance est restée dans sa rareté : pas de Command Line à déduire dans cette partie (Xin Zhao, 3 nov.)
      if (draw.rolled.size && draw.rarity && NEXT_RARITY[draw.rarity] && rarities.every((r) => r === draw.rarity)) draw.stayed = true;
      return;
    }
    const id = read.ids[at];
    if (draw.jumps.has(id)) return;
    draw.jumps.add(id);
    const known = this.state.headliner?.key ?? null;
    const roll = draw.rolled.size;
    this.usage.add({ type: 'rarity_jump', at: Date.now(), championId: this.state.augments?.championId ?? 0, round: draw.round, id, roll, known, ...(draw.stayed ? { stayed: true } : {}) });
    if ((known && known !== 'commandline') || (!known && draw.stayed)) {
      this.persistLog('jeu', `Carte d'un cran au-dessus (${read.names[at]}) : pas Command Line, ${known ? `headliner ${this.state.headliner?.name}` : 'une relance est restée dans sa rareté'}`);
      return;
    }
    if (!known) this.setHeadliner(headlinerByKey('commandline')!, 'cartes', read.names[at]);
    draw.rolled.add(id);
    // Le 1er passage du tirage ignorait encore le headliner : la revue doit juger la relance avec le cran du dessus
    const up = draw.rarity && NEXT_RARITY[draw.rarity];
    const panel = this.state.augments;
    if (roll <= 1 && !draw.upgraded && up && panel && draw.steps.length) draw.upgraded = this.poolValues(panel, up, draw.seen);
  }

  /** Valeurs des cartes encore possibles d'une rareté : le pool du champion, plus les cartes rares sur lui, estimées, sans `seen`. */
  private poolValues(panel: AugmentPanel, rarity: Rarity, seen: Set<number>, round = this.state.augRound, live = true): number[] {
    const others = Object.entries(this.meta.tierList?.augs ?? {})
      .filter(([id, a]) => a.rarity === rarity && offerKind([Number(id)]) === 'augment' && this.game.augmentExists(Number(id)))
      .map(([id]) => Number(id));
    const melee = live && isMelee(this.liveRange);
    const rows = [...(panel.all?.[rarity] ?? []), ...this.estimatedRows(others, panel)].filter((a) => !seen.has(a.id) && this.augInfo.drawable(a.name, melee));
    const fit = live ? this.fitFor(rows.map((a) => a.id), rows.map((a) => a.name)) : undefined;
    return rows.map((a) => this.rowValue(a, fit, round));
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
    // Deux champions différents : la 1re capture (Ahri contre Ahri) avait tous les champs du guide à null
    await this.opggData.matchupGuide({ name: 'Ahri' }, { name: 'Zed' }, 'mid').then((r) => this.opgg.dump('opgg-sample-matchup-ahri-zed.json', r)).catch(() => undefined);
    // Stats d'augments ARAM d'OP.GG : Mayhem ou pas, et plus à jour qu'arammeta après un patch ? Jamais lu, capture seule.
    await this.opgg.call('lol_list_aram_augments', { champion_id: 103, lang: 'en_US', desired_output_fields: ['champion_id', 'data.augments[].{desc,id,name,performance,popular,tier}'] })
      .then((r) => this.opgg.dump('opgg-sample-aram-augments.json', r)).catch((e) => this.opgg.dump('opgg-sample-aram-augments.json', { error: (e as Error).message }));
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
    if (!b) return undefined;
    const itemName = (id: number) => this.game.item(id, this.meta.tierList?.itemLut?.[String(id)]?.e).name;
    const out: Record<number, { delta: number; why: string | null; good: boolean }> = {};
    ids.forEach((id, i) => {
      const name = names[i] ?? this.augName(id);
      const f = boundFit(name, b.owned, b.planned, itemName) ?? (this.augInfo.size ? fitWithAlternatives(this.augInfo.tags(name), b.profile, b.alternatives, b.seen) : null);
      if (f?.delta) out[id] = f;
    });
    return Object.keys(out).length ? out : undefined;
  }

  /** Ce que ta partie dit d'une carte : 1er item légendaire (itembound.ts), cartes qui dépendent de ton état (cardhints.ts). */
  private cardHints(ids: number[]): Record<number, string> | undefined {
    if (this.state.mode !== 'mayhem') return undefined;
    const b = this.buildFit;
    const legendary = b?.legendary;
    const hasteItems = b ? [...b.planned].filter((i) => !b.owned.has(i) && hasHaste(this.game.categories(i))).length : null;
    const out: Record<number, string> = {};
    for (const id of ids) {
      const name = this.augNameEn(id);
      const hint = (legendary ? legendaryHint(name, legendary) : null) ?? newCardHint(name, { haste: this.liveCard?.haste ?? null, hasteItems, ultimate: this.liveCard?.ultimate ?? null });
      if (hint) out[id] = hint;
    }
    return Object.keys(out).length ? out : undefined;
  }

  /** Cartes absentes des données du champion : winrate estimé avec l'effet moyen de l'augment (tous champions). */
  private estimatedRows(ids: number[], p: AugmentPanel | null = this.state.augments): AugmentRow[] {
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

  /** Numéro de « situation » : change à chaque sortie de partie, déconnexion. */
  private readSeq = 0;

  /**
   * Contexte d'une lecture d'écran, à prendre AVANT la capture : partie, champion et choix d'augment en cours.
   * Une capture + reconnaissance prend plusieurs secondes ; si le contexte a changé entre-temps (fin de partie,
   * nouveau champion, passage de niveau 7 / 11 / 15), le résultat est jeté au lieu d'être collé à la mauvaise
   * situation. null = rien à lire maintenant.
   */
  readContext(): string | null {
    const champ = this.state.augments?.championId ?? 0;
    if (!champ || this.state.mode !== 'mayhem') return null;
    return `${this.readSeq}:${champ}:${this.state.augRound ?? 0}`;
  }

  /** Le contexte pris avant une lecture est-il toujours celui en cours ? (undefined = pas de contrôle) */
  isCurrentRead(context: string | null | undefined): boolean {
    return context === undefined || (context !== null && context === this.readContext());
  }

  /**
   * Résultat d'une lecture d'écran (null = plus de cartes à l'écran). `context` : valeur de `readContext()` prise
   * avant la capture ; une lecture devenue périmée est ignorée (renvoie false).
   */
  setOffered(read: CardRead | null, context?: string | null): boolean {
    if (read && !this.isCurrentRead(context)) {
      this.persistLog('jeu', `Lecture des cartes ignorée : la partie a changé pendant la lecture (${read.names.join(' · ')})`);
      return false;
    }
    if (!read) {
      if (!this.state.offered) return true;
      this.state.offered = null;
      this.emitIfChanged();
      return true;
    }
    read = this.withoutGhosts(read);
    if (!read.unsure)
      for (const name of unknownBound(read.names))
        if (!this.unknownBoundSeen.has(name)) {
          this.unknownBoundSeen.add(name);
          this.persistLog('warning', `Augment lié à un item inconnu de l'app : ${name}`);
          this.usage.add({ type: 'bound_unknown', at: Date.now(), name });
        }
    for (const text of read.misses)
      if (!this.missesThisGame.has(text) && this.missesThisGame.size < 30) {
        this.missesThisGame.add(text);
        this.usage.add({ type: 'ocr_miss', at: Date.now(), text });
      }
    const prev = this.state.offered;
    if (prev && prev.ids.join() === read.ids.join() && prev.unsure === read.unsure) return true;
    const extra = this.estimatedRows(read.ids);
    this.state.offered = { ids: read.ids, names: read.names, rarity: read.rarity, unsure: read.unsure, at: Date.now(), ...(extra.length ? { extra } : {}) };
    this.state.offered.fit = this.fitFor(read.ids, read.names);
    this.state.offered.hints = this.cardHints(read.ids);
    const best = read.unsure ? null : this.bestOffered(read.ids);
    const kind = offerKind(read.ids);
    const round = this.state.augRound;
    const combos = kind === 'augment' && this.state.mode === 'mayhem' && this.state.augments ? this.comboNotes(this.state.augments.championId, read.ids, this.assumedBefore(round)) : {};
    if (Object.keys(combos).length) this.state.offered.combos = combos;
    const changes = kind === 'augment' && this.state.mode === 'mayhem' ? this.patchChanges(read.ids) : {};
    if (Object.keys(changes).length) this.state.offered.changes = changes;
    const reroll = read.unsure || kind !== 'augment' ? null : protectCombos(this.rerollAdvice(read), combos);
    this.state.offered.reroll = reroll;
    const noText = this.augInfo.size && kind === 'augment' ? read.names.filter((n) => !this.augInfo.has(n)) : [];
    const noStats = this.withoutStats(read, kind);
    this.persistLog('jeu', `Cartes lues (choix ${round ?? '?'}) : ${read.names.join(' · ')}${read.unsure ? ` — ${read.unsure}` : best != null ? ` → conseil : ${this.augName(best)}` : ''}${reroll && reroll.kind !== 'keep' ? ` ; relance : ${reroll.targets.map((id) => this.augName(id)).join(', ')} (+${(reroll.gain * 100).toFixed(1)} pt)` : ''}${Object.keys(combos).length ? ` ; combos : ${Object.entries(combos).map(([id, c]) => `${this.augName(Number(id))} (${c.label})`).join(', ')}` : ''}${Object.keys(changes).length ? ` ; modifiées au patch : ${Object.entries(changes).map(([id, c]) => `${this.augName(Number(id))} (${c.dir})`).join(', ')}` : ''}${noStats.length ? ` ; sans stats : ${noStats.join(', ')}` : ''}`);
    this.usage.add({ type: 'cards_seen', at: Date.now(), championId: this.state.augments?.championId ?? 0, round, ids: read.ids, best, unsure: !!read.unsure, rarity: read.rarity, ...(this.state.offered.hints ? { hints: Object.keys(this.state.offered.hints).map(Number) } : {}), ...(this.state.offered.fit ? { fit: Object.fromEntries(Object.entries(this.state.offered.fit).map(([id, f]) => [id, Math.round(f.delta * 10000) / 10000])) } : {}), ...(noText.length ? { noText } : {}), ...(noStats.length ? { noStats } : {}), ...(Object.keys(combos).length ? { combos: Object.fromEntries(Object.entries(combos).map(([id, c]) => [id, c.kind])) } : {}), ...(Object.keys(changes).length ? { changes: Object.fromEntries(Object.entries(changes).map(([id, c]) => [id, c.dir])) } : {}), ...(reroll ? { reroll: { kind: reroll.kind, targets: reroll.targets, gain: Math.round(reroll.gain * 10000) / 10000, upgrade: reroll.upgrade, pool: this.draw?.pool?.length } } : {}) });
    // Un même niveau peut proposer 2 choix (carte headliner Pentakill, augment en plus K/DA) : on les garde
    // séparément, sinon le 2e écrasait le 1er (vu en vraie partie le 28 oct.)
    const hl = read.unsure ? null : headlinerFromCards(read.ids);
    if (hl) this.setHeadliner(hl, 'cartes');
    if (!read.unsure) {
      const panel = this.state.augments;
      const cards = panel && kind === 'augment' ? this.reviewCards(panel, read.ids, round, this.state.offered.fit) : [];
      const same = [...this.offersThisGame.values()].filter((o) => o.round === round && o.kind === kind);
      const choice = offerChoice(same, read.ids);
      this.offersThisGame.set(`${round ?? 0}:${kind}:${choice}`, { round, ids: read.ids, best, cards, choice, kind, draw: kind === 'augment' ? this.draw : null });
    }
    this.emitIfChanged();
    return true;
  }

  /**
   * Bannière du début de partie passée sans headliner reconnu (appelé une fois par partie par la lecture d'écran) :
   * noté dans le journal et `usage.json` pour mesurer le taux de lecture et voir ce que Vision a lu à la place.
   */
  headlinerMissed(scans: number, near: string[]): void {
    if (this.state.headliner || this.state.mode !== 'mayhem') return;
    const championId = this.state.augments?.championId ?? 0;
    if (!championId) return;
    const seen = near.length ? ` ; textes approchants : ${near.map((t) => `« ${t} »`).join(', ')}` : '';
    this.persistLog('jeu', `Headliner non reconnu au début de partie (${scans} lecture${scans > 1 ? 's' : ''})${seen}`);
    this.usage.add({ type: 'headliner_miss', at: Date.now(), championId, scans, near: near.slice(0, 5) });
  }

  /** Nom de headliner lu après la bannière : il n'est pas retenu (boutique, tooltip), seulement noté pour vérifier la règle. */
  headlinerLate(h: HeadlinerInfo, text: string, afterS: number): void {
    if (this.state.mode !== 'mayhem') return;
    const known = this.state.headliner?.key ?? null;
    this.persistLog('jeu', `Texte « ${text} » ignoré : lu ${afterS} s après le début de partie, hors bannière${known ? ` (headliner ${this.state.headliner?.name})` : ''}`);
    this.usage.add({ type: 'headliner_late', at: Date.now(), championId: this.state.augments?.championId ?? 0, key: h.key, text, afterS, known });
  }

  /** La lecture peut arriver avant que le jeu donne la liste des joueurs : on vérifie dès qu'elle est connue. */
  dropSkinHeadliner(skins: string[]): void {
    const text = this.headlinerText;
    if (!text || !this.state.headliner || !isSkinText(text, skins)) return;
    this.persistLog('jeu', `Headliner ${this.state.headliner.name} retiré : « ${text} » est un nom de skin`);
    this.state.headliner = null;
    this.headlinerText = null;
    this.emitIfChanged();
  }

  /** Headliner reconnu en partie (bannière lue à l'écran, ou cartes propres au headliner). Le premier reconnu reste. */
  setHeadliner(h: HeadlinerInfo, source: 'écran' | 'cartes', text?: string, context?: string | null): void {
    if (this.state.headliner || !this.isCurrentRead(context)) return;
    this.headlinerText = source === 'écran' ? (text ?? null) : null;
    this.state.headliner = { key: h.key, name: h.name, source, tips: h.tips };
    this.persistLog('jeu', `Headliner : ${h.name} (${source === 'écran' ? `lu à l'écran : « ${text ?? h.name} »` : 'd’après les cartes'})`);
    this.usage.add({ type: 'headliner_seen', at: Date.now(), key: h.key, source, ...(text ? { text } : {}) });
    this.emitIfChanged();
  }

  /** Fin de partie : pour chaque choix lu à l'écran, quel augment a été pris, et était-ce la recommandation ? */
  private recordPicks(gameId: number, augments: number[], win: boolean, remake = false): void {
    if (!remake) this.logPicks(gameId, augments, win);
    this.leanThisGame = null;
    this.leanCore = null;
    this.boundThisGame.clear();
    this.offersThisGame.clear();
    this.draw = null;
  }

  private logPicks(gameId: number, augments: number[], win: boolean): void {
    for (const { offer: o, picked } of settleOffers([...this.offersThisGame.values()], augments))
      this.usage.add({ type: 'card_picked', at: Date.now(), gameId, round: o.round, ...(o.choice ? { choice: o.choice } : {}), ids: o.ids, best: o.best, picked, followed: picked != null && picked === o.best, win });
    for (const [id, t] of this.boundThisGame) this.usage.add({ type: 'item_bound', at: Date.now(), gameId, augment: id, item: t.item, picked: augments.includes(id), bought: t.bought, win });
    if (this.leanThisGame) {
      const { from, to, augments: assumed, bought } = this.leanThisGame;
      this.usage.add({ type: 'build_lean', at: Date.now(), gameId, from, to, augments: assumed, picked: assumed.some((id) => augments.includes(id)), bought, win });
    }
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
  abilities?: LiveAbilities;
  championStats?: { abilityHaste?: number; attackRange?: number };
  currentGold?: number;
  level?: number;
  riotId?: string;
  riotIdGameName?: string;
  summonerName?: string;
}

interface LivePlayer {
  skinName?: string;
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
  items?: { itemID: number; count?: number; consumable?: boolean; slot?: number }[];
  /** `creepScore` n'avance que par dizaines (16 captures sur 16, 3 nov.). */
  scores?: { kills?: number; deaths?: number; assists?: number; creepScore?: number };
  level?: number;
  summonerSpells?: { summonerSpellOne?: { rawDisplayName?: string; displayName?: string }; summonerSpellTwo?: { rawDisplayName?: string; displayName?: string } };
  /** Faille : arbres de runes visibles ; null en Mayhem (captures du 2 nov.). */
  runes?: { primaryRuneTree?: { id?: number }; secondaryRuneTree?: { id?: number } } | null;
}

const scrub = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(scrub)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /puuid|summonerId|accountId|gameName|tagLine|name/i.test(k) ? (x ? '·présent·' : x) : scrub(x)]))
      : v;

const LCU_POS: Record<Lane, string> = { top: 'TOP', jungle: 'JUNGLE', mid: 'MIDDLE', adc: 'BOTTOM', support: 'UTILITY' };

interface LiveSnap {
  me: LiveMe;
  players: LivePlayer[];
  mine: LivePlayer | null;
  champOf: (p: LivePlayer) => number;
}
