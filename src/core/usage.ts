// Télémétrie 100 % locale (discovery 2026-10-28, § 5) : un fichier JSON dans le projet, jamais envoyé.
// Sert à répondre à une question : est-ce que suivre la recommandation d'augment fait gagner ?

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type UsageEvent =
  | ElixirEvent
  | AnvilEvent
  | StarterEvent
  | LaneGuideEvent
  /** Salon Swiftplay : tes 2 choix contre OP.GG, une fois par réglage. Le suivi se lit dans l'événement suivant du même type. */
  | { type: 'opgg_patch'; at: number; stats: string; client: string | null }
  | { type: 'counter_picks'; at: number; opponentId: number; lane: string; known: number; picks: { id: number; rate: number; games: number; mastery: number | null }[] }
  | { type: 'swiftplay_slots'; at: number; slots: { championId: number; lane: string | null; winRate: number | null; rank?: number | null; of?: number; main?: string | null; spellsOk: boolean | null; smiteMissing: boolean; runes: string; runesOff: number }[] }
  | { type: 'cards_seen'; at: number; championId: number; round: number | null; ids: number[]; best: number | null; unsure: boolean; rarity?: string | null; fit?: Record<string, number>; noStats?: string[]; reroll?: { kind: string; targets: number[]; gain: number; upgrade: boolean; pool?: number } }
  | { type: 'bag_full'; at: number; championId: number | null; gold: number; reco: number; sell: number | null; blocked: boolean; bag: number[]; level: number | null }
  /** Achat rendu possible par une revente, une fois par conseil : le suivre se lit dans `item_bought`. */
  | { type: 'resale'; at: number; championId: number | null; gold: number; reco: number; gap: number; gain: number; sell: number[]; full: boolean; level: number | null }
  | { type: 'build_lean'; at: number; gameId: number; from: string; to: string; augments: number[]; picked: boolean; bought: boolean; win: boolean }
  | { type: 'item_bound'; at: number; gameId: number; augment: number; item: number; picked: boolean; bought: boolean; win: boolean }
  | { type: 'card_picked'; at: number; gameId: number; round: number | null; choice?: number; ids: number[]; best: number | null; picked: number | null; followed: boolean; win: boolean }
  | { type: 'ocr_miss'; at: number; text: string }
  /** Fin de partie selon le client : `early`, `surrender`, `teamEarly` absents = champ inexistant. Pour éprouver le seuil des parties annulées. */
  | { type: 'game_end'; at: number; gameId: number; durationSec: number; win: boolean; early?: boolean; surrender?: boolean; teamEarly?: boolean }
  /** Version lancée : avant de lire une mesure, savoir ce qui tournait (journal : « Version … lancée »). */
  | { type: 'app_start'; at: number; version: string }
  /** Taille de ta collection, une fois par lancement de l'app. */
  | { type: 'pool_seen'; at: number; owned: number; free: number; total: number }
  /** Champion proposé alors qu'il n'est pas dans `owned-champions-minimal` : ce que cet endpoint ne couvre pas. */
  | { type: 'pool_outside'; at: number; championId: number }
  /** Carte « Upgrade X » que l'app ne sait pas relier à un item : à ajouter dans itembound.ts. */
  | { type: 'bound_unknown'; at: number; name: string }
  /** Headliner reconnu en partie (pour vérifier la lecture : texte lu à l'écran, ou cartes). */
  | { type: 'headliner_seen'; at: number; key: string; source: 'écran' | 'cartes'; text?: string }
  /** Aucun headliner reconnu pendant la bannière du début de partie : lectures faites et textes approchants. */
  | { type: 'headliner_miss'; at: number; championId: number; scans: number; near: string[] }
  /** Carte d'un cran au-dessus des 2 autres. `roll` : relances vues dans ce tirage (0 = montée avant la 1re lecture). `known` : headliner déjà connu. `stayed` : une relance de la partie n'avait pas changé de rareté. */
  | { type: 'rarity_jump'; at: number; championId: number; round: number | null; id: number; roll: number; known: string | null; stayed?: boolean }
  | { type: 'headliner_late'; at: number; championId: number; key: string; text: string; afterS: number; known: string | null }
  /** Item fini acheté en partie, et ce que l'app conseillait juste avant (followed = c'était le même). */
  | ItemBought
  /** Score du champion joué et son détail : pour mesurer si synergie et compo prédisent vraiment la victoire. */
  | ChampScored
  /** Item d'une menace passé après le build, parce qu'il gagne nettement moins qu'un item du plan. */
  | { type: 'threat_deferred'; at: number; championId: number; key: string; id: number; by: number; value: number; byValue: number }
  | { type: 'lane_map'; at: number; gameId: number; rows: { lane: string; ally: number; enemy: number; mine: boolean; guessed: boolean; rate: number | null; games: number }[]; win: boolean }
  | { type: 'cs_gap'; at: number; gameId: number; lane: string | null; opponent: number | null; guessed: boolean; samples: { t: number; mine: number; theirs: number | null }[]; win: boolean }
  | { type: 'gold_gap'; at: number; gameId: number; mode: string; samples: { t: number; gap: number; levels: number }[]; win: boolean }
  /** Points de sort dans l'ordre où tu les as pris, et ceux pris hors de l'ordre conseillé (absent : ordre inconnu). */
  | { type: 'skills_taken'; at: number; gameId: number; championId: number; taken: string; plan?: string; off?: number; partial: boolean; win: boolean };

