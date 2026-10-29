// Types partagés entre le processus principal (Electron) et l'interface (Vue).

export type Mode = 'aram' | 'mayhem' | 'sr';

export type Rarity = 'kPrismatic' | 'kGold' | 'kSilver';

export interface Reason {
  label: string;
  points: number; // en points de winrate (0.5 = +0,5 pt)
}

export interface Candidate {
  championId: number;
  name: string;
  source: 'card' | 'bench' | 'current' | 'trade';
  score: number; // total en points
  winrate: number | null; // winrate global (arammeta), 0..1
  games: number; // parties dans les données globales
  personal: { games: number; wins: number } | null;
  reasons: Reason[];
  actionable: boolean; // un clic peut le sélectionner maintenant
  balance?: { label: string; good: boolean }[]; // modificateurs ARAM du wiki (affichage seulement)
  balanceChange?: string; // ex. « modifié le 28/10 : dégâts −5 % → −10 % »
  mastery?: { level: number; points: number } | null; // ta maîtrise (tous modes), affichage seulement
}

export interface TeamNeeds {
  adShare: number; // part de dégâts physiques de l'équipe actuelle (0..1)
  lacks: string[]; // dimensions manquantes (en français)
  frontliners: number;
}

export interface ChampSelectView {
  mode: Mode;
  queueId: number;
  myChampionId: number;
  myChampionName: string;
  allies: { championId: number; name: string }[];
  candidates: Candidate[];
  cardsOpen: boolean; // fenêtre de choix des cartes ouverte
  needs: TeamNeeds;
  dataNote: string | null; // avertissement sur la fiabilité des données
  /** Coéquipiers déjà croisés (d'après ton historique) : Riot ID, parties ensemble, victoires. */
  mates?: { name: string; games: number; wins: number }[];
  /** Faille de l'invocateur (classée, normale, Swiftplay…) : rôle, matchup et counter-picks (OP.GG). */
  sr?: SrSelect | null;
}

/** Ton winrate contre l'adversaire de lane, avec l'intervalle de confiance à 95 % (Wilson). */
export interface MatchupView {
  opponent: { id: number; name: string };
  myWinRate: number;
  games: number;
  lo: number;
  hi: number;
  verdict: 'favorable' | 'défavorable' | 'serré' | 'incertain';
  /** Rôle de l'adversaire deviné (champ select : le client ne montre pas les rôles adverses). */
  guessed: boolean;
}

export interface SrSelect {
  lane: string | null;
  laneLabel: string | null;
  queueLabel: string;
  me: { id: number; name: string; locked: boolean; winRate: number; games: number; lo: number; hi: number; tier: number | null } | null;
  matchup: MatchupView | null;
  /** Champions qui battent ton adversaire de lane (seulement si tout l'intervalle de confiance est au-dessus de 50 %). */
  counterPicks: { id: number; name: string; winRate: number; games: number; lo: number; mastery: number | null }[];
  /** Ennemis connus pour bien jouer contre ton champion. */
  dangers: { id: number; name: string; myWinRate: number; games: number }[];
  note: string | null;
}

export interface AugmentRow {
  id: number;
  name: string;
  icon: string | null;
  winrate: number;
  lift: number;
  games: number;
  personal: { games: number; wins: number } | null; // tes parties avec cet augment (tous champions)
  /** Winrate estimé selon le choix (1 = début, 2 = niv. 7, 3 = niv. 11, 4 = niv. 15) ; null si inconnu. */
  rounds?: (number | null)[];
  /** Estimé (tous champions) faute de données sur ce champion. */
  estimated?: boolean;
}

export interface IconItem {
  id: number;
  name: string;
  icon: string | null;
}

export interface StatItem extends IconItem {
  winrate: number;
  games: number;
}

