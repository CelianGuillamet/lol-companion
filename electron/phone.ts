// Panneau sur téléphone / tablette : petit serveur HTTP sur le réseau local qui sert l'interface « second écran »
// en lecture seule. Utile avec un seul écran, quand le jeu en plein écran cache tout.
// Sécurité : jeton aléatoire obligatoire pour l'API, aucune action possible (ni choix de champion, ni réglages),
// fichiers servis uniquement depuis le dossier de l'interface.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import os from 'node:os';

export interface PhoneDeps {
  state: () => unknown;
  history: () => unknown;
  detail: (gameId: number) => Promise<unknown>;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

/** Adresse IPv4 locale (Wi-Fi / Ethernet) pour composer l'URL à ouvrir sur le téléphone. */
export function lanAddress(): string | null {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
  }
  return null;
}

export class PhoneServer {
  private server: http.Server | null = null;
  private clients = new Set<http.ServerResponse>();
  port = 0;

  constructor(
    private root: string,
    private token: string,
    private deps: PhoneDeps,
  ) {}

  get running(): boolean {
    return !!this.server;
  }

  url(): string | null {
    const ip = lanAddress();
    return this.server && ip ? `http://${ip}:${this.port}/?t=${this.token}#second` : null;
  }

  async start(port: number, host = '0.0.0.0'): Promise<void> {
    if (this.server) return;
    const server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve());
    });
    this.server = server;
    const addr = server.address();
    this.port = typeof addr === 'object' && addr ? addr.port : port;
  }

  stop(): void {
    for (const c of this.clients) c.end();
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }

  /** Envoie le nouvel état aux téléphones connectés (Server-Sent Events). */
  push(state: unknown): void {
    if (!this.clients.size) return;
    const msg = `data: ${JSON.stringify(state)}\n\n`;
    for (const c of this.clients) c.write(msg);
  }

  private authorized(req: http.IncomingMessage): boolean {
    const url = new URL(req.url ?? '/', 'http://x');
    return url.searchParams.get('t') === this.token;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (data: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    if (req.method !== 'GET') return json({ error: 'lecture seule' }, 405);

    if (url.pathname.startsWith('/api/')) {
      if (!this.authorized(req)) return json({ error: 'jeton invalide' }, 403);
      if (url.pathname === '/api/state') return json(this.deps.state());
      if (url.pathname === '/api/history') return json(this.deps.history());
      const m = url.pathname.match(/^\/api\/detail\/(\d+)$/);
      if (m) return json(await this.deps.detail(Number(m[1])));
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(this.deps.state())}\n\n`);
        this.clients.add(res);
        req.on('close', () => this.clients.delete(res));
        return;
      }
      return json({ error: 'inconnu' }, 404);
    }

    // Fichiers de l'interface (dist/renderer), sans sortir du dossier
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = normalize(join(this.root, rel));
    if (!file.startsWith(this.root + sep) && file !== this.root) return json({ error: 'interdit' }, 403);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      json({ error: 'introuvable' }, 404);
    }
  }
}
