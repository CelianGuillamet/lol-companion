// Arrêt de la boucle du moteur pendant un tick en cours (promesse différée) : elle ne doit pas repartir.
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../src/core/engine';
import { Balance } from '../src/core/balance';
import { Arammeta } from '../src/core/arammeta';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function deferredEngine() {
  const dataDir = mkdtempSync(join(tmpdir(), 'aram-loop-'));
  const pending: ((v: null) => void)[] = [];
  let calls = 0;
  const engine = new Engine({
    dataDir,
    pollMs: 5,
    // Le client n'est jamais trouvé, et chaque recherche reste en suspens jusqu'à ce que le test la libère
    discover: () => {
      calls++;
      return new Promise((resolve) => pending.push(resolve));
    },
    arammeta: new Arammeta(join(dataDir, 'cache'), async () => { throw new Error('hors ligne'); }),
    balance: new Balance(join(dataDir, 'bal'), async () => { throw new Error('hors ligne'); }),
    live: { port: 1 },
  });
  const release = () => pending.splice(0).forEach((r) => r(null));
  return { engine, release, calls: () => calls };
}

describe('boucle du moteur', () => {
  it('ne repart pas si stop() arrive pendant un tick en cours', async () => {
    const { engine, release, calls } = deferredEngine();
    await engine.start();
    await wait(20);
    expect(calls()).toBe(1); // 1er tick en attente du client
    engine.stop();
    release(); // le tick se termine après l'arrêt
    await wait(50);
    expect(engine.looping).toBe(false);
    expect(calls()).toBe(1);
  });

  it('tourne normalement sans arrêt, puis s’arrête net', async () => {
    const { engine, release, calls } = deferredEngine();
    await engine.start();
    for (let i = 0; i < 3; i++) {
      await wait(15);
      release();
    }
    await wait(15);
    expect(calls()).toBeGreaterThanOrEqual(3);
    engine.stop();
    release();
    const n = calls();
    await wait(50);
    expect(calls()).toBe(n);
    expect(engine.looping).toBe(false);
  });

  it('un redémarrage pendant un tick ne crée pas deux boucles', async () => {
    const { engine, release, calls } = deferredEngine();
    await engine.start();
    await wait(15);
    engine.stop();
    await engine.start(); // tick n°2 lancé ; le n°1 est toujours en suspens
    await wait(15);
    release(); // les deux se terminent : seule la 2e boucle continue
    await wait(15);
    const pendingAfter = calls();
    release();
    await wait(15);
    // une seule boucle : au plus un tick de plus par libération
    expect(calls() - pendingAfter).toBeLessThanOrEqual(1);
    engine.stop();
    release();
  });
});
