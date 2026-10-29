// Télémétrie 100 % locale (discovery 2026-10-28, § 5) : un fichier JSON dans le projet, jamais envoyé.
// Sert à répondre à une question : est-ce que suivre la recommandation d'augment fait gagner ?

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type UsageEvent =
  | { type: 'cards_seen'; at: number; championId: number; round: number | null; ids: number[]; best: number | null; unsure: boolean }
  | { type: 'card_picked'; at: number; gameId: number; round: number | null; ids: number[]; best: number | null; picked: number | null; followed: boolean; win: boolean }
  | { type: 'ocr_miss'; at: number; text: string }
  /** Item fini acheté en partie, et ce que l'app conseillait juste avant (followed = c'était le même). */
  | { type: 'item_bought'; at: number; championId: number; id: number; reco: number | null; plan: number[]; followed: boolean };

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
