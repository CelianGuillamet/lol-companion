import { describe, it, expect } from 'vitest';
import https from 'node:https';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localRequest } from '../src/core/lcu';
import { History } from '../src/core/history';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/core/settings';
import { execFileSync } from 'node:child_process';
import type { HistoryGame } from '../src/core/types';

describe('client local : réponse coupée', () => {
  it('rend status 0 au lieu de rester bloqué quand la réponse est interrompue', async () => {
    const tls = mkdtempSync(join(tmpdir(), 'tls-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
      '-keyout', join(tls, 'key.pem'), '-out', join(tls, 'cert.pem')], { stdio: 'ignore' });
    const server = https.createServer({ key: readFileSync(join(tls, 'key.pem')), cert: readFileSync(join(tls, 'cert.pem')) }, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
      res.write('{"partiel":');
      setTimeout(() => res.socket?.destroy(), 20);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const r = await Promise.race([
      localRequest(port, 'GET', '/x', { timeoutMs: 2000 }),
      new Promise((res) => setTimeout(() => res('bloqué'), 3000)),
    ]);
    server.close();
    expect(r).toEqual({ status: 0, data: null });
  });
});

const g = (id: number): HistoryGame => ({ gameId: id, createdAt: id, mode: 'aram', championId: 1, win: true, kills: 0, deaths: 0, assists: 0, augments: [] } as unknown as HistoryGame);

describe('historique : fichier abîmé et écritures simultanées', () => {
  it('garde une copie d’un historique illisible avant de le réécrire', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hist-'));
    const file = join(dir, 'history.json');
    writeFileSync(file, '{"version":1,"games":[{"gameId":1');
    const h = new History(file);
    await h.load();
    expect(h.games).toEqual([]);
    expect(h.corruptBackup).not.toBeNull();
    expect(readFileSync(h.corruptBackup!, 'utf8')).toContain('"gameId":1');
  });

  it('enchaîne les sauvegardes sans perdre de partie', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hist-'));
    const file = join(dir, 'history.json');
    const h = new History(file);
    await h.load();
    await Promise.all([1, 2, 3, 4, 5].map((id) => h.add(g(id))));
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved.games.map((x: HistoryGame) => x.gameId).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(readdirSync(dir)).toEqual(['history.json']);
  });
});

describe('réglages', () => {
  it('écritures simultanées : le fichier reste lisible et garde la dernière valeur', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'set-'));
    const file = join(dir, 'settings.json');
    await Promise.all([8001, 8002, 8003].map((phonePort) => saveSettings(file, { ...DEFAULT_SETTINGS, phonePort })));
    expect((await loadSettings(file)).phonePort).toBe(8003);
  });
});

import { httpsText } from '../src/core/http';

describe('sources de données (arammeta, OP.GG, wiki…) : réponse coupée', () => {
  it('rejette proprement au lieu de rester en attente ou de lever une erreur orpheline', async () => {
    const tls = mkdtempSync(join(tmpdir(), 'tls-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
      '-keyout', join(tls, 'key.pem'), '-out', join(tls, 'cert.pem')], { stdio: 'ignore' });
    const cert = readFileSync(join(tls, 'cert.pem'));
    const server = https.createServer({ key: readFileSync(join(tls, 'key.pem')), cert }, (req, res) => {
      if (req.url === '/ok') return void res.end('bonjour');
      res.writeHead(200, { 'Content-Length': '1000' });
      res.write('début…');
      setTimeout(() => res.socket?.destroy(), 20);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `https://127.0.0.1:${(server.address() as { port: number }).port}`;
    const agent = new https.Agent({ ca: cert });
    expect((await httpsText(`${base}/ok`, { timeoutMs: 2000, agent })).text).toBe('bonjour');
    const cut = await Promise.race([
      httpsText(`${base}/coupe`, { timeoutMs: 2000, agent }).then(() => 'résolu', (e: Error) => e.message),
      new Promise((r) => setTimeout(() => r('bloqué'), 3000)),
    ]);
    server.close();
    expect(cut).toBe('réponse interrompue');
  });
});