export interface ItemBought {
  type: 'item_bought';
  at: number;
  championId: number;
  id: number;
  reco: number | null;
  plan: number[];
  followed: boolean;
  /** Raison du conseil (ex. « contre leur équipe : anti-soins »). Absente avant la v1.64. */
  why?: string;
  /** Winrate de l'item acheté et du conseil sur ce champion, pris dans la même source (absents si inconnus). */
  value?: number;
  games?: number;
  recoValue?: number;
  recoGames?: number;
  /** Faille : rang de l'item (4e, 5e, 6e), `value` et `recoValue` sont alors mesurés à ce rang. */
  slot?: number;
  /** L'achat répond au conseil sans être le même item : même menace couverte, ou le conseil est un de ses composants. */
  covers?: boolean;
  /** Item acheté ou conseil = bottes : leur winrate ne se compare pas à celui d'un item. */
  boots?: boolean;
}

/** Faille : ce que le guide OP.GG a donné sur un matchup. Une fois par matchup : dit si les champs jamais vus se remplissent. */
export interface LaneGuideEvent {
  type: 'lane_guide';
  at: number;
  championId: number;
  opponentId: number;
  lane: string;
  queueId: number | null;
  pace: boolean;
  tips: number;
  style: boolean;
  laneEdge: string | null;
  killEdge: string | null;
  /** Champs d'avantage remplis mais illisibles : le format est à relire dans `opgg-matchup-*.json`. */
  unread: string[];
}

/** Faille : le départ conseillé et ce que tu avais à ton 1er achat. Une fois par partie. */
export interface StarterEvent {
  type: 'starter';
  at: number;
  championId: number;
  queueId: number | null;
  advised: number[];
  owned: number[];
  swapped: boolean;
}

/** Élixir conseillé (`bought: false`, une fois par partie) ou acheté, pour mesurer l'or qui dort. */
export interface ElixirEvent {
  type: 'elixir';
  at: number;
  championId: number;
  id: number;
  gold: number;
  level: number | null;
  bought: boolean;
}

/** Enclume conseillée (`bought: false`, une fois par partie) ou achetée (`count` : achats vus sur cette lecture). */
export interface AnvilEvent {
  type: 'anvil';
  at: number;
  championId: number;
  gold: number;
  level: number | null;
  bought: boolean;
  count?: number;
}

export interface ChampScored {
  type: 'champ_scored';
  at: number;
  gameId: number;
  championId: number;
  score: number;
  winrate: number | null;
  synergy: number;
  comp: number;
  win: boolean;
}

export interface FollowStat {
  followed: { picks: number; wins: number };
  ignored: { picks: number; wins: number };
}

const MAX = 3000;

export function followStat(events: UsageEvent[]): FollowStat {
  const out: FollowStat = { followed: { picks: 0, wins: 0 }, ignored: { picks: 0, wins: 0 } };
  for (const e of events) {
    if (e.type !== 'card_picked' || e.picked == null || e.best == null) continue;
    const k = e.followed ? out.followed : out.ignored;
    k.picks++;
    if (e.win) k.wins++;
  }
  return out;
}

export class Usage {
  events: UsageEvent[] = [];
  private writing: Promise<void> = Promise.resolve();

  constructor(private file: string | null) {}

  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const j = JSON.parse(await readFile(this.file, 'utf8'));
      if (Array.isArray(j.events)) this.events = j.events;
    } catch {
      /* premier lancement */
    }
  }

  add(e: UsageEvent): void {
    this.events = [...this.events, e].slice(-MAX);
    const file = this.file;
    if (!file) return;
    const snapshot = JSON.stringify({ about: 'ARAM Companion : usage local (jamais envoyé)', events: this.events });
    this.writing = this.writing.then(async () => {
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, snapshot);
      } catch {
        /* diagnostic seulement */
      }
    });
  }

  flush(): Promise<void> {
    return this.writing;
  }
}
