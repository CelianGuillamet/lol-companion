// Lecture des 3 cartes d'augments à l'écran (discovery 2026-10-28, job J1).
// Capture de la fenêtre du jeu (permission macOS « Enregistrement de l'écran »), reconnaissance de texte par le
// framework Vision de macOS (JXA, rien à compiler), puis association aux noms d'augments (src/core/cardmatch.ts).
//
// Garde-fous : on ne lit que pendant une partie Mayhem et seulement dans les fenêtres où des cartes peuvent
// être proposées (début de partie, passage aux niveaux 7 / 11 / 15, puis tant que des cartes sont à l'écran).
// L'image est écrite dans un fichier temporaire le temps de la lecture, puis effacée. Rien n'est gardé ni envoyé.
// Lecture seule de l'écran, comme un humain qui regarde : aucune action dans le jeu.

import { BrowserWindow, screen, systemPreferences, type Display, type Rectangle } from 'electron';
import { execFile } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchCards, dropCovered, type CardRead, type OcrLine } from '../src/core/cardmatch';
import type { Engine } from '../src/core/engine';
import { headlinerFromText, type HeadlinerInfo } from '../src/core/headliner';
import { windowBounds, GAME_BUNDLE } from './displays';

const VISION_JXA = `
ObjC.import('Foundation');
ObjC.import('Vision');
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $({}));
  const req = $.VNRecognizeTextRequest.alloc.init;
  req.recognitionLevel = 0; // précis
  req.usesLanguageCorrection = false; // noms propres : pas de « correction »
  const err = Ref();
  if (!handler.performRequestsError($([req]), err)) return JSON.stringify({ error: 'Vision a échoué' });
  const res = req.results;
  const out = [];
  for (let i = 0; i < res.count; i++) {
    const o = res.objectAtIndex(i);
    const c = o.topCandidates(1);
    if (!c.count) continue;
    const top = c.objectAtIndex(0);
    const b = o.boundingBox;
    out.push({ text: ObjC.unwrap(top.string), conf: top.confidence, x: b.origin.x, y: 1 - b.origin.y - b.size.height, w: b.size.width, h: b.size.height });
  }
  return JSON.stringify({ lines: out });
}`;

/** Texte de l'image (PNG) par Vision. */
export function recognize(file: string): Promise<{ lines: OcrLine[]; error: string | null }> {
  return new Promise((resolve) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', VISION_JXA, file], { timeout: 8000, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
      if (err) return resolve({ lines: [], error: (stderr || err.message).trim().slice(0, 200) });
      try {
        const j = JSON.parse(stdout.trim());
        resolve(j.error ? { lines: [], error: j.error } : { lines: j.lines as OcrLine[], error: null });
      } catch {
        resolve({ lines: [], error: `réponse illisible : ${stdout.slice(0, 120)}` });
      }
    });
  });
}

export const permission = (): string => (process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'unsupported');

/** Zone des cartes : le centre de la fenêtre du jeu (les 3 cartes sont centrées, titres dans le tiers haut). */
export function cardsArea(win: Rectangle): Rectangle {
  return {
    x: Math.round(win.x + win.width * 0.1),
    y: Math.round(win.y + win.height * 0.12),
    width: Math.round(win.width * 0.8),
    height: Math.round(win.height * 0.66),
  };
}

export interface ScanResult {
  read: CardRead | null;
  lines: number;
  sample: string[];
  error: string | null;
  /** Headliner nommé à l'écran (bannière du début de partie). */
  headliner?: { info: HeadlinerInfo; text: string } | null;
}

export class CardReader {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private activeUntil = 0;
  private lastRound: number | null | undefined = undefined;
  private inGame = false;
  private empty = 0;
  private warned = false;

  constructor(private engine: Engine) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Lecture immédiate (raccourci ⌘⇧R, bouton « Tester la lecture »), y compris hors fenêtre d'activité. */
  async scanNow(test = false): Promise<ScanResult> {
    this.activeUntil = Math.max(this.activeUntil, Date.now() + 60_000);
    return this.scan(test);
  }

