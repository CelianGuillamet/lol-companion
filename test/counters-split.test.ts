import { describe, expect, it } from 'vitest';
import { damageSplit, damageText, enemyThreats } from '../src/core/counters';

const comp = (phys: number, magic: number, t = 0) => ({ phys, magic, true: t, front: 1, damage: 2, engage: 1, wave: 1, poke: 1, sustain: 1, cc: 1 });
const foes = [{ id: 1, comp: comp(3, 1) }, { id: 2, comp: comp(3, 1) }, { id: 3, comp: comp(3, 2) }, { id: 4, comp: comp(3, 1) }, { id: 5, comp: comp(3, 1) }];

describe('répartition des dégâts adverses', () => {
  it('donne le même chiffre que la menace', () => {
    const d = damageSplit(foes)!;
    expect(d.phys + d.magic).toBeCloseTo(1);
    const armor = enemyThreats(foes, 'ad').find((t) => t.key === 'armor')!;
    expect(armor).toBeTruthy();
    expect(damageText(d)).toBe('71 % physiques, 29 % magiques');
  });

  it('un ennemi en avance pèse plus, comme dans les menaces', () => {
    const fed = foes.map((f, i) => (i === 2 ? { id: f.id, comp: comp(0, 4), weight: 3 } : f));
    expect(damageSplit(fed)!.magic).toBeGreaterThan(damageSplit(foes)!.magic);
  });

  it('dégâts bruts : cités seulement à partir de 5 %', () => {
    expect(damageText({ phys: 0.48, magic: 0.48, true: 0.04 })).not.toContain('bruts');
    expect(damageText({ phys: 0.3, magic: 0.6, true: 0.1 })).toBe('60 % magiques, 30 % physiques, 10 % bruts');
  });

  it('moins de 3 ennemis connus : rien, pas un pourcentage sur 2 champions', () => {
    expect(damageSplit([{ id: 1, comp: comp(3, 1) }, { id: 2, comp: null }, { id: 3, comp: undefined }])).toBeNull();
    expect(damageSplit([])).toBeNull();
  });
});
