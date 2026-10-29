// Trouve l'écran où tourne le jeu League (multi-écrans).
// macOS : liste des fenêtres via CoreGraphics (JXA), filtrée sur le PID du jeu. Les positions de fenêtres
// ne demandent aucune autorisation (seuls les titres en demandent). Même approche qu'UP! (CGWindowListCopyWindowInfo).

import { execFile } from 'node:child_process';
import { screen, type Display, type Rectangle } from 'electron';

export const GAME_BUNDLE = 'com.riotgames.LeagueofLegends.GameClient';
export const CLIENT_BUNDLE = 'com.riotgames.LeagueofLegends.LeagueClientUx';

const jxa = (bundleId: string) => `
ObjC.import('AppKit');
ObjC.import('CoreGraphics');
function run() {
  const apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(${JSON.stringify(bundleId)});
  const pids = [];
  for (let i = 0; i < apps.count; i++) pids.push(apps.objectAtIndex(i).processIdentifier);
  const raw = $.CGWindowListCopyWindowInfo(1, 0); // kCGWindowListOptionOnScreenOnly, kCGNullWindowID
  const list = ObjC.deepUnwrap(ObjC.castRefToObject(raw)) || [];
  let out = list
    .filter(w => pids.indexOf(w.kCGWindowOwnerPID) >= 0 && w.kCGWindowLayer === 0 && w.kCGWindowBounds)
    .map(w => w.kCGWindowBounds);
  // Jeu en plein écran (vraie partie du 28 oct. : processus trouvé mais aucune fenêtre « à l'écran ») : sa fenêtre
  // vit dans un autre Space et/ou sur un autre niveau → on cherche dans TOUTES les fenêtres du processus
  if (!out.length && pids.length) {
    const all = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(0, 0))) || [];
    out = all
      .filter(w => pids.indexOf(w.kCGWindowOwnerPID) >= 0 && w.kCGWindowBounds && w.kCGWindowBounds.Width >= 800 && w.kCGWindowBounds.Height >= 500)
      .map(w => w.kCGWindowBounds);
  }
  // Repli (vraie partie du 28 oct. : « aucune fenêtre trouvée ») : par nom du propriétaire, lisible avec
  // l'autorisation « Enregistrement de l'écran »
  if (!out.length && ${JSON.stringify(bundleId)}.indexOf('GameClient') >= 0)
    out = list
      .filter(w => /^League of Legends$/i.test(w.kCGWindowOwnerName || '') && w.kCGWindowLayer === 0 && w.kCGWindowBounds && w.kCGWindowBounds.Width >= 800)
      .map(w => w.kCGWindowBounds);
  // Diagnostic : propriétaires des grandes fenêtres visibles, pour comprendre un échec dans le journal
  const owners = out.length ? [] : list.filter(w => w.kCGWindowLayer === 0 && w.kCGWindowBounds && w.kCGWindowBounds.Width >= 800).map(w => w.kCGWindowOwnerName || '?');
  return JSON.stringify({ bounds: out, owners: owners, pids: pids.length });
}`;

export function windowBounds(bundleId: string): Promise<{ bounds: Rectangle[]; error: string | null }> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve({ bounds: [], error: 'macOS uniquement' });
    execFile('osascript', ['-l', 'JavaScript', '-e', jxa(bundleId)], { timeout: 4000 }, (err, stdout, stderr) => {
      if (err) return resolve({ bounds: [], error: (stderr || err.message).trim().slice(0, 200) });
      try {
        const j = JSON.parse(stdout.trim() || '{}') as { bounds?: { X: number; Y: number; Width: number; Height: number }[]; owners?: string[]; pids?: number };
        const list = j.bounds ?? [];
        resolve({
          bounds: list.map((b) => ({ x: b.X, y: b.Y, width: b.Width, height: b.Height })),
          error: list.length ? null : `processus du jeu : ${j.pids ?? 0}, grandes fenêtres visibles : ${[...new Set(j.owners ?? [])].join(', ') || 'aucune'}`,
        });
      } catch (e) {
        resolve({ bounds: [], error: `réponse illisible : ${stdout.slice(0, 120)}` });
      }
    });
  });
}

/** Écran qui contient la plus grande fenêtre de l'app donnée, sinon null. */
export async function displayOfApp(bundleId: string): Promise<{ display: Display | null; error: string | null }> {
  const { bounds, error } = await windowBounds(bundleId);
  const biggest = bounds.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return { display: biggest ? screen.getDisplayMatching(biggest) : null, error };
}

export function displayLabel(d: Display, index: number): string {
  const primary = d.id === screen.getPrimaryDisplay().id ? ' (principal)' : '';
  return `Écran ${index + 1} — ${d.size.width}×${d.size.height}${primary}`;
}
