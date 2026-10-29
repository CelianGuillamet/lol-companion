import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Usage, followStat } from '../src/core/usage';

describe('usage', () => {
  it('compte les choix suivis / non suivis et ignore les lectures incomplètes', () => {
    const base = { at: 0, gameId: 1, round: 2, ids: [1, 2, 3] };
    const s = followStat([
      { type: 'card_picked', ...base, best: 1, picked: 1, followed: true, win: true },
      { type: 'card_picked', ...base, best: 1, picked: 1, followed: true, win: false },
      { type: 'card_picked', ...base, best: 1, picked: 3, followed: false, win: false },
      { type: 'card_picked', ...base, best: 1, picked: null, followed: false, win: true }, // carte prise non lue
      { type: 'ocr_miss', at: 0, text: 'x' },
    ]);
    expect(s).toEqual({ followed: { picks: 2, wins: 1 }, ignored: { picks: 1, wins: 0 } });
  });

  it('écrit le fichier local et le relit', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'usage-')), 'usage.json');
    const u = new Usage(file);
    u.add({ type: 'ocr_miss', at: 1, text: 'Goliath?' });
    await u.flush();
    expect(JSON.parse(await readFile(file, 'utf8')).events).toHaveLength(1);
    const v = new Usage(file);
    await v.load();
    expect(v.events[0]).toMatchObject({ text: 'Goliath?' });
  });
});