export interface NextBuyPanel {
  gold: number;
  buildName: string | null; // build suivi (celui qui recoupe tes items)
  /** D'où vient le build : winrate et parties (arammeta, Mayhem), nombre de builds fréquents pour ce champion. */
  buildInfo?: { winrate: number; games: number; count: number; adapted: string[] } | null;
  // step.price = dépense immédiate, après déduction des sous-composants possédés.
  rows: { item: IconItem; why: string; price: number | null; remaining?: number | null; missing: number; step?: { item: IconItem; price: number } }[];
  /** Ton parcours sur 6 places : items finis déjà achetés, puis la suite prévue. */
  plan?: { item: IconItem; owned: boolean; why?: string }[];
  /** Mort : secondes avant de réapparaître (le shop est ouvert). */
  respawn?: number | null;
}

export interface CounterPanel {
  gameKey: string;
  role: 'ad' | 'ap' | 'tank';
  enemies: TeamPlayer[]; // fed : « 8/1 » quand un ennemi est en avance
  allies?: TeamPlayer[];
  threats: { key: string; title: string; why: string; champions: { id: number; name: string }[]; items: IconItem[]; urgent?: boolean }[];
  /** Ce que les deux équipes changent à tes achats (anti-soins déjà pris, résistances empilées, ennemi en avance…). */
  notes?: string[];
  /** Faille : ton adversaire direct (même rôle d'après la partie en cours). */
  lane?: MatchupView | null;
}

export interface TeamPlayer {
  id: number;
  name: string;
  fed?: string;
  dmg?: 'AD' | 'AP' | 'mixte' | null;
  tags?: string[];
  kda?: string;
  items?: IconItem[]; // items finis, en direct
}

export interface BuildPanel {
  championId: number;
  championName: string;
  mode: Mode;
  runes: { primary: IconItem | null; secondary: IconItem | null; perks: IconItem[] } | null;
  spells: { items: IconItem[]; winrate: number; games: number }[];
  cores: { name: string; core: IconItem[]; options: StatItem[]; winrate: number; games: number }[];
  boots: StatItem[];
  singles?: StatItem[]; // items seuls très gagnants, hors builds affichés
  note: string | null;
  balance?: { label: string; good: boolean }[];
  /** Faille : départ, ordre des compétences, rôle, source et taille de l'échantillon. */
  starter?: IconItem[];
  skills?: { order: string[]; max: string[] } | null;
  lane?: string | null;
  source?: string;
  /** Faille : contre qui ce champion gagne / perd le plus dans ce rôle (OP.GG), avec la borne de confiance. */
  matchups?: { beats: MatchupRow[]; losesTo: MatchupRow[] };
}

export interface MatchupRow {
  id: number;
  name: string;
  winrate: number;
  games: number;
  lo: number;
  hi: number;
}

export interface AugmentPanel {
  championId: number;
  championName: string;
  patch: string;
  championWinrate: number | null;
  top: Record<Rarity, AugmentRow[]>;
  avoid: Record<Rarity, AugmentRow[]>;
  items: { name: string; winrate: number; games: number }[];
  /** Catégories d'augments qui marchent mieux / moins bien que la moyenne sur ce champion (lift vs champions proches). */
  types?: { good: { name: string; lift: number; games: number }[]; bad: { name: string; lift: number; games: number }[] };
  /** Augments souvent choisis mais perdants sur ce champion. */
  traps?: (AugmentRow & { pick: number })[];
  /** Tout le pool d'augments du champion par rareté, trié par winrate (pour retrouver les 3 cartes proposées). */
  all?: Record<Rarity, AugmentRow[]>;
  /** Augments que TU prends souvent et avec lesquels tu perds (tous champions, ≥ 4 parties). */
  myTraps?: { id: number; name: string; icon: string | null; games: number; wins: number }[];
}

