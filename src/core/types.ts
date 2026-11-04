import type { AppUpdate } from './appversion';
import type { RerollAdvice } from './reroll';
import type { PoolReport } from './pool';

export type { RerollAdvice };
import type { GameReview } from './review';
import type { IntelligenceState } from './intelligence/types';
import type { BuyReview } from './buyreview';
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
  parts?: { synergy: number; comp: number }; // points avant plafond, pour mesurer leur poids réel
  fills?: string[]; // ce que ce champion apporte à l'équipe qui lui manquait
  balance?: { label: string; good: boolean }[]; // modificateurs ARAM du wiki (affichage seulement)
  balanceChange?: string; // ex. « modifié le 28/10 : dégâts −5 % → −10 % »
  patchChange?: PatchChange; // modifié par un patch que les stats n'ont pas encore (affichage seulement)
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
  /** Phrase qui relie les manques de l'équipe au conseil. */
  fillAdvice?: string | null;
  dataNote: string | null; // avertissement sur la fiabilité des données
  /** Champions du banc hors de ta collection : le client refuserait, ils sont retirés du classement. */
  notOwned?: string[];
  /** Coéquipiers déjà croisés (d'après ton historique) : Riot ID, parties ensemble, victoires. */
  mates?: { name: string; games: number; wins: number }[];
  /** Faille de l'invocateur (classée, normale, Swiftplay…) : rôle, matchup et counter-picks (OP.GG). */
  sr?: SrSelect | null;
}

/** Ton winrate contre l'adversaire de lane, avec l'intervalle de confiance à 95 % (Wilson). */
export interface MatchupView {
  opponent: { id: number; name: string; change?: PatchChange };
  myWinRate: number;
  games: number;
  lo: number;
  hi: number;
  verdict: 'favorable' | 'défavorable' | 'serré' | 'incertain';
  /** Rôle de l'adversaire deviné (champ select : le client ne montre pas les rôles adverses). */
  guessed: boolean;
  /** Guide OP.GG du matchup : arrive après le reste, absent si OP.GG n'a rien de lisible. */
  guide?: LaneGuide;
}

export type LaneEdge = 'me' | 'them';

export interface GuidePhase {
  label: string;
  mine: number;
  theirs: number;
  edge: LaneEdge | 'even';
}

/** Winrate selon la durée de la partie, ton champion contre le sien, tous adversaires confondus. */
export interface Pace {
  text: string;
  detail: string;
  phases: GuidePhase[];
}

export interface LaneGuide {
  pace: Pace | null;
  tips: string[];
  style: string | null;
  laneEdge: LaneEdge | null;
  killEdge: LaneEdge | null;
}

/** Un duel de la partie, vu de ton équipe (winrate de classée, OP.GG). */
export interface LaneMapRow {
  lane: string;
  laneLabel: string;
  ally: { id: number; name: string };
  enemy: { id: number; name: string };
  guessed: boolean;
  mine: boolean;
  rate: number | null;
  games: number;
  lo: number;
  hi: number;
  /** null = pas de chiffre fiable. Couleur seulement si l'écart sort du bruit. */
  edge: 'ally' | 'enemy' | 'even' | null;
}

export interface LaneMapPanel {
  rows: LaneMapRow[];
  strong: string | null;
  weak: string | null;
  guessed: boolean;
}

export interface SrSelect {
  lane: string | null;
  laneLabel: string | null;
  queueLabel: string;
  me: { id: number; name: string; locked: boolean; winRate: number; games: number; lo: number; hi: number; tier: number | null; change?: PatchChange } | null;
  matchup: MatchupView | null;
  /** Champions qui battent ton adversaire de lane (seulement si tout l'intervalle de confiance est au-dessus de 50 %). */
  counterPicks: { id: number; name: string; winRate: number; games: number; lo: number; mastery: number | null; change?: PatchChange }[];
  /** Ennemis connus pour bien jouer contre ton champion. */
  dangers: { id: number; name: string; myWinRate: number; games: number }[];
  /** Bans conseillés, tant que ton ban n'est pas validé (rien si la file n'a pas de bans). */
  bans: SrBans | null;
  note: string | null;
}

