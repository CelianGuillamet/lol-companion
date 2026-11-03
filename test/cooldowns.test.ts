import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CooldownData, ddragonCandidates, parseItemHaste, rescale, summonerKey, ultRank, withHaste } from '../src/core/cooldowns';
import { ddFetcher } from './ddragon-fixture';

describe('calcul des cooldowns', () => {
  it('lit la haste d’un objet : stats, haste d’ultime, haste d’invocateur', () => {
    expect(parseItemHaste('<mainText><stats><attention>10</attention> Ability Haste<br><attention>45</attention> Move Speed</stats><br><passive>Ionian Insight</passive><br>Gain <attention>10</attention> Summoner Spell Haste.</mainText>')).toEqual({ ability: 10, ultimate: 0, summoner: 10 });
    expect(parseItemHaste('<stats><attention>20</attention> Ability Haste</stats> Gain <attention>20</attention> Ultimate Ability Haste.')).toEqual({ ability: 20, ultimate: 20, summoner: 0 });
    // La haste du passif n'est pas comptée comme haste de base.
    expect(parseItemHaste('<stats><attention>70</attention> Ability Power</stats> Gain 15 Ability Haste after a kill')).toEqual({ ability: 0, ultimate: 0, summoner: 0 });
  });

  it('nom interne du sort d’invocateur', () => {
    expect(summonerKey('GeneratedTip_SummonerSpell_SummonerFlash_DisplayName')).toBe('SummonerFlash');
    expect(summonerKey('GeneratedTip_SummonerSpell_SummonerSnowball_DisplayName')).toBe('SummonerSnowball');
    expect(summonerKey(undefined)).toBeNull();
  });

  it('formule de la haste et changement de haste pendant le cooldown', () => {
    expect(withHaste(300, 0)).toBe(300);
    expect(withHaste(300, 10)).toBeCloseTo(272.73, 2);
    expect(withHaste(100, 100)).toBe(50);
    // 100 s restantes à 0 haste, il achète 25 haste : 80 s restantes.
    expect(rescale(100, 0, 25)).toBe(80);
  });

  it('rang de l’ultime selon le niveau', () => {
    expect([1, 5, 6, 10, 11, 15, 16, 18].map((l) => ultRank(l, 3))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([1, 5, 6, 11, 16].map((l) => ultRank(l, 4))).toEqual([1, 1, 2, 3, 4]);
  });

  it('charge Data Dragon, ignore les variantes d’autres modes, garde le cache', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dd-'));
    const calls: string[] = [];
    const data = new CooldownData(dir, ddFetcher(calls));
    await data.load('16.21.1');
    expect(data.ready).toBe(true);
    expect(data.summoner('SummonerFlash')).toMatchObject({ name: 'Flash', cooldown: 300 });
    expect(data.summoner('SummonerFlash_Jade')).toBeNull();
    expect(data.summoner('SummonerFlash')!.icon).toBe('https://ddragon.leagueoflegends.com/cdn/16.21.1/img/spell/SummonerFlash.png');
    expect(data.hasteOf([3158, 3118, 6653, 3020])).toEqual({ ability: 30, ultimate: 20, summoner: 10 });
    expect(data.sellValue(3020)).toBe(770);
    expect(data.sellValue(3158)).toBeNull(); // pas de `gold` : rien n'est supposé
    await data.loadChampion('Ahri');
    expect(data.ultimate('Ahri')).toMatchObject({ name: 'Spirit Rush', cooldown: [140, 120, 100], maxrank: 3 });
    expect(calls).toHaveLength(3);

    const again = new CooldownData(dir, async () => {
      throw new Error('hors ligne');
    });
    await again.load('16.21.1');
    await again.loadChampion('Ahri');
    expect(again.ready).toBe(true);
    expect(again.ultimate('Ahri')?.cooldown).toEqual([140, 120, 100]);
  });

  it('réseau coupé : pas prêt, erreur gardée, rien d’inventé', async () => {
    const data = new CooldownData(mkdtempSync(join(tmpdir(), 'dd-')), async () => {
      throw new Error('hors ligne');
    });
    await data.load('16.21.1');
    expect(data.ready).toBe(false);
    expect(data.error).toBe('hors ligne');
    expect(data.ultimate('Ahri')).toBeNull();
  });

  it('réseau coupé : une tentative par minute, pas à chaque tick', async () => {
    let now = 0;
    let calls = 0;
    const data = new CooldownData(mkdtempSync(join(tmpdir(), 'dd-')), async () => {
      calls++;
      throw new Error('hors ligne');
    }, () => now);
    await data.load('16.21.1');
    await data.load('16.21.1');
    expect(calls).toBe(1);
    now = 61_000;
    await data.load('16.21.1');
    expect(calls).toBe(2);
  });
});

describe('cooldowns le jour d’un patch', () => {
  it('prend la version du client seulement si elle dépasse celle d’arammeta', () => {
    expect(ddragonCandidates('16.22', '16.21.1')).toEqual(['16.22.1', '16.21.1']);
    expect(ddragonCandidates('16.21', '16.21.1')).toEqual(['16.21.1']);
    expect(ddragonCandidates('16.21', '16.22.1')).toEqual(['16.22.1']);
    expect(ddragonCandidates(undefined, '16.21.1')).toEqual(['16.21.1']);
  });

  it('reste sur l’ancienne version tant que Data Dragon n’a pas la nouvelle, puis bascule', async () => {
    let now = 0;
    let published = false;
    const ok = ddFetcher();
    const fetcher = async (url: string) => {
      if (url.includes('/16.22.1/') && !published) throw new Error('HTTP 403');
      return ok(url);
    };
    const cd = new CooldownData(mkdtempSync(join(tmpdir(), 'aram-dd-')), fetcher, () => now, 60_000);
    const versions = ddragonCandidates('16.22', '16.21.1');
    await cd.loadAny(versions);
    expect(cd.ready).toBe(true);
    expect(cd.version).toBe('16.21.1');
    expect(cd.error).toBeNull();
    published = true;
    await cd.loadAny(versions); // moins d'une minute après l'échec : pas de nouvel essai
    expect(cd.version).toBe('16.21.1');
    now = 61_000;
    await cd.loadAny(versions);
    expect(cd.version).toBe('16.22.1');
  });
});