export interface HistoryGame {
  gameId: number;
  queueId: number;
  mode: Mode;
  /** Faille : top / jungle / mid / adc / support (timeline du client). */
  position?: string;
  createdAt: number; // ms epoch
  durationSec: number;
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  augments: number[];
  // Détails ajoutés en v1.5 (absents des parties enregistrées avant : complétés depuis le client si possible)
  items?: number[];
  spells?: number[];
  level?: number;
  damage?: number; // dégâts aux champions
  taken?: number;
  healed?: number;
  gold?: number;
  cs?: number;
  teamKills?: number;
  multikill?: number;
  allies?: number[];
  enemies?: number[];
  allyNames?: string[]; // Riot ID des 4 coéquipiers (même ordre que allies)
  noDetail?: boolean; // détail introuvable dans le client
  /** Headliner Mayhem noté en direct (clé de headliner.ts, ex. « commandline ») : lu à l'écran ou d'après les cartes. */
  headliner?: string;
}

/** Ligne de l'onglet Historique (noms et icônes résolus). */
export interface HistoryEntry extends Omit<HistoryGame, 'headliner'> {
  championName: string;
  headliner: string | null; // headliner Mayhem de la partie (déduit de l'augment marqueur, ex. « Pentakill »)
  championWr: number | null; // winrate Mayhem global (arammeta) du champion, pour mesurer si suivre le classement paie
  augmentIcons: IconItem[];
  itemIcons: IconItem[];
}

export interface DetailPlayer {
  name: string;
  championId: number;
  championName: string;
  me: boolean;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  taken: number;
  healed: number;
  gold: number;
  cs: number;
  items: IconItem[];
  spells: IconItem[];
  augments: IconItem[];
}

export interface GameDetail {
  gameId: number;
  durationSec: number;
  teams: { teamId: number; win: boolean; kills: number; gold: number; players: DetailPlayer[] }[];
}

export interface ChampionStat {
  championId: number;
  name: string;
  games: number;
  wins: number;
  kda: number;
}

export interface AugmentStat {
  id: number;
  name: string;
  games: number;
  wins: number;
}

export interface MatchupStat {
  championId: number;
  name: string;
  games: number;
  wins: number; // tes victoires quand ce champion était là
}

export interface DuoStat {
  name: string; // Riot ID
  games: number;
  wins: number;
  champions: number[]; // ses champions les plus joués avec toi
}

export interface StatsView {
  total: number;
  byMode: Record<Mode, { games: number; wins: number }>;
  champions: ChampionStat[];
  augments: AugmentStat[];
  recent: (HistoryGame & { championName: string; augmentNames: string[] })[];
  vsEnemies: MatchupStat[];
  withAllies: MatchupStat[];
  duos: DuoStat[];
  /** Choix d'augment lus à l'écran : winrate quand tu prends la recommandation vs quand tu ne la prends pas. */
  followReco?: { followed: { picks: number; wins: number }; ignored: { picks: number; wins: number } };
}

export interface Settings {
  autoRunes: boolean;
  autoSpells: boolean;
  autoItemSet: boolean;
  overlay: boolean;
  overlayDisplay: string; // 'auto' ou id d'écran
  panelMode: 'window' | 'overlay'; // fenêtre sur un autre écran, ou panneau par-dessus le jeu
  notifications: boolean;
  autoAccept: boolean; // accepte la partie trouvée (ARAM / Mayhem uniquement)
  autoLaunch: 'off' | 'login' | 'league'; // lancement automatique (agent launchd)
  secondOnTop: boolean; // fenêtre en jeu toujours au premier plan (jeu en fenêtré sur un seul écran)
  augmentNotify: boolean; // notification aux niveaux 7 / 11 / 15 avec le meilleur augment de chaque rareté
  phone: boolean; // panneau consultable sur téléphone / tablette (réseau local, lecture seule)
  phonePort: number;
  phoneToken: string; // jeton de l'URL du téléphone (généré au premier lancement)
  readCards: boolean; // lit les 3 cartes d'augments à l'écran (permission « Enregistrement de l'écran »)
  /** Panneau par-dessus le jeu : complet (+ menaces d'en face), compact (par défaut) ou minimal (une ligne). */
  overlayDensity: 'full' | 'compact' | 'minimal';
}

