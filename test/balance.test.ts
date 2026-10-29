import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Balance, badges, parseWikiLua } from '../src/core/balance';

const LUA = `return {
  ["Aatrox"] = {
    ["id"] = 266,
    ["apiname"] = "Aatrox",
    ["stats"] = {
      ["hp_base"] = 650,
      ["aram"] = {
        ["dmg_dealt"] = 1.05,
        ["dmg_taken"] = 0.95,
      },
    },
  },
  ["Kai'Sa"] = {
    ["id"] = 145,
    ["stats"] = {
      ["aram"] = { ["dmg_dealt"] = 0.95, ["ability_haste"] = -10 },
      ["mayhem"] = { ["dmg_dealt"] = 0.9 },
    },
  },
  ["Annie"] = {
    ["id"] = 1,
    ["stats"] = { ["hp_base"] = 560 },
  },
}`;

describe('équilibrage ARAM', () => {
  it('lit les sous-tables aram / mayhem du module Lua du wiki', () => {
    const m = parseWikiLua(LUA);
    expect(m.get('aatrox')?.aram).toEqual({ dmg_dealt: 1.05, dmg_taken: 0.95 });
    expect(m.get('kaisa')?.mayhem).toEqual({ dmg_dealt: 0.9 });
    expect(m.has('annie')).toBe(false);
  });

  it('transforme en badges lisibles', () => {
    expect(badges({ dmg_dealt: 1.05, dmg_taken: 0.95, healing: 1, ability_haste: -10 })).toEqual([
      { label: '+5 % dégâts', good: true },
      { label: '−5 % dégâts subis', good: true },
      { label: '−10 accélération', good: false },
    ]);
    expect(badges(null)).toEqual([]);
  });

  it('garde l’instantané embarqué si le wiki est injoignable', async () => {
    const b = new Balance(mkdtempSync(join(tmpdir(), 'bal-')), async () => {
      throw new Error('hors ligne');
    });
    await b.load();
    expect(b.source).toBe('instantané');
    expect(b.forChampion(['Jinx'], 'mayhem')).toMatchObject({ dmg_dealt: 0.9 });
    expect(b.forChampion(['Kaisa', "Kai'Sa"], 'aram')).not.toBeNull();
  });
});

import { diffBalance } from '../src/core/balance';
describe('changements d’équilibrage', () => {
  it('détecte les modificateurs qui ont bougé, en traitant les absents comme neutres', () => {
    const next = new Map<string, { aram?: Record<string, number> }>([
      ['jinx', { aram: { dmg_dealt: 0.9, dmg_taken: 1.05 } }],
      ['ahri', { aram: { dmg_dealt: 1 } }],
      ['nouveau', { aram: { dmg_dealt: 1.1 } }],
    ]);
    const d = diffBalance({ jinx: { dmg_dealt: 0.95, dmg_taken: 1.05 }, ahri: { dmg_dealt: 1, healing: 1 } }, next, 1);
    expect(d.map((c) => c.champion)).toEqual(['jinx']);
    expect(d[0].before.dmg_dealt).toBe(0.95);
  });
});