  private async tick(): Promise<void> {
    const s = this.engine.state;
    const pool = s.settings.readCards ? this.engine.cardPool() : null;
    if (!pool || process.platform !== 'darwin') {
      this.inGame = false;
      this.lastRound = undefined;
      this.engine.setOffered(null);
      return;
    }
    const now = Date.now();
    if (!this.inGame) {
      this.inGame = true;
      this.activeUntil = now + 150_000; // cartes du début de partie
    }
    if (s.augRound !== this.lastRound) {
      if (this.lastRound !== undefined) this.activeUntil = now + 180_000; // niveau 7 / 11 / 15
      this.lastRound = s.augRound;
    }
    if (this.busy || (now > this.activeUntil && !s.offered)) return;
    if (permission() !== 'granted') {
      if (!this.warned) this.engine.note('warning', 'Lecture des cartes : autorisation « Enregistrement de l’écran » manquante. Réglages → « Tester la lecture » pour la demander.');
      this.warned = true;
      return;
    }
    const r = await this.scan();
    if (r.headliner) this.engine.setHeadliner(r.headliner.info, 'écran', r.headliner.text);
    // Un seul nom reconnu n'est pas un écran de cartes : c'est un texte du jeu qui ressemble à un augment (vraies
    // parties du 28 oct. : « Vulnerability — 1 carte sur 3 » en plein combat). On l'ignore.
    if (r.read && r.read.ids.length >= 2) {
      this.empty = 0;
      this.engine.setOffered(r.read);
      this.activeUntil = Math.max(this.activeUntil, now + 30_000); // reroll possible : on continue à lire
    } else if (++this.empty >= 3) this.engine.setOffered(null); // cartes choisies ou fermées
  }

  /** test : hors partie, on lit quand même l'écran et on compare à tous les augments connus. */
  private async scan(test = false): Promise<ScanResult> {
    const pool = this.engine.cardPool() ?? (test ? this.engine.allAugmentsPool() : null);
    if (!pool) return { read: null, lines: 0, sample: [], error: 'pas de partie Mayhem en cours (rien à reconnaître)' };
    if (this.busy) return { read: null, lines: 0, sample: [], error: 'lecture déjà en cours' };
    this.busy = true;
    const file = join(tmpdir(), `aram-cards-${process.pid}.png`);
    try {
      const capErr = await captureGameArea(file);
      if (capErr) return { read: null, lines: 0, sample: [], error: `capture impossible (${capErr})` };
      const { lines: raw, error } = await recognize(file);
      if (error) return { read: null, lines: 0, sample: [], error };
      // Le texte lu sur nos propres fenêtres (panneau par-dessus le jeu…) ne compte pas
      const ours = BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed() && b.isVisible() && !b.isMinimized()).map((b) => b.getBounds());
      const lines = lastArea ? dropCovered(raw, lastArea, ours) : raw;
      return { read: matchCards(lines, pool), lines: lines.length, sample: lines.slice(0, 6).map((l) => l.text), error: null, headliner: headlinerFromText(lines.map((l) => l.text)) };
    } finally {
      await unlink(file).catch(() => undefined); // l'image ne reste jamais sur le disque
      this.busy = false;
    }
  }
}

let lastArea: Rectangle | null = null;

/**
 * Capture de la zone des cartes dans la fenêtre du jeu (ou du centre de l'écran principal si le jeu n'est pas
 * trouvé), par l'outil système `screencapture` dans un processus à part : la demande d'autorisation macOS ne
 * bloque jamais l'app (desktopCapturer, lui, gelait tout le processus principal en attendant la réponse).
 */
async function captureGameArea(file: string): Promise<string | null> {
  const { bounds } = await windowBounds(GAME_BUNDLE);
  const win = bounds.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const display: Display = win ? screen.getDisplayMatching(win) : screen.getPrimaryDisplay();
  const db = display.bounds;
  const w = win ?? db;
  const inter = {
    x: Math.max(w.x, db.x),
    y: Math.max(w.y, db.y),
    width: Math.min(w.x + w.width, db.x + db.width) - Math.max(w.x, db.x),
    height: Math.min(w.y + w.height, db.y + db.height) - Math.max(w.y, db.y),
  };
  const area = cardsArea(inter.width > 100 && inter.height > 100 ? inter : db);
  lastArea = area;
  return new Promise((resolve) => {
    execFile('screencapture', ['-x', '-t', 'png', '-R', `${area.x},${area.y},${area.width},${area.height}`, file], { timeout: 10_000 }, (err, _out, stderr) =>
      resolve(err ? (stderr || err.message).trim().slice(0, 200) || 'échec' : null),
    );
  });
}
