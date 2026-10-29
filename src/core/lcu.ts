// Connexion à l'API locale du client League (LCU).
// Identifiants : arguments du process LeagueClientUx (prioritaire) ou lockfile.

import https from 'node:https';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';

export interface Credentials {
  port: number;
  token: string;
  host?: string; // 127.0.0.1 par défaut (surchargé dans les tests)
}

export interface LcuResponse<T = unknown> {
  status: number; // 0 = erreur réseau
  data: T | null;
}

const LOCKFILES = [
  '/Applications/League of Legends.app/Contents/LoL/lockfile',
  `${homedir()}/Applications/League of Legends.app/Contents/LoL/lockfile`,
];

export function parseProcessArgs(psOutput: string): Credentials | null {
  for (const line of psOutput.split('\n')) {
    if (!line.includes('LeagueClientUx') || !line.includes('--app-port=')) continue;
    const port = Number(line.match(/--app-port=(\d+)/)?.[1]);
    const token = line.match(/--remoting-auth-token=([\w-]+)/)?.[1];
    if (port && token) return { port, token };
  }
  return null;
}

export function parseLockfile(content: string): Credentials | null {
  // Format : name:pid:port:password:protocol
  const parts = content.trim().split(':');
  const port = Number(parts[2]);
  const token = parts[3];
  return port && token ? { port, token } : null;
}

function ps(): Promise<string> {
  return new Promise((resolve) => {
    // -ww : ne pas tronquer les lignes (sinon le token peut être coupé)
    execFile('ps', ['-Aww', '-o', 'args='], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout));
  });
}

export async function discoverCredentials(): Promise<Credentials | null> {
  const fromPs = parseProcessArgs(await ps());
  if (fromPs) return fromPs;
  for (const path of LOCKFILES) {
    try {
      const creds = parseLockfile(await readFile(path, 'utf8'));
      if (creds) return creds;
    } catch {
      /* fichier absent : client fermé */
    }
  }
  return null;
}

// Certificat auto-signé de Riot : on n'accepte cette exception que pour 127.0.0.1.
const localAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

export function localRequest<T>(
  port: number,
  method: string,
  path: string,
  options: { token?: string; body?: unknown; host?: string; timeoutMs?: number } = {},
): Promise<LcuResponse<T>> {
  return new Promise((resolve) => {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.token) headers.Authorization = 'Basic ' + Buffer.from(`riot:${options.token}`).toString('base64');
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(payload));
    }
    const req = https.request(
      { host: options.host ?? '127.0.0.1', port, path, method: method.toUpperCase(), headers, agent: localAgent, timeout: options.timeoutMs ?? 4000 },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let data: unknown = null;
          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }
          }
          resolve({ status: res.statusCode ?? 0, data: data as T });
        });
      },
    );
    req.on('error', () => resolve({ status: 0, data: null }));
    req.on('timeout', () => req.destroy());
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

export class LcuClient {
  constructor(public readonly creds: Credentials) {}

  request<T = unknown>(method: string, path: string, body?: unknown): Promise<LcuResponse<T>> {
    return localRequest<T>(this.creds.port, method, path, { token: this.creds.token, body, host: this.creds.host });
  }

  async get<T = unknown>(path: string): Promise<T | null> {
    const r = await this.request<T>('GET', path);
    return r.status === 200 ? r.data : null;
  }
}

// API Live Client Data (en partie, port 2999, sans authentification).
export async function liveClient<T = unknown>(path: string, port = 2999, host?: string): Promise<T | null> {
  const r = await localRequest<T>(port, 'GET', `/liveclientdata/${path}`, { host, timeoutMs: 2000 });
  return r.status === 200 ? r.data : null;
}
