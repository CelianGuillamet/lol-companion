// Processus principal Electron : fenêtre principale + overlay en jeu, pont IPC vers le moteur.

import { execFile } from 'node:child_process';
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Notification, screen, shell, type Display } from 'electron';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Engine } from '../src/core/engine';
import { collectIntelligenceDiagnostic } from '../src/core/intelligence/diagnostic';
import { writeFile } from 'node:fs/promises';
import { Balance } from '../src/core/balance';
import { PhoneServer } from './phone';
import { applyAutoLaunch, BACKGROUND_ARG } from './autolaunch';
import { recap } from '../src/renderer/insights';
import { isRemake, played } from '../src/core/remake';
import { canRelaunch, parseChangelog, shouldNudge, updateFrom, type AppVersionEntry } from '../src/core/appversion';
import { randomBytes } from 'node:crypto';
import { Arammeta } from '../src/core/arammeta';
import { matchCards } from '../src/core/cardmatch';
import { headlinerFromText } from '../src/core/headliner';
import { CardReader, permission as screenPermission } from './cardreader';
import { displayOfApp, displayLabel, windowBounds, GAME_BUNDLE, CLIENT_BUNDLE } from './displays';
import { fitWindowBounds } from './window-fit';
import type { AppState, Settings } from '../src/core/types';

const RENDERER = join(__dirname, '..', 'renderer');
const SMOKE = process.env.ARAM_SMOKE === '1'; // test automatique : capture d'écran puis fermeture

let mainWin: BrowserWindow | null = null;
let overlayWin: BrowserWindow | null = null;
let secondWin: BrowserWindow | null = null; // mode « fenêtre sur un autre écran »
let engine: Engine;
let cardReader: CardReader;
let overlayHidden = false;
let overlayTestUntil = 0;
let wasInGame = false;
let overlayDisplayId: number | null = null; // écran utilisé pour la partie en cours

// ---------------------------------------------------------------- sécurité des fenêtres

/** Seuls les liens web s'ouvrent, dans le navigateur ; jamais `file:`, `smb:` ni un autre protocole système. */
export const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url);

// Toutes les fenêtres (présentes et futures) : aucune nouvelle fenêtre Electron, aucune navigation hors de l'interface.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return; // pages de l'interface
    event.preventDefault();
    if (isWebUrl(url)) void shell.openExternal(url);
  });
});

// Une promesse rejetée sans gestionnaire (réseau, fichier, outil système) ne doit jamais faire tomber l'app en partie.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  try {
    engine?.note('warning', `Erreur interne ignorée : ${msg}`);
  } catch {
    console.error('unhandledRejection', reason);
  }
});

const OVERLAY_W = 310;
const OVERLAY_H = 600;

// ---------------------------------------------------------------- positions des fenêtres

type Bounds = { x: number; y: number; width: number; height: number };
const boundsFile = () => join(app.getPath('userData'), 'windows.json');
let savedBounds: Record<string, Bounds> = {};
try {
  savedBounds = JSON.parse(readFileSync(boundsFile(), 'utf8'));
} catch {
  /* première fois */
}
/** Récupère aussi une fenêtre d'un écran débranché et la recale entièrement dans la zone utile. */
function restoredBounds(key: string): Bounds | null {
  const b = savedBounds[key];
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null;
  return fitWindowBounds(b, screen.getDisplayMatching(b).workArea);
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function rememberBounds(key: string, win: BrowserWindow): void {
  const save = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    savedBounds[key] = win.getBounds();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        writeFileSync(boundsFile(), JSON.stringify(savedBounds));
      } catch {
        /* pas grave */
      }
    }, 500);
  };
  win.on('moved', save);
  win.on('resized', save);
}

