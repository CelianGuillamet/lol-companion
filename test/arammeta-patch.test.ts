import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Arammeta } from '../src/core/arammeta';

describe('rechargement forcé au changement de patch', () => {
  it('ne garde pas le détail du patch d’avant, et retombe sur le disque hors ligne', async () => {
    let patch = '16.21';
    let online = true;
    const fetcher = async (url: string) => {
      if (!online) throw new Error('hors ligne');
      return JSON.stringify(url.includes('tier-list') ? { champs: {}, augs: {}, patch_prefix: patch } : { boots: { top: [{ name_en: patch, slug: '1', g: 1, wr: 0.5 }] } });
    };
    const meta = new Arammeta(mkdtempSync(join(tmpdir(), 'aram-meta-')), fetcher);
    await meta.load();
    expect((await meta.detail(89))?.boots?.top?.[0].name_en).toBe('16.21');
    patch = '16.22';
    await meta.load(true);
    expect((await meta.detail(89))?.boots?.top?.[0].name_en).toBe('16.22');
    online = false;
    await meta.load(true);
    expect((await meta.detail(89))?.boots?.top?.[0].name_en).toBe('16.22');
  });
});
