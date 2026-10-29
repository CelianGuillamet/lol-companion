import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { opggNames, parseCompact, parseRpc, readAnalysis } from '../src/core/opgg';

const sample = JSON.parse(readFileSync(new URL('./fixtures/opgg/opgg-sample-analysis.json', import.meta.url), 'utf8'));

describe('OP.GG', () => {
  it('relit le format compact', () => {
    const o = parseCompact('class A: x,y\nclass B: z\nA(1,[B("a\\"b"),B(true)])') as { x: number; y: { z: unknown }[] };
    expect(o.x).toBe(1);
    expect(o.y[0].z).toBe('a"b');
    expect(o.y[1].z).toBe(true);
  });

  it('lit une vraie analyse (Ahri mid, classée)', () => {
    const a = readAnalysis(sample.result, 'mid')!;
    expect(a.championId).toBe(103);
    expect(a.winRate).toBeCloseTo(0.51, 2);
    expect(a.damageType).toBe('AP');
    expect(a.core?.ids).toEqual([3118, 4645, 3157]);
    expect(a.boots?.ids).toEqual([3020]);
    expect(a.spells).toEqual([4, 14]);
    expect(a.runes?.primary).toBe(8100);
    expect(a.runes?.perks).toHaveLength(9);
    expect(a.losesTo[0]).toMatchObject({ name: 'Lux' });
    expect(a.losesTo[0].myWinRate).toBeCloseTo(0.47, 2);
    expect(a.beats[0].myWinRate).toBeGreaterThan(0.5);
    expect(a.skillMax).toEqual(['Q', 'W', 'E']);
    expect(a.fourth[0].ids).toEqual([3089]);
    expect(a.positions[0].name).toBe('MID');
  });

  it('lit une réponse JSON-RPC en flux SSE', () => {
    expect(parseRpc('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":1}}\n\n')).toMatchObject({ result: { ok: 1 } });
  });

  it('noms de champions', () => {
    expect(opggNames('Miss Fortune')).toContain('MISS_FORTUNE');
    expect(opggNames("Kai'Sa")).toContain('KAISA');
    expect(opggNames('Wukong', 'MonkeyKing')).toContain('MONKEY_KING');
  });
});
