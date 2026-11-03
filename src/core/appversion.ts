// Version de l'app : celle qui tourne, celle posée sur le disque par une session planifiée. Les sessions déploient sans
// relancer (AGENT.md, règle 4), donc l'app peut tourner longtemps sur du vieux code : on le dit, et Celian relance d'un clic.

export interface AppVersionEntry {
  version: string;
  title: string;
}

export interface AppUpdate {
  latest: string;
  /** Nombre de versions posées sur le disque et pas encore lancées. */
  count: number;
  /** Les plus récentes d'abord, 5 au plus. */
  news: AppVersionEntry[];
}

const HEADING = /^##\s+(v\d+(?:\.\d+)+)\s*(.*)$/;

/** Les titres de CHANGELOG.md, du plus récent au plus ancien. Le titre est ce qui suit la date, s'il y en a un. */
export function parseChangelog(text: string): AppVersionEntry[] {
  const out: AppVersionEntry[] = [];
  for (const line of text.split('\n')) {
    const m = HEADING.exec(line.trim());
    if (!m) continue;
    const parts = m[2].split(/\s+—\s+/).map((p) => p.trim()).filter(Boolean);
    out.push({ version: m[1], title: parts.slice(1).join(' — ') });
  }
  return out;
}

/** > 0 si `a` est plus récente que `b`. Compare nombre par nombre : v1.9 < v1.10. */
export function compareVersions(a: string, b: string): number {
  const nums = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const x = nums(a);
  const y = nums(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Ce qui attend d'être lancé, `null` si l'app est à jour ou si la version en cours est inconnue. */
export function updateFrom(running: string | null, entries: AppVersionEntry[]): AppUpdate | null {
  if (!running) return null;
  const newer = entries.filter((e) => compareVersions(e.version, running) > 0).sort((a, b) => compareVersions(b.version, a.version));
  if (!newer.length) return null;
  return { latest: newer[0].version, count: newer.length, news: newer.slice(0, 5) };
}

/**
 * Relancer coupe la lecture des cartes et le suivi de la partie. Permis seulement hors partie : ni champ select, ni
 * chargement, ni fin de partie, où l'enregistrement peut encore tourner.
 */
export const canRelaunch = (phase: string | null | undefined): boolean => !phase || ['None', 'Lobby', 'Matchmaking'].includes(phase);

export const NUDGE_EVERY_MS = 6 * 3_600_000;

/** Rappel système : en entrant au salon, le dernier moment utile avant la partie, pas plus d'une fois toutes les 6 h. */
export function shouldNudge(phase: string | null | undefined, update: AppUpdate | null | undefined, lastAt: number, now: number): boolean {
  return !!update && (phase === 'Lobby' || phase === 'Matchmaking') && now - lastAt >= NUDGE_EVERY_MS;
}
