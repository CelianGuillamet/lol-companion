import { describe, expect, it } from 'vitest';
import { PATCHES, augmentChange, championChange } from '../src/core/patchchanges';
import { parseAugmentModule, normName } from '../src/core/augfit';
import { readFileSync } from 'node:fs';

describe('cartes modifiées au patch', () => {
  it('stats du 16.21, client en 16.22 : la carte est signalée', () => {
    expect(augmentChange('Weapon of Destiny', '16.21', '16.22')).toMatchObject({ patch: '26.22', dir: 'nerf' });
    expect(augmentChange('Soul Eater', '16.21', '16.22')).toMatchObject({ dir: 'buff' });
  });

  it('se tait dès que les stats ont rattrapé le patch', () => {
    expect(augmentChange('Weapon of Destiny', '16.22', '16.22')).toBeNull();
    expect(augmentChange('Weapon of Destiny', '16.23', '16.23')).toBeNull();
  });

  it('se tait si le client n’a pas encore le patch', () => {
    expect(augmentChange('Weapon of Destiny', '16.21', '16.21')).toBeNull();
  });

  it('client inconnu : signale, le patch est sorti ; stats inconnues : rien', () => {
    expect(augmentChange('Weapon of Destiny', '16.21')).not.toBeNull();
    expect(augmentChange('Weapon of Destiny', null, '16.22')).toBeNull();
  });

  it('ponctuation et apostrophes du jeu comme du wiki', () => {
    expect(augmentChange('RISE', '16.21', '16.22')).toMatchObject({ dir: 'new' });
    expect(augmentChange('RISE!', '16.21', '16.22')).toMatchObject({ dir: 'new' });
    expect(augmentChange("Take'em Down Down Down", '16.21', '16.22')).toMatchObject({ dir: 'mixed' });
  });

  it('une carte non modifiée ne dit rien', () => {
    expect(augmentChange('Goliath', '16.21', '16.22')).toBeNull();
  });

  it('les noms du relevé existent au module du wiki, sauf les 2 cartes nouvelles', () => {
    const wiki = parseAugmentModule(readFileSync('test/fixtures/mayhem-augments-wiki-nov.lua', 'utf8'));
    const absent = Object.keys(PATCHES[0].augments).filter((n) => !wiki.has(normName(n)));
    expect(absent.sort()).toEqual(['One Hit Wonder', 'RISE!']);
  });
});

describe('champions modifiés au patch', () => {
  it('ARAM et Mayhem, avec les noms du client ou d’arammeta', () => {
    expect(championChange(['Mel'], 'mayhem', '16.21', '16.22')).toMatchObject({ dir: 'mixed' });
    expect(championChange(['AurelionSol', 'Aurelion Sol'], 'aram', '16.21', '16.22')).toMatchObject({ dir: 'buff' });
  });

  it('la ligne Mayhem ne vaut pas en ARAM', () => {
    expect(championChange(['Hecarim'], 'mayhem', '16.21', '16.22')).toMatchObject({ dir: 'nerf' });
    expect(championChange(['Hecarim'], 'aram', '16.21', '16.22')).toBeNull();
  });

  it('Faille : selon le patch des stats OP.GG, jamais sans ce patch, sans la ligne Mayhem', () => {
    expect(championChange(['Mel'], 'sr', '16.21', '16.22')).toMatchObject({ dir: 'mixed', patch: '26.22' });
    expect(championChange(['Mel'], 'sr', '16.22', '16.22')).toBeNull();
    expect(championChange(['Mel'], 'sr', undefined, '16.22')).toBeNull();
    expect(championChange(['Hecarim'], 'sr', '16.21', '16.22')).toBeNull();
  });

  it('rien une fois les stats à jour', () => {
    expect(championChange(['Mel'], 'mayhem', '16.22', '16.22')).toBeNull();
    expect(championChange(['Jinx'], 'mayhem', '16.21', '16.22')).toBeNull();
  });
});