export interface LiveHeadliner {
  key: string;
  name: string;
  source: 'écran' | 'cartes';
  tips: string[];
}

/** Les 3 cartes d'augments lues à l'écran (de gauche à droite). */
export interface OfferedCards {
  ids: number[];
  names: string[];
  rarity: Rarity | null;
  unsure: string | null; // null = 3 cartes reconnues
  at: number;
  /** Cartes hors du pool connu du champion : winrate estimé = winrate du champion + effet moyen de l'augment. */
  extra?: AugmentRow[];
  /** Correction selon ton build en cours (items achetés + prévus) : écart de winrate et raison, par augment. */
  fit?: Record<number, { delta: number; why: string | null; good: boolean }>;
}

export type Connection = 'searching' | 'connected';

export interface LogEntry {
  at: number;
  level: 'info' | 'success' | 'warning';
  text: string;
}

/** Ton identité dans le client (Riot ID, icône, niveau, rangs classés) ; null client fermé. */
export interface PlayerCard {
  riotId: string;
  iconUrl: string | null;
  level: number | null;
  ranks: { queue: 'Solo/Duo' | 'Flex'; tier: string; division: string; lp: number; wins: number; losses: number }[];
}

export interface AppState {
  connection: Connection;
  player?: PlayerCard | null;
  phase: string | null;
  mode: Mode | null;
  queueId: number | null;
  summonerName: string | null;
  data: { patch: string | null; loadedAt: number | null; error: string | null; balance?: string; clientPatch?: string };
  champSelect: ChampSelectView | null;
  augments: AugmentPanel | null;
  build: BuildPanel | null;
  counters: CounterPanel | null;
  nextBuy: NextBuyPanel | null;
  /** Choix d'augment en cours d'après ton niveau en jeu (1 à 4), null hors partie. */
  augRound: number | null;
  /** Cartes d'augments lues à l'écran, null si aucune lecture en cours. */
  offered?: OfferedCards | null;
  /** Headliner Mayhem de la partie en cours, reconnu à l'écran (bannière) ou d'après ses cartes ; null sinon. */
  headliner?: LiveHeadliner | null;
  stats: StatsView;
  settings: Settings;
  log: LogEntry[];
}

export interface Api {
  getState(): Promise<AppState>;
  onState(cb: (s: AppState) => void): () => void;
  pickChampion(championId: number): Promise<{ ok: boolean; message: string }>;
  applyLoadout(): Promise<{ ok: boolean; message: string }>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  refreshData(): Promise<void>;
  importHistory(): Promise<{ added: number }>;
  exportHistory(): Promise<{ ok: boolean; message: string }>;
  listDisplays(): Promise<{ id: string; label: string }[]>;
  testOverlay(): Promise<{ ok: boolean; message: string }>;
  phoneInfo(): Promise<{ running: boolean; url: string | null; error: string | null }>;
  /** Lecture des cartes : état de la permission macOS et lecture d'essai de l'écran du jeu. */
  cardReader(action?: boolean | 'request' | 'settings'): Promise<{ permission: string; message: string }>;
  getHistory(): Promise<HistoryEntry[]>;
  gameDetail(gameId: number): Promise<GameDetail | null>;
  championAugments(championId: number): Promise<AugmentPanel | null>;
  championBuild(championId: number, lane?: string): Promise<BuildPanel | null>;
  laneTier(lane: string): Promise<{ id: number; name: string; winrate: number; games: number; tier: number | null; roleRate: number }[]>;
  currentLane(): Promise<string | null>;
  championLanes(championId: number): Promise<{ lane: string; roleRate: number }[]>;
  balanceChanges(): Promise<{ championId: number; name: string; at: number; text: string; played: number }[]>;
  listChampions(): Promise<{ id: number; name: string; winrate: number | null; games: number; tags: string[] }[]>;
}