export interface SrBans {
  myTurn: boolean;
  /** Champion survolé pour ton ban (0 = aucun). */
  hovered: number;
  /** Nombre de rôles comptés sur 5 : le tien et ceux des alliés qui ont montré leur champion. */
  lanes: number;
  options: { id: number; name: string; gain: number; laneLabel: string; share: number; myWinRate: number | null; winRate: number; change?: PatchChange }[];
}

/** Avis sur une carte pour ce champion (arammayhem.com), pas une statistique. `plan` = va avec un augment déjà pris. */
export type PatchChangeDir = 'buff' | 'nerf' | 'mixed' | 'new';
/** Ce que les notes de patch changent à une carte ou un champion, tant que ses stats datent d'avant ce patch. */
export interface PatchChange {
  patch: string;
  dir: PatchChangeDir;
  text: string;
}

export type ComboKind = 'trap' | 'strong' | 'good' | 'tech' | 'listed' | 'bug' | 'fun' | 'plan';
export interface ComboNote {
  kind: ComboKind;
  label: string;
  /** true : à garder ; false : à éviter ; null : à titre d'info. */
  good: boolean | null;
  with?: string[];
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
  rows: { item: IconItem; why: string; price: number | null; remaining?: number | null; missing: number; step?: { item: IconItem; price: number }; room?: { sell: IconItem | null; held?: boolean }; resale?: { items: IconItem[]; gain: number } }[];
  /** Ton parcours sur 6 places : items finis déjà achetés, puis la suite prévue. */
  plan?: { item: IconItem; owned: boolean; why?: string }[];
  /** Mort : secondes avant de réapparaître (le shop est ouvert). */
  respawn?: number | null;
  /** Rien d'autre à acheter : l'élixir de ton build (`left` = secondes d'effet, `buy` = à racheter maintenant). */
  elixir?: { item: IconItem; perk: string; price: number; left: number | null; buy: boolean } | null;
  /** Mayhem, build fini : stat permanente. `bought` = enclumes vues cette partie, `pick` = repère de choix. */
  anvil?: { item: IconItem; price: number; buy: boolean; missing: number; bought: number; pick: string } | null;
  /** Faille, rien d'acheté : le départ OP.GG. `swapped` : Doran remplacé par le Gardien (Swiftplay). */
  starter?: { items: IconItem[]; swapped: boolean } | null;
  /** Menaces repoussées après le build : leur item gagne nettement moins qu'un item du plan (`key` = clé de la menace). */
  deferred?: { key: string; item: IconItem; by: IconItem; value: number; byValue: number }[];
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
  /** Faille : `lane` est le jungler adverse. */
  jungle?: boolean;
  /** Répartition de leurs dégâts d'après leurs champions et leurs objets (parts de 0 à 1), mêmes chiffres que les menaces. */
  damage?: { phys: number; magic: number; true: number } | null;
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

export interface ItemStat {
  id: number;
  winrate: number;
  games: number;
}

export interface BuildPanel {
  championId: number;
  championName: string;
  mode: Mode;
  /** Modifié par un patch que ces stats n'ont pas encore : fiche Préparer. */
  change?: PatchChange | null;
  runes: { primary: IconItem | null; secondary: IconItem | null; perks: IconItem[] } | null;
  spells: { items: IconItem[]; winrate: number; games: number }[];
  cores: { name: string; core: IconItem[]; options: StatItem[]; winrate: number; games: number }[];
  boots: StatItem[];
  singles?: StatItem[]; // items seuls très gagnants, hors builds affichés
  /** Winrate de chaque item seul sur ce champion (Mayhem, arammeta) : sert à comparer un achat au conseil. */
  itemStats?: ItemStat[];
  /** Faille (OP.GG) : winrate des items par rang d'achat (4e, 5e, 6e). Seuls comparables entre eux : voir `optionsForSlot`. */
  slotStats?: Record<number, ItemStat[]>;
  note: string | null;
  balance?: { label: string; good: boolean }[];
  /** Faille : départ, rôle, source et taille de l'échantillon. */
  starter?: IconItem[];
  /** Swiftplay : objets de Doran remplacés par ceux du Gardien. */
  starterSwapped?: boolean;
  /** Ordre des compétences (OP.GG, tous modes). `source` : précisé quand les chiffres ne viennent pas du mode joué. */
  skills?: { order: string[]; max: string[]; source?: string } | null;
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
  /** Modifié par un patch que ces stats n'ont pas encore (lecture Mayhem) : fiche Préparer. */
  change?: PatchChange | null;
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
  /** Avis sur les augments du pool pour ce champion, sans tenir compte des augments pris. */
  combos?: Record<number, ComboNote>;
  /** Cartes du pool modifiées par un patch que les stats n'ont pas encore. */
  changes?: Record<number, PatchChange>;
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
  /** Revue des choix d'augments (core/review.ts), absente si aucune carte n'a été lue à l'écran. */
  review?: GameReview;
  /** Revue des achats (core/buyreview.ts), absente si aucun item fini n'a été vu en partie. */
  buys?: BuyReview;
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
  /** Toutes les parties enregistrées, Faille et parties annulées comprises : ce qui bouge à chaque fin de partie. */
  recorded: number;
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
  /** Carte posée sur ton 1er item légendaire : où ira l'effet, dans l'ordre de ton sac. */
  hints?: Record<number, string>;
  /** Avis sur les cartes pour ce champion, en tenant compte des cartes conseillées aux choix passés. */
  combos?: Record<number, ComboNote>;
  /** Cartes modifiées par un patch que les stats n'ont pas encore. */
  changes?: Record<number, PatchChange>;
  /** Conseil de relance (absent en lecture partielle, hors données ou pour les cartes de headliner). */
  reroll?: RerollAdvice | null;
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

export interface SkillNext {
  key: 'Q' | 'W' | 'E' | 'R';
  /** Nom du sort donné par le jeu, dans la langue du client. */
  name: string | null;
  /** Rang que le sort aura après ce point. */
  rank: number;
  /** Un point est à mettre maintenant. */
  pending: boolean;
  max: string[];
  source: string | null;
}

export interface GoldGapPlayer {
  championId: number;
  championName: string;
  level: number;
  /** Valeur des objets (prix total du patch, hors consommables). */
  gold: number;
}

export interface GoldGapRow {
  /** Faille : le rôle. null : les joueurs sont juste classés du plus riche au moins riche. */
  role: string | null;
  ally: GoldGapPlayer | null;
  enemy: GoldGapPlayer | null;
  gap: number | null;
  mine: boolean;
}

export interface LaneCsPanel {
  mine: number;
  /** null : adversaire de lane inconnu. */
  theirs: number | null;
  gap: number | null;
  /** Tes CS par minute, arrondis au dixième. */
  perMin: number;
  opponent: { id: number; name: string } | null;
  guessed: boolean;
}

export interface GoldGapPanel {
  allyGold: number;
  enemyGold: number;
  /** Ton équipe moins la leur. */
  gap: number;
  levelGap: number;
  state: 'ahead' | 'even' | 'behind';
  richest: GoldGapPlayer;
  rows: GoldGapRow[];
  byRole: boolean;
  /** Objets sans prix connu, comptés 0. */
  unknown: number;
}

/** Un des 2 choix préparés au salon Swiftplay, comparé à OP.GG. */
export interface SwiftplaySlot {
  championId: number;
  name: string;
  change?: PatchChange;
  lane: string | null;
  /** Rôle pris par défaut : le salon n'en donne pas pour ce choix. */
  laneGuessed: boolean;
  /** null : OP.GG injoignable ou pas de données pour ce champion dans ce rôle. */
  winRate: number | null;
  games: number;
  /** Place du champion dans le rôle (OP.GG, classée). null : méta des rôles indisponible. */
  fit: { rank: number | null; of: number; main: { lane: string; share: number; winRate: number } | null; stronger: { id: number; name: string; winRate: number }[] } | null;
  /** Tes parties sur ce champion dans ce rôle, parties annulées exclues. */
  mine: { games: number; wins: number };
  spellsOk: boolean | null;
  smiteMissing: boolean;
  spells: IconItem[];
  spellsWanted: IconItem[];
  runes: 'same' | 'minor' | 'keystone' | 'style' | 'unknown';
  runesOff: number;
  keystone: IconItem | null;
  keystoneWanted: IconItem | null;
  styleWanted: IconItem | null;
  /** Achat de départ conseillé, objets du Gardien à la place de Doran. */
  starter: IconItem[];
}

export interface SwiftplayLobby {
  queueLabel: string;
  /** En file : trop tard pour changer quoi que ce soit. */
  queued: boolean;
  slots: SwiftplaySlot[];
}

export interface AppState {
  /** Observations Live Client ; les données non acquises restent explicitement inconnues. */
  intelligence?: IntelligenceState | null;
  /** Nombre d'anciennes parties notées par la revue depuis le lancement (recharge l'historique affiché). */
  reviews?: number;
  /** Version de l'app en cours (lue dans CHANGELOG.md au lancement). */
  appVersion?: string | null;
  /** Version plus récente posée sur le disque, à lancer. */
  update?: AppUpdate | null;
  connection: Connection;
  player?: PlayerCard | null;
  phase: string | null;
  mode: Mode | null;
  queueId: number | null;
  summonerName: string | null;
  data: { patch: string | null; loadedAt: number | null; error: string | null; balance?: string; combos?: string; clientPatch?: string; /** Patch des stats OP.GG, connu à la 1re analyse lue. */ opggPatch?: string };
  champSelect: ChampSelectView | null;
  /** Salon Swiftplay : tes 2 choix préparés, null ailleurs. */
  swiftplay?: SwiftplayLobby | null;
  augments: AugmentPanel | null;
  build: BuildPanel | null;
  counters: CounterPanel | null;
  nextBuy: NextBuyPanel | null;
  /** Le prochain sort à monter, en partie. */
  skillNext?: SkillNext | null;
  /** Timers des sorts ennemis signalés à la main, en partie. */
  /** Valeur des objets des deux équipes, en partie. */
  goldGap?: GoldGapPanel | null;
  /** Faille : tes CS face à ton adversaire de lane, null ailleurs. */
  laneCs?: LaneCsPanel | null;
  /** Faille : les 5 duels de la partie, jusqu'à 15 min. */
  laneMap?: LaneMapPanel | null;
  /** Choix d'augment en cours d'après ton niveau en jeu (1 à 4), null hors partie. */
  augRound: number | null;
  /** Ton niveau en jeu (ARAM, Mayhem), null hors partie. */
  liveLevel?: number | null;
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
  hoverBan(championId: number): Promise<{ ok: boolean; message: string }>;
  /** Signale un sort ennemi : lancé (`cast`), à annuler (`clear`), ou à décaler de `delta` secondes (`shift`, négatif = signalé en retard). */
  applyLoadout(): Promise<{ ok: boolean; message: string }>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  refreshData(): Promise<void>;
  importHistory(): Promise<{ added: number }>;
  exportHistory(): Promise<{ ok: boolean; message: string }>;
  exportIntelligenceDiagnostic(): Promise<{ ok: boolean; message: string }>;
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
  poolReport(): Promise<PoolReport | null>;
  /** Relance l'app pour passer à la version du disque. Refusé en partie. */
  relaunch(): Promise<{ ok: boolean; message: string }>;
}
