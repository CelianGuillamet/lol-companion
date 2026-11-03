// Télémétrie 100 % locale (discovery 2026-10-28, § 5) : un fichier JSON dans le projet, jamais envoyé.
// Sert à répondre à une question : est-ce que suivre la recommandation d'augment fait gagner ?

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type UsageEvent =
  | ElixirEvent
  | { type: 'cards_seen'; at: number; championId: number; round: number | null; ids: number[]; best: number | null; unsure: boolean; rarity?: string | null; reroll?: { kind: string; targets: number[]; gain: number; upgrade: boolean; pool?: number } }
  | { type: 'bag_full'; at: number; championId: number | null; gold: number; reco: number; sell: number | null; blocked: boolean; bag: number[]; level: number | null }
  /** Achat rendu possible par une revente, une fois par conseil : le suivre se lit dans `item_bought`. */
  | { type: 'resale'; at: number; championId: number | null; gold: number; reco: number; gap: number; gain: number; sell: number[]; full: boolean; level: number | null }
  | { type: 'build_lean'; at: number; gameId: number; from: string; to: string; augments: number[]; picked: boolean; bought: boolean; win: boolean }
  | { type: 'item_bound'; at: number; gameId: number; augment: number; item: number; picked: boolean; bought: boolean; win: boolean }
  | { type: 'card_picked'; at: number; gameId: number; round: number | null; choice?: number; ids: number[]; best: number | null; picked: number | null; followed: boolean; win: boolean }
  | { type: 'ocr_miss'; at: number; text: string }
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
  /** Item fini acheté en partie, et ce que l'app conseillait juste avant (followed = c'était le même). */
  | ItemBought
  /** Score du champion joué et son détail : pour mesurer si synergie et compo prédisent vraiment la victoire. */
  | ChampScored
  /** Points de sort dans l'ordre où tu les as pris, et ceux pris hors de l'ordre conseillé (absent : ordre inconnu). */
  | { type: 'gold_gap'; at: number; gameId: number; mode: string; samples: { t: number; gap: number; levels: number }[]; win: boolean }
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