function createMain(): BrowserWindow {
  const restored = SMOKE ? null : restoredBounds('main');
  const a = screen.getPrimaryDisplay().workArea;
  const bounds = restored ?? fitWindowBounds({ x: a.x + (a.width - 1180) / 2, y: a.y + (a.height - 780) / 2, width: 1180, height: 780 }, a);
  const win = new BrowserWindow({
    ...bounds,
    minWidth: Math.min(900, bounds.width),
    minHeight: Math.min(620, bounds.height),
    title: 'ARAM Companion',
    backgroundColor: '#050d16', // = --bg : pas de flash d'une autre teinte à l'ouverture
    titleBarStyle: 'hiddenInset',
    show: !SMOKE || process.env.ARAM_SMOKE_SHOW === '1',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(join(RENDERER, 'index.html'));
  rememberBounds('main', win);
  return win;
}

// Overlay : panneau flottant au-dessus du jeu, qui laisse passer les clics.
// Réglages repris de Ryot (MIT) ; `type: 'panel'` crée un NSPanel sur macOS (cf. UP!).
// Comme le HUD d'UP! : niveau « économiseur d'écran + 1 », présent sur tous les Spaces, y compris ceux en plein écran.
function pinOverlay(win: BrowserWindow): void {
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function createOverlay(): BrowserWindow {
  const win = new BrowserWindow({
    type: 'panel',
    width: OVERLAY_W,
    height: OVERLAY_H,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  pinOverlay(win);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(join(RENDERER, 'overlay.html'));
  return win;
}

// ---------------------------------------------------------------- placement multi-écrans

function placeOverlay(d: Display): void {
  if (!overlayWin) return;
  const a = d.workArea;
  overlayDisplayId = d.id;
  overlayWin.setBounds(fitWindowBounds({ x: a.x + a.width - OVERLAY_W - 16, y: a.y + 80, width: OVERLAY_W, height: OVERLAY_H }, a));
}

/** Choisit l'écran : réglage manuel, sinon écran de la fenêtre du jeu, sinon écran du curseur. */
async function resolveOverlayDisplay(forTest = false): Promise<{ display: Display; how: string }> {
  const displays = screen.getAllDisplays();
  const choice = engine.state.settings.overlayDisplay;
  if (choice !== 'auto') {
    const d = displays.find((x) => String(x.id) === choice);
    if (d) return { display: d, how: 'écran choisi dans les réglages' };
  }
  const game = await displayOfApp(GAME_BUNDLE);
  if (game.display) return { display: game.display, how: 'écran du jeu détecté' };
  if (forTest) {
    // Hors partie, on vérifie la détection sur la fenêtre du client League.
    const client = await displayOfApp(CLIENT_BUNDLE);
    if (client.display) return { display: client.display, how: 'écran du client League détecté (jeu non lancé)' };
    if (client.error) engine.note('warning', `Détection d'écran : ${client.error}`);
  }
  if (game.error) engine.note('warning', `Détection d'écran : ${game.error}`);
  return { display: screen.getDisplayNearestPoint(screen.getCursorScreenPoint()), how: 'écran du curseur (jeu non détecté)' };
}

function cycleOverlayDisplay(): void {
  const all = screen.getAllDisplays();
  if (all.length < 2 || !overlayWin) return;
  const i = Math.max(0, all.findIndex((d) => d.id === overlayDisplayId));
  const next = all[(i + 1) % all.length];
  placeOverlay(next);
  engine.note('info', `Panneau déplacé sur ${displayLabel(next, all.indexOf(next))}`);
}

// ---------------------------------------------------------------- fenêtre « second écran »

/** Fenêtre en jeu au premier plan (pour jouer en fenêtré sur un seul écran). */
function applySecondOnTop(): void {
  if (!secondWin || secondWin.isDestroyed()) return;
  const on = engine?.state.settings.secondOnTop ?? false;
  secondWin.setAlwaysOnTop(on, 'floating');
  secondWin.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: on });
}

function ensureSecond(): BrowserWindow {
  if (secondWin && !secondWin.isDestroyed()) return secondWin;
  const a = screen.getPrimaryDisplay().workArea;
  const bounds = fitWindowBounds({ x: a.x + (a.width - 980) / 2, y: a.y + (a.height - 1000) / 2, width: 980, height: 1000 }, a);
  secondWin = new BrowserWindow({
    ...bounds,
    minWidth: Math.min(420, bounds.width),
    minHeight: Math.min(500, bounds.height),
    title: 'ARAM Companion — en jeu',
    backgroundColor: '#050d16', // = --bg : pas de flash d'une autre teinte à l'ouverture
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  secondWin.loadFile(join(RENDERER, 'index.html'), { hash: 'second' });
  secondWin.on('closed', () => (secondWin = null));
  rememberBounds('second', secondWin);
  applySecondOnTop();
  return secondWin;
}

/** Écran pour la fenêtre : réglage manuel, sinon un autre écran que celui du jeu (de préférence celui de l'app). */
async function resolveSecondDisplay(): Promise<{ display: Display; how: string }> {
  const all = screen.getAllDisplays();
  const choice = engine.state.settings.overlayDisplay;
  if (choice !== 'auto') {
    const d = all.find((x) => String(x.id) === choice);
    if (d) return { display: d, how: 'écran choisi dans les réglages' };
  }
  const game = (await displayOfApp(GAME_BUNDLE)).display ?? (await displayOfApp(CLIENT_BUNDLE)).display;
  const others = all.filter((d) => d.id !== game?.id);
  const appDisplay = mainWin && !mainWin.isDestroyed() ? screen.getDisplayMatching(mainWin.getBounds()) : null;
  const pick = others.find((d) => d.id === appDisplay?.id) ?? others[0] ?? all[0];
  return { display: pick, how: game ? 'autre écran que celui du jeu' : 'jeu non détecté' };
}

async function showSecond(): Promise<string> {
  const win = ensureSecond();
  const { display, how } = await resolveSecondDisplay();
  const a = display.workArea;
  const w = Math.min(980, a.width - 40);
  const h = Math.min(1000, a.height - 40);
  // On ne redéplace pas une fenêtre que tu as déjà placée toi-même sur cet écran (ni celle d'une session précédente).
  const saved = restoredBounds('second');
  let next = win.getBounds();
  if (!win.isVisible() && saved && screen.getDisplayMatching(saved).id === display.id) next = saved;
  else if (!win.isVisible() || screen.getDisplayMatching(win.getBounds()).id !== display.id) {
    next = { x: Math.round(a.x + (a.width - w) / 2), y: Math.round(a.y + (a.height - h) / 2), width: w, height: h };
  }
  const fitted = fitWindowBounds(next, a);
  win.setMinimumSize(Math.min(420, fitted.width), Math.min(500, fitted.height));
  win.setBounds(fitted);
  win.showInactive();
  const label = displayLabel(display, screen.getAllDisplays().findIndex((d) => d.id === display.id));
  engine.note('info', `Fenêtre en jeu : ${label} (${how})`);
  return label;
}

function fitOpenWindows(): void {
  for (const win of [mainWin, secondWin, overlayWin]) {
    if (!win || win.isDestroyed() || win.isFullScreen()) continue;
    const bounds = fitWindowBounds(win.getBounds(), screen.getDisplayMatching(win.getBounds()).workArea);
    const [minW, minH] = win.getMinimumSize();
    win.setMinimumSize(Math.min(minW, bounds.width), Math.min(minH, bounds.height));
    win.setBounds(bounds);
  }
}

function updateOverlay(s: AppState): void {
  if (!overlayWin) return;
  const inGame = s.phase === 'InProgress' || s.phase === 'GameStart' || s.phase === 'Reconnect';
  const windowMode = s.settings.panelMode === 'window';
  if (inGame && !wasInGame && windowMode && s.settings.overlay && s.mode) {
    void showSecond();
    setTimeout(() => void showSecond(), 15000); // le jeu met quelques secondes à ouvrir sa fenêtre
  }
  if (inGame && !wasInGame && !windowMode) {
    // Début de partie : on place le panneau sur l'écran du jeu (le jeu met quelques secondes à ouvrir sa fenêtre).
    // 1er essai juste au lancement : la fenêtre du jeu n'existe souvent pas encore → on ne note rien s'il échoue
    const place = async (first = false) => {
      const quick = first ? await windowBounds(GAME_BUNDLE) : null;
      if (first && !quick?.bounds.length) return;
      const { display, how } = await resolveOverlayDisplay();
      placeOverlay(display);
      const game = await windowBounds(GAME_BUNDLE);
      const all = screen.getAllDisplays();
      const desc = game.bounds.length
        ? game.bounds.map((b) => {
            const d = screen.getDisplayMatching(b);
            const full = b.width === d.bounds.width && b.height === d.bounds.height;
            return `${b.width}×${b.height} à (${b.x}, ${b.y}) sur écran ${all.findIndex((x) => x.id === d.id) + 1}${full ? ', occupe tout l’écran' : ''}`;
          }).join(' ; ')
        : `aucune fenêtre trouvée${game.error ? ` (${game.error})` : ''}`;
      engine.note('info', `Fenêtre du jeu : ${desc}`);
      engine.note('info', `Panneau d'augments : ${displayLabel(display, screen.getAllDisplays().findIndex((d) => d.id === display.id))} (${how})`);
    };
    void place(true);
    setTimeout(() => void place(), 15000);
  }
  wasInGame = inGame;
  const testing = Date.now() < overlayTestUntil;
  const show = !windowMode && (testing || (s.settings.overlay && !overlayHidden && inGame && ((s.mode === 'mayhem' && !!s.augments) || (s.mode === 'sr' && !!s.nextBuy))));
  if (show && !overlayWin.isVisible()) {
    pinOverlay(overlayWin); // ré-appliqué à chaque affichage (macOS peut l'oublier après un changement de Space)
    overlayWin.showInactive(); // ne vole jamais le focus au jeu
    const b = overlayWin.getBounds();
    engine.note('info', `Panneau affiché à x=${b.x}, y=${b.y} (visible : ${overlayWin.isVisible() ? 'oui' : 'non'})`);
  }
  else if (!show && overlayWin.isVisible()) overlayWin.hide();
}

let phone: PhoneServer | null = null;
let phoneError: string | null = null;

/** Démarre / arrête le serveur téléphone selon les réglages. */
async function syncPhone(): Promise<void> {
  const s = engine.state.settings;
  if (!s.phone) {
    phone?.stop();
    phone = null;
    phoneError = null;
    return;
  }
  if (phone?.running && phone.port === s.phonePort) return;
  phone?.stop();
  phone = new PhoneServer(RENDERER, s.phoneToken, {
    state: () => engine.state,
    history: () => engine.getHistory(),
    detail: (id) => engine.gameDetail(id),
  });
  try {
    await phone.start(s.phonePort);
    phoneError = null;
    engine.note('success', `Panneau téléphone actif : ${phone.url() ?? 'pas de réseau local détecté'}`);
  } catch (e) {
    phoneError = `Port ${s.phonePort} indisponible (${(e as Error).message})`;
    phone = null;
  }
}

function broadcast(s: AppState): void {
  phone?.push(s);
  for (const w of [mainWin, overlayWin, secondWin]) if (w && !w.isDestroyed()) w.webContents.send('state', s);
  updateOverlay(s);
  notifyChampSelect(s);
  notifyAugmentRound(s);
  notifyGameRecorded(s);
  notifyOffered(s);
  notifyUpdate(s);
}

// ---------------------------------------------------------------- version sur le disque

const UPDATE_CHECK_MS = 5 * 60_000;
let runningVersion: string | null = null;
let lastNudge = 0;

function readVersions(): AppVersionEntry[] {
  try {
    return parseChangelog(readFileSync(join(app.getAppPath(), 'CHANGELOG.md'), 'utf8'));
  } catch {
    return []; // fichier absent ou en cours d'extraction : on réessaie au prochain contrôle
  }
}

/** La version en cours est le CHANGELOG lu au lancement ; une session planifiée pose la suivante sans relancer. */
function startUpdateCheck(): void {
  const versions = readVersions();
  runningVersion = process.env.ARAM_SMOKE_RUNNING ?? versions[0]?.version ?? null;
  if (runningVersion) engine.setAppVersion(runningVersion);
  const check = (entries = readVersions()) => engine.setUpdate(updateFrom(runningVersion, entries));
  check(versions);
  setInterval(check, UPDATE_CHECK_MS).unref();
}

function notifyUpdate(s: AppState): void {
  if (!shouldNudge(s.phase, s.update, lastNudge, Date.now())) return;
  lastNudge = Date.now();
  notify(`Mise à jour prête : ${s.update!.latest}`, 'Relance l’app avant ta partie, bouton en bas à gauche.', true);
}

// ---------------------------------------------------------------- notifications au champ select

const notified = new Set<string>();
const fmt = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1).replace('.', ',')}`;

function notify(title: string, body: string, silent = false): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent, ...(existsSync(ICON) ? { icon: ICON } : {}) });
  n.on('click', () => mainWin?.show());
  n.show();
}

function notifyChampSelect(s: AppState): void {
  const cs = s.champSelect;
  if (!cs) {
    notified.clear();
    return;
  }
  if (!s.settings.notifications) return;
  if (cs.cardsOpen) {
    if (notified.has('cards')) return;
    const cards = cs.candidates.filter((c) => c.source === 'card');
    if (!cards.length) return;
    notified.add('cards');
    notify('Choisis ta carte', cards.map((c) => `${c.name} ${fmt(c.score)}`).join('  ·  '));
    return;
  }
  const current = cs.candidates.find((c) => c.source === 'current');
  if (!current) return;
  const best = cs.candidates.find((c) => (c.source === 'bench' || c.source === 'trade') && c.actionable);
  if (!best || best.score - current.score < 1.5 || notified.has(`bench-${best.championId}`)) return;
  notified.add(`bench-${best.championId}`);
  if (best.source === 'trade') notify(`Échange intéressant : ${best.name}`, `Un allié l'a : ${fmt(best.score - current.score)} pts par rapport à ${current.name}. Ouvre l'app pour proposer l'échange.`);
  else notify(`${best.name} est sur le banc`, `${fmt(best.score - current.score)} pts par rapport à ${current.name}. Clique pour ouvrir l'app et le prendre.`);
}

let lastTotal = -1;

/** Fin de partie enregistrée : notification avec le bilan (écarts nets par rapport à tes autres parties). */
function notifyGameRecorded(s: AppState): void {
  const total = s.stats.recorded;
  if (lastTotal >= 0 && total > lastTotal && s.settings.notifications) {
    const games = engine.getHistory();
    const g = games[0];
    if (g && !isRemake(g)) {
      const r = recap(g, played(games));
      const lines = r?.lines.map((l) => `${l.good ? '▲' : '▼'} ${l.text}`) ?? [];
      notify(`${g.win ? 'Victoire' : 'Défaite'} avec ${g.championName} · ${g.kills}/${g.deaths}/${g.assists}`, lines.join('\n') || 'Partie dans ta moyenne.', true);
    }
  }
  lastTotal = total;
}

let lastRound = 0;

/** Niveau 7 / 11 / 15 en Mayhem : notification discrète avec le meilleur augment de chaque rareté pour ce choix. */
function notifyAugmentRound(s: AppState): void {
  if (s.phase !== 'InProgress' || !s.augments || !s.augRound) {
    if (s.phase !== 'InProgress') lastRound = 0;
    return;
  }
  if (s.augRound === lastRound) return;
  const first = lastRound === 0;
  lastRound = s.augRound;
  if (first || !s.settings.augmentNotify) return; // pas de notification au lancement de l'app en pleine partie
  const at = (a: { winrate: number; rounds?: (number | null)[] }) => a.rounds?.[s.augRound! - 1] ?? a.winrate;
  const pool = s.augments.all ?? s.augments.top;
  const best = (['kPrismatic', 'kGold', 'kSilver'] as const).map((k) => {
    const top = [...(pool[k] ?? [])].sort((x, y) => at(y) - at(x))[0];
    return top ? `${k === 'kPrismatic' ? 'Prisma' : k === 'kGold' ? 'Or' : 'Argent'} : ${top.name} ${Math.round(at(top) * 100)} %` : null;
  });
  notify(`Choix d'augment n° ${s.augRound}`, best.filter(Boolean).join('  ·  '), true);
}

let lastOffered = '';

/** Cartes lues à l'écran : notification « Prends X » (utile sur le portable, jeu en plein écran). */
function notifyOffered(s: AppState): void {
  const o = s.offered;
  const key = o ? o.ids.join() : '';
  if (key === lastOffered) return;
  lastOffered = key;
  if (!o || o.unsure || !s.settings.notifications || !s.augments) return;
  const best = engine.bestOffered(o.ids);
  if (best == null) return;
  const round = s.augRound;
  const rows = new Map<number, { name: string; winrate: number; rounds?: (number | null)[] }>();
  for (const k of ['kPrismatic', 'kGold', 'kSilver'] as const) for (const a of [...(s.augments.all?.[k] ?? []), ...s.augments.top[k], ...s.augments.avoid[k]]) rows.set(a.id, a);
  for (const a of o.extra ?? []) if (!rows.has(a.id)) rows.set(a.id, a);
  const at = (id: number) => {
    const a = rows.get(id);
    return a ? ((round ? a.rounds?.[round - 1] : null) ?? a.winrate) + (o.fit?.[id]?.delta ?? 0) : null;
  };
  const p = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)} %`);
  const others = o.ids.filter((id) => id !== best).map((id) => `${o.names[o.ids.indexOf(id)] || rows.get(id)?.name || '?'} ${rows.has(id) ? p(at(id)) : 'sans stats'}`);
  const why = o.fit?.[best]?.why;
  notify(`Prends ${rows.get(best)?.name ?? '?'} · ${p(at(best))}`, `${why ? `${why[0].toUpperCase()}${why.slice(1)}. ` : ''}Devant ${others.join(', ')}`, true);
}

function registerIpc(): void {
  ipcMain.handle('getState', () => engine.state);
  ipcMain.handle('pickChampion', (_e, id: number) => engine.pickChampion(Number(id)));
  ipcMain.handle('hoverBan', (_e, id: number) => engine.hoverBan(Number(id)));
  ipcMain.handle('applyLoadout', () => engine.applyLoadout(true));
  ipcMain.handle('setSettings', async (_e, patch: Partial<Settings>) => {
    const r = await engine.setSettings(patch);
    if ('phone' in patch || 'phonePort' in patch) await syncPhone();
    if ('secondOnTop' in patch) applySecondOnTop();
    if ('autoLaunch' in patch) engine.note('info', await applyAutoLaunch(r.autoLaunch, join(app.getAppPath(), 'ARAM Companion.app')));
    return r;
  });
  ipcMain.handle('phoneInfo', () => ({ running: !!phone?.running, url: phone?.url() ?? null, error: phoneError }));
  ipcMain.handle('refreshData', () => engine.refreshData(true));
  ipcMain.handle('importHistory', () => engine.importHistory());
  ipcMain.handle('getHistory', () => engine.getHistory());
  ipcMain.handle('exportIntelligenceDiagnostic', async () => {
    try {
      const r = await dialog.showSaveDialog(mainWin!, {
        title: 'Enregistrer le diagnostic des données du jeu',
        defaultPath: join(app.getPath('documents'), 'aram-companion-diagnostic-jeu.json'),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (r.canceled || !r.filePath) return { ok: false, message: 'Enregistrement annulé.' };
      const report = await collectIntelligenceDiagnostic();
      await writeFile(r.filePath, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), platform: process.platform, report }, null, 2), 'utf8');
      return {
        ok: true,
        message: report.status === 'live-acquisition-verified'
          ? 'Rapport enregistré. Données Live Client reçues ; positions cachées et lancements ennemis toujours non validés.'
          : 'Rapport enregistré. Aucune acquisition Live Client : recommence sur le Mac pendant une partie.',
      };
    } catch {
      return { ok: false, message: 'Le diagnostic n’a pas pu être enregistré. Vérifie le dossier choisi puis réessaie.' };
    }
  });
  ipcMain.handle('exportHistory', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(mainWin!, {
      title: 'Sauvegarder ton historique',
      defaultPath: join(app.getPath('documents'), `aram-companion-historique-${day}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, message: 'Sauvegarde annulée' };
    const games = engine.rawHistory();
    try {
      await writeFile(r.filePath, JSON.stringify({ version: 1, exportedAt: Date.now(), games }, null, 1), 'utf8');
    } catch {
      return { ok: false, message: 'Sauvegarde impossible : vérifie le dossier choisi puis réessaie.' };
    }
    return { ok: true, message: `${games.length} parties sauvegardées` };
  });
  ipcMain.handle('gameDetail', (_e, id: number) => engine.gameDetail(Number(id)));
  ipcMain.handle('championAugments', (_e, id: number) => engine.championAugments(Number(id)));
  ipcMain.handle('championBuild', (_e, id: number, lane?: string) => engine.championBuild(Number(id), typeof lane === 'string' ? lane : undefined));
  ipcMain.handle('laneTier', (_e, lane: string) => engine.laneTier(String(lane)));
  ipcMain.handle('currentLane', () => engine.currentLane());
  ipcMain.handle('championLanes', (_e, id: number) => engine.championLanes(Number(id)));
  ipcMain.handle('listChampions', () => engine.listChampions());
  ipcMain.handle('poolReport', () => engine.poolReport());
  ipcMain.handle('balanceChanges', () => engine.balanceChanges());
  ipcMain.handle('relaunch', () => {
    if (!canRelaunch(engine.state.phase)) return { ok: false, message: 'Partie en cours : relance après la partie.' };
    app.relaunch();
    app.quit();
    return { ok: true, message: '' };
  });
  ipcMain.handle('cardReader', async (_e, test: boolean | 'request' | 'settings') => {
    if (test === 'settings') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      return { permission: screenPermission(), message: 'Réglages Système ouverts : active « ARAM Companion » (ou « Electron ») puis relance l’app.' };
    }
    if (test === 'request') {
      // Remet la décision à zéro (macOS ne redemande jamais sinon), puis déclenche la demande système.
      // Ici seulement on passe par desktopCapturer : c'est lui qui affiche la fenêtre de macOS (Celian est devant).
      for (const id of ['com.github.Electron', 'fr.celian.aram-companion.launcher'])
        await new Promise((r) => execFile('tccutil', ['reset', 'ScreenCapture', id], { timeout: 5000 }, () => r(null)));
      try {
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
      } catch {
        /* refus : on le voit au statut */
      }
      const p = screenPermission();
      return {
        permission: p,
        message: p === 'granted' ? 'Autorisé. Relance l’app si macOS le demande, puis « Tester la lecture ».' : 'Si tu as accepté, macOS demande de relancer l’app (Quitter et rouvrir). Sinon : « Ouvrir les Réglages Système ».',
      };
    }
    const perm = screenPermission();
    if (!test) return { permission: perm, message: '' };
    if (process.platform !== 'darwin') return { permission: perm, message: 'macOS uniquement' };
    const r = await cardReader.scanNow(true);
    const after = screenPermission();
    let message: string;
    if (after !== 'granted')
      message =
        'macOS n’autorise pas encore la capture. Réglages Système → Confidentialité et sécurité → Enregistrement de l’écran et de l’audio système : active « ARAM Companion » (ou « Electron »). S’il n’y est pas, ajoute-le avec « + » (Documents → aram-companion → ARAM Companion). Puis relance l’app.';
    else if (r.error) message = `Lecture impossible : ${r.error}`;
    else if (r.read) message = `${r.read.names.join(' · ')}${r.read.unsure ? ` (${r.read.unsure})` : ''}`;
    else message = `Capture OK, ${r.lines} lignes de texte lues, aucune carte d’augment reconnue${r.sample.length ? ` (ex. « ${r.sample.slice(0, 3).join(' », « ')} »)` : ''}.`;
    return { permission: after, message };
  });
  ipcMain.handle('listDisplays', () => screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: displayLabel(d, i) })));
  ipcMain.handle('testOverlay', async () => {
    if (!(await engine.previewPanel())) return { ok: false, message: 'Aucun champion à afficher (joue une partie ou importe ton historique)' };
    if (engine.state.settings.panelMode === 'window') {
      const label = await showSecond();
      return { ok: true, message: `Fenêtre en jeu ouverte sur ${label}` };
    }
    const { display, how } = await resolveOverlayDisplay(true);
    placeOverlay(display);
    overlayTestUntil = Date.now() + 15000;
    updateOverlay(engine.state);
    setTimeout(() => updateOverlay(engine.state), 15500);
    const label = displayLabel(display, screen.getAllDisplays().findIndex((d) => d.id === display.id));
    return { ok: true, message: `Panneau affiché 15 s sur ${label} — ${how}` };
  });
}

