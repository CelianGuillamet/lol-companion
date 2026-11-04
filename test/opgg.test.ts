import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { OpggData, opggNames, parseCompact, parseRpc, readAnalysis, readStatsPatch, type OpggClient } from '../src/core/opgg';

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

describe('méta des rôles', () => {
  it('winrate précis (victoires / parties) quand win est donné, sinon win_rate arrondi', async () => {
    const client = { call: async () => ({ data: { positions: { mid: [{ champion: 'Ahri', play: 1000, win: 516, win_rate: 0.52, role_rate: 0.9, tier: 1 }, { champion: 'Lux', play: 1000, win_rate: 0.49, role_rate: 0.8, tier: 2 }] } } }) };
    const meta = await new OpggData(client as unknown as OpggClient).laneMeta();
    expect(meta.get('ahri')![0].winRate).toBeCloseTo(0.516, 5);
    expect(meta.get('lux')![0].winRate).toBe(0.49);
  });
});

describe('patch des stats OP.GG', () => {
  it('format compact : un seul objet Win', () => {
    expect(readAnalysis(sample.result, 'mid')!.statsPatch).toBe('16.21');
  });

  it('format JSON : la liste, le plus récent gagne, 16.9 reste avant 16.21', () => {
    expect(readStatsPatch({ win: [{ version: '16.9' }, { version: '16.21' }, { version: '16.20' }] })).toBe('16.21');
  });

  it('format inconnu : null, jamais une erreur', () => {
    for (const t of [undefined, null, {}, { win: null }, { win: [{ version: 16.21 }] }, { win: [null] }, 'x']) expect(readStatsPatch(t)).toBeNull();
  });
});
