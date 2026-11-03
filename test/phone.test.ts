import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PhoneServer } from '../electron/phone';

const root = mkdtempSync(join(tmpdir(), 'renderer-'));
mkdirSync(join(root, 'assets'));
writeFileSync(join(root, 'index.html'), '<html>ok</html>');
writeFileSync(join(root, 'assets', 'a.js'), 'console.log(1)');
writeFileSync(join(tmpdir(), 'secret.txt'), 'secret');
let state = { phase: 'InProgress' };
const srv = new PhoneServer(root, 'tok123', { state: () => state, history: () => [1, 2], detail: async (id) => ({ id }) });
afterAll(() => srv.stop());

describe('serveur téléphone', () => {
  it('sert l’interface, refuse l’API sans jeton et les chemins hors du dossier', async () => {
    await srv.start(0, '127.0.0.1');
    const base = `http://127.0.0.1:${srv.port}`;
    expect(await (await fetch(`${base}/`)).text()).toContain('ok');
    expect((await fetch(`${base}/assets/a.js`)).headers.get('content-type')).toContain('javascript');
    expect((await fetch(`${base}/api/state`)).status).toBe(403);
    expect(await (await fetch(`${base}/api/state?t=tok123`)).json()).toEqual(state);
    expect(await (await fetch(`${base}/api/detail/42?t=tok123`)).json()).toEqual({ id: 42 });
    expect((await fetch(`${base}/..%2Fsecret.txt`)).status).not.toBe(200);
    expect((await fetch(`${base}/api/state?t=tok123`, { method: 'POST' })).status).toBe(405);
  });

  it('pousse les nouveaux états en direct (SSE)', async () => {
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/events?t=tok123`);
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('InProgress');
    state = { phase: 'EndOfGame' };
    srv.push(state);
    const next = new TextDecoder().decode((await reader.read()).value);
    expect(next).toContain('EndOfGame');
    await reader.cancel();
  });
});

describe('serveur téléphone : signaler un sort ennemi', () => {
  const calls: unknown[][] = [];
  const s2 = new PhoneServer(root, 'tok456', {
    state: () => ({}),
    history: () => [],
    detail: async () => null,
    markSpell: async (...a) => {
      calls.push(a);
      return { ok: true, message: 'ok' };
    },
  });
  afterAll(() => s2.stop());

  it('seule action permise, avec jeton, paramètres vérifiés', async () => {
    await s2.start(0, '127.0.0.1');
    const base = `http://127.0.0.1:${s2.port}/api/spell`;
    expect((await fetch(`${base}?c=103&s=D&a=cast`, { method: 'POST' })).status).toBe(403);
    expect((await fetch(`${base}?t=tok456&c=103&s=Q&a=cast`, { method: 'POST' })).status).toBe(400);
    expect((await fetch(`${base}?t=tok456&c=103&s=D&a=delete`, { method: 'POST' })).status).toBe(400);
    expect(await (await fetch(`${base}?t=tok456&c=103&s=D&a=shift&d=-10`, { method: 'POST' })).json()).toEqual({ ok: true, message: 'ok' });
    expect(calls).toEqual([[103, 'D', 'shift', -10]]);
    expect((await fetch(`http://127.0.0.1:${s2.port}/api/state?t=tok456`, { method: 'POST' })).status).toBe(405);
  });
});
