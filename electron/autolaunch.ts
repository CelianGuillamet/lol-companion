// Lancement automatique via launchd (agent utilisateur macOS) : à l'ouverture de session, ou quand le client
// League démarre (surveillance de son lockfile). L'agent ouvre le lanceur « ARAM Companion.app » du projet.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type AutoLaunch = 'off' | 'login' | 'league';

export const AGENT_LABEL = 'fr.celian.aram-companion.autolaunch';
const LEAGUE_LOCKFILES = ['/Applications/League of Legends.app/Contents/LoL/lockfile', `${homedir()}/Applications/League of Legends.app/Contents/LoL/lockfile`];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Contenu du plist launchd (exporté pour les tests). */
export function agentPlist(mode: Exclude<AutoLaunch, 'off'>, launcherApp: string, lockfiles: string[] = LEAGUE_LOCKFILES): string {
  const trigger =
    mode === 'login'
      ? '  <key>RunAtLoad</key><true/>\n'
      : `  <key>WatchPaths</key>\n  <array>\n${lockfiles.map((p) => `    <string>${esc(p)}</string>`).join('\n')}\n  </array>\n`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-g</string>
    <string>${esc(launcherApp)}</string>
  </array>
${trigger}  <key>ThrottleInterval</key><integer>30</integer>
</dict>
</plist>
`;
}

const run = (cmd: string, args: string[]) => new Promise<void>((resolve) => execFile(cmd, args, () => resolve()));

/** Installe / retire l'agent. Retourne un message pour le journal. */
export async function applyAutoLaunch(mode: AutoLaunch, launcherApp: string): Promise<string> {
  if (process.platform !== 'darwin') return 'Lancement automatique : macOS uniquement';
  const dir = join(homedir(), 'Library', 'LaunchAgents');
  const file = join(dir, `${AGENT_LABEL}.plist`);
  const uid = process.getuid?.() ?? 501;
  await run('/bin/launchctl', ['bootout', `gui/${uid}/${AGENT_LABEL}`]); // ancien agent, s'il existe
  if (mode === 'off') {
    if (existsSync(file)) await unlink(file).catch(() => undefined);
    return 'Lancement automatique désactivé';
  }
  if (!existsSync(launcherApp)) return `Lancement automatique impossible : ${launcherApp} introuvable`;
  await mkdir(dir, { recursive: true });
  await writeFile(file, agentPlist(mode, launcherApp));
  await run('/bin/launchctl', ['bootstrap', `gui/${uid}`, file]);
  return mode === 'login' ? 'L’app se lancera à l’ouverture de ta session' : 'L’app se lancera quand le client League démarre';
}
