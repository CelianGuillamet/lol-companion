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