// Mode démo / test : faux client (port + token) et données arammeta locales.
function engineOptions() {
  const dataDir = process.env.ARAM_DATA_DIR || app.getPath('userData');
  // Captures de diagnostic dans le dossier du projet (probe-output/), lisibles par les sessions de développement
  const opts: ConstructorParameters<typeof Engine>[0] = { dataDir, probeDir: process.env.ARAM_DEMO_PORT ? undefined : join(app.getAppPath(), 'probe-output') };
  if (process.env.ARAM_DEMO_PORT) {
    const creds = { port: Number(process.env.ARAM_DEMO_PORT), token: process.env.ARAM_DEMO_TOKEN || 'secret' };
    opts.discover = async () => creds;
    opts.live = { port: Number(process.env.ARAM_DEMO_PORT) }; // le faux client sert aussi /liveclientdata
  }
  if (process.env.ARAM_FIXTURES) {
    const dir = process.env.ARAM_FIXTURES;
    opts.arammeta = new Arammeta(join(dataDir, 'cache'), async (url) => readFileSync(join(dir, url.replace('https://arammeta.com/api/', '')), 'utf8'));
    opts.balance = new Balance(join(dataDir, 'cache'), async () => {
      throw new Error('démo hors ligne');
    });
    opts.augInfoFetcher = async () => readFileSync(join(dir, 'mayhem-augments.lua'), 'utf8');
    opts.ddragonFetcher = async (url) => readFileSync(join(dir, 'ddragon', url.split('/data/en_US/').pop()!.replace('champion/', '')), 'utf8');
  }
  return opts;
}

async function smokeTest(): Promise<void> {
  const errors: string[] = [];
  for (const w of [mainWin!, overlayWin!]) {
    w.webContents.on('console-message', (details) => {
      if (details.level === 'error' || details.level === 'warning') errors.push(details.message);
    });
  }
  await new Promise((r) => setTimeout(r, Number(process.env.ARAM_SMOKE_WAIT || 4000)));
  if (process.env.ARAM_SMOKE_CARDS) {
    // Cartes « lues » simulées : on passe par la vraie correspondance avec des lignes de texte factices
    const names = process.env.ARAM_SMOKE_CARDS.split('|');
    const pool = engine.cardPool() ?? [];
    const lines = names.map((text, i) => ({ text, conf: 0.9, x: 0.08 + i * 0.3, y: 0.3, w: 0.2, h: 0.04 }));
    engine.setOffered(matchCards(lines, pool));
    await new Promise((r) => setTimeout(r, 600));
  }
  if (process.env.ARAM_SMOKE_HEADLINER) {
    // Bannière de headliner « lue » simulée (même correspondance stricte qu'en vrai)
    const h = headlinerFromText([process.env.ARAM_SMOKE_HEADLINER]);
    if (h) engine.setHeadliner(h.info, 'écran', h.text);
    await new Promise((r) => setTimeout(r, 600));
  }
  if (process.env.ARAM_SMOKE_SKILLS && engine.state.build) {
    engine.state.build.skills = { order: process.env.ARAM_SMOKE_SKILLS.split(''), max: ['Q', 'W', 'E'], source: 'OP.GG, ARAM' };
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (process.env.ARAM_SMOKE_THREAT && engine.state.build && engine.state.nextBuy?.rows[0]) {
    // Menace repoussée après le build (mêmes valeurs que test/engine-threat.test.ts)
    const plan = engine.state.nextBuy.rows[0].item.id;
    engine.state.build.itemStats = [{ id: 6662, winrate: 0.5064, games: 1090 }, { id: plan, winrate: 0.5693, games: 22411 }];
    const panel = { gameKey: 'smoke', role: 'tank', enemies: engine.state.counters?.enemies ?? [], threats: [{ key: 'armor', title: 'Armure', why: '3 ennemis font surtout des dégâts physiques', champions: [], urgent: true, items: [{ id: 6662, name: 'Iceborn Gauntlet', icon: null }] }] };
    (engine as unknown as { counterPanel: () => Promise<unknown> }).counterPanel = async () => panel;
    await new Promise((r) => setTimeout(r, 2500));
  }
  const tab = process.env.ARAM_SMOKE_TAB;
  if (tab) {
    await mainWin!.webContents.executeJavaScript(`window.__setTab && window.__setTab(${JSON.stringify(tab)})`);
    await new Promise((r) => setTimeout(r, 800));
  }
  if (process.env.ARAM_SMOKE_JS) {
    // Interaction scriptée pour les captures (ex. cliquer « Faille » dans la tier list)
    await mainWin!.webContents.executeJavaScript(process.env.ARAM_SMOKE_JS);
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (process.env.ARAM_SMOKE_EXPLORE) {
    await mainWin!.webContents.executeJavaScript(`window.__explore && window.__explore(${Number(process.env.ARAM_SMOKE_EXPLORE)})`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  const text = await mainWin!.webContents.executeJavaScript('document.body.innerText');
  const shot = process.env.ARAM_SMOKE_SHOT;
  const size = process.env.ARAM_SMOKE_SIZE?.split('x').map(Number);
  if (size?.length === 2) {
    mainWin!.setContentSize(size[0], size[1]);
    await new Promise((r) => setTimeout(r, 600));
  }
  if (shot) {
    writeFileSync(shot, (await mainWin!.webContents.capturePage()).toPNG());
    overlayWin!.showInactive();
    await new Promise((r) => setTimeout(r, 500));
    writeFileSync(shot.replace(/\.png$/, '-overlay.png'), (await overlayWin!.webContents.capturePage()).toPNG());
  }
  if (process.env.ARAM_SMOKE_SECOND && shot) {
    await showSecond();
    await new Promise((r) => setTimeout(r, 1500));
    writeFileSync(shot.replace(/\.png$/, '-second.png'), (await secondWin!.webContents.capturePage()).toPNG());
  }
  console.log(JSON.stringify({ smoke: 'ok', textLength: text.length, text: text.slice(0, 400), errors }));
  app.exit(errors.length ? 1 : 0);
}

const ICON = join(__dirname, '..', '..', 'build', 'icon', 'icon.png');

// Une seule instance : un 2e lancement (agent launchd, double-clic) ramène simplement la fenêtre existante.
if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => {
  if (!mainWin || mainWin.isDestroyed()) return;
  // Agent launchd (client League qui s'ouvre ou se ferme) : pas de vol du focus, la fenêtre revient seulement si cachée.
  if (argv.includes(BACKGROUND_ARG)) {
    if (!mainWin.isVisible() || mainWin.isMinimized()) mainWin.showInactive();
    return;
  }
  // Double-clic sur le lanceur : la fenêtre revient devant, recalée dans l'écran (elle a pu rester sur un écran débranché).
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.setBounds(fitWindowBounds(mainWin.getBounds(), screen.getDisplayMatching(mainWin.getBounds()).workArea));
  mainWin.show();
  app.focus({ steal: true });
});

app.whenReady().then(async () => {
  // Icône du Dock (l'app tourne dans le binaire Electron générique : sans ça, icône Electron)
  try {
    // Le lanceur était déclaré « app d'arrière-plan » (LSUIElement) : on force l'icône dans le Dock et ⌘Tab
    if (process.platform === 'darwin') void app.dock?.show();
    if (process.platform === 'darwin' && existsSync(ICON)) app.dock?.setIcon(ICON);
  } catch {
    /* pas grave */
  }
  engine = new Engine(engineOptions());
  registerIpc();
  mainWin = createMain();
  overlayWin = createOverlay();
  engine.on('state', broadcast);
  await engine.start();
  cardReader = new CardReader(engine);
  if (!SMOKE) cardReader.start();
  if (!engine.state.settings.phoneToken) await engine.setSettings({ phoneToken: randomBytes(12).toString('hex') });
  await syncPhone();
  startUpdateCheck();

  globalShortcut.register('CommandOrControl+Shift+A', () => {
    overlayHidden = !overlayHidden;
    updateOverlay(engine.state);
  });
  // Lire les cartes d'augments maintenant (si la lecture automatique les a ratées)
  globalShortcut.register('CommandOrControl+Shift+R', () => void cardReader.scanNow().then((r) => r.read && engine.setOffered(r.read, r.context)));
  globalShortcut.register('CommandOrControl+Shift+M', cycleOverlayDisplay); // panneau sur l'écran suivant
  // Fenêtre second écran : l'afficher / la masquer à tout moment
  globalShortcut.register('CommandOrControl+Shift+S', async () => {
    if (secondWin && !secondWin.isDestroyed() && secondWin.isVisible()) secondWin.hide();
    else {
      await engine.previewPanel();
      await showSecond();
    }
  });
  placeOverlay(screen.getPrimaryDisplay());
  screen.on('display-metrics-changed', fitOpenWindows);
  screen.on('display-removed', fitOpenWindows);

  app.on('activate', () => {
    if (!mainWin || mainWin.isDestroyed()) mainWin = createMain();
    else mainWin.show();
  });

  if (SMOKE) void smokeTest();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  cardReader?.stop();
  phone?.stop();
});
app.on('window-all-closed', () => {
  engine?.stop();
  app.quit();
});
