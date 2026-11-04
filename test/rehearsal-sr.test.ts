// Répétition générale Faille : le vrai moteur sur les vraies parties Swiftplay de Celian (salon, champ select fantôme, partie, fin).
// OP.GG est remplacé par la vraie analyse enregistrée : ça prouve l'absence de casse et le bon chemin, pas la qualité des conseils.
// Ne tourne que si ARAM_REHEARSAL_DIR pointe vers une copie de probe-output/, qui ne va jamais dans le dépôt.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { readAnalysis } from '../src/core/opgg';
import { PUUID, game, startMockLcu } from './mock-lcu';
import { ddFetcher } from './ddragon-fixture';

const dir = process.env.ARAM_REHEARSAL_DIR ?? '';
const fixtures = join(__dirname, 'fixtures');
const real = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const report: string[] = [];
const flush = () => new Promise((r) => setTimeout(r, 40));

type Hist = { gameId: number; queueId: number; mode: string; createdAt: number; durationSec: number; championId: number; items?: number[]; enemies?: number[]; allies?: number[]; win: boolean };

describe.skipIf(!dir)('répétition générale Faille (Swiftplay)', () => {
  let mock: Awaited<ReturnType<typeof startMockLcu>>;
  let engine: Engine;
  let probeDir: string;
  const games = (dir ? real('historique.json').games : []) as Hist[];
  const sr = games.filter((g) => g.mode === 'sr');
  const ahri = readAnalysis(JSON.parse(readFileSync(join(fixtures, 'opgg', 'opgg-sample-analysis.json'), 'utf8')).result, 'mid')!;

  beforeAll(async () => {
    mock = await startMockLcu();
    const ids = new Set<number>(sr.flatMap((g) => [g.championId, ...(g.enemies ?? []), ...(g.allies ?? [])]));
    for (const f of readdirSync(dir).filter((x) => /^champselect-\d+\.json$/.test(x))) for (const p of real(f).myTeam) if (p.championId) ids.add(p.championId);
    (mock.state as unknown as { champions: unknown[] }).champions = [...ids].map((id) => ({ id, name: `C${id}`, alias: `C${id}` }));
    const items = new Set<number>(sr.flatMap((g) => g.items ?? []));
    mock.state.itemData = [...items].filter((id) => id < 100000).map((id) => ({ id, name: `Objet ${id}`, priceTotal: 900 + (id % 2200) }));
    const dataDir = mkdtempSync(join(tmpdir(), 'aram-rehearsal-sr-'));
    probeDir = mkdtempSync(join(tmpdir(), 'aram-rehearsal-sr-probe-'));
    // L'historique sans les parties Faille : elles sont rejouées jusqu'à l'enregistrement.
    writeFileSync(join(dataDir, 'history.json'), JSON.stringify({ version: 1, games: games.filter((g) => g.mode !== 'sr') }));
    engine = new Engine({
      dataDir,
      probeDir,
      discover: async () => ({ port: mock.port, token: mock.token }),
      live: { port: mock.port },
      arammeta: new Arammeta(join(dataDir, 'cache'), async (url) => {
        const file = url.replace('https://arammeta.com/api/', '');
        return readFileSync(join(fixtures, /champions\/\d+\.json/.test(file) && !existsSync(join(fixtures, file)) ? 'champions/54.json' : file), 'utf8');
      }),
      balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
      augInfoFetcher: async () => readFileSync(join(fixtures, 'mayhem-augments.lua'), 'utf8'),
      ddragonFetcher: ddFetcher(),
      pollMs: 3600_000,
    });
    (engine as unknown as { opggData: object }).opggData = {
      analysis: async () => ahri,
      mainLane: async () => 'jungle',
      guessLanes: async (foes: { id: number }[]) => new Map(foes.map((f, i) => [f.id, ['top', 'jungle', 'mid', 'adc', 'support'][i % 5]])),
      laneMeta: async () => new Map(),
      matchupGuide: async () => null,
    };
    await engine.start();
    await engine.refreshData(false);
  }, 60000);

  afterAll(async () => {
    writeFileSync(process.env.ARAM_REHEARSAL_OUT ?? join(tmpdir(), 'aram-rehearsal-sr.txt'), report.join('\n'));
    engine?.stop();
    await mock?.close();
  });

  for (const position of ['JUNGLE', '', 'NONE']) {
    it(`rejoue chaque partie Swiftplay capturée, position du Live Client « ${position} »`, async () => {
      const st = mock.state as unknown as Record<string, unknown>;
      const files = readdirSync(dir).filter((f) => /^champselect-\d+\.json$/.test(f)).filter((f) => real(f).queueId === 480);
      let played = 0;
      for (const f of files) {
        const at = Number(f.slice(12, -5));
        const g = sr.find((x) => Math.abs(x.createdAt - at) < 120_000 && x.durationSec > 300);
        if (!g) continue;
        const session = real(f);
        const me = (session.myTeam as { cellId: number; puuid?: string; championId: number; assignedPosition: string }[]).find((p) => p.cellId === session.localPlayerCellId)!;
        me.puuid = PUUID;
        const tag = `${g.gameId} ${position || 'vide'}`;

        // Salon
        mock.state.queue = { id: 480, gameMode: 'SWIFTPLAY' };
        mock.state.lobby = { gameConfig: { queueId: 480 }, localMember: { playerSlots: [{ championId: g.championId, positionPreference: 'JUNGLE', spell1: 4, spell2: 11, perks: JSON.stringify({ perkIds: ahri.runes!.perks, perkStyle: ahri.runes!.primary, perkSubStyle: ahri.runes!.sub }) }, { championId: 113, positionPreference: 'TOP', spell1: 4, spell2: 12, perks: '' }] } };
        st.phase = 'Lobby';
        await engine.tick();
        await vi.waitFor(() => expect((engine as unknown as { slotsBusy: boolean }).slotsBusy).toBe(false));
        await engine.tick();
        await vi.waitFor(() => expect((engine as unknown as { slotsBusy: boolean }).slotsBusy).toBe(false));
        // La boucle d'`engine.start` tourne aussi : un tick resté sur la phase d'avant efface `slotsKey`, le tick suivant relit le salon
        await vi.waitFor(async () => {
          await engine.tick();
          expect(engine.state.swiftplay?.slots.length, tag).toBe(2);
        });

        // Champ select fantôme : la vraie capture. Rien ne doit être écrit dans le client.
        mock.calls.length = 0;
        st.phase = 'ChampSelect';
        st.session = session;
        st.subset = [];
        await engine.tick();
        await flush();
        await engine.tick();
        const c = engine.state.champSelect;
        expect(c?.sr?.laneLabel, tag).toBe('jungle');
        expect(mock.calls.filter((x) => x.method !== 'GET'), tag).toEqual([]);
        report.push(`${tag} champ select : rôle ${c?.sr?.laneLabel}`);

        // Partie : mêmes joueurs, objets révélés peu à peu, les vrais objets de fin de partie.
        const team = (session.myTeam as { championId: number }[]).map((p) => p.championId);
        const foes = g.enemies ?? [];
        const sel = [...team.map((id) => ({ championId: id, puuid: id === g.championId ? PUUID : `a${id}` })), ...foes.map((id) => ({ championId: id, puuid: `e${id}` }))];
        st.phase = 'InProgress';
        st.session = null;
        st.gameId = g.gameId;
        st.selections = sel;
        st.teams = { teamOne: sel.slice(0, team.length), teamTwo: sel.slice(team.length) };
        const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
        const all = (g.items ?? []).filter((i) => i !== 3340 && i !== 3364);
        const steps = [0, 1, 2, 3, all.length];
        for (const [i, n] of steps.entries()) {
          const inv = (ids: number[]) => ids.map((itemID, slot) => ({ itemID, slot, count: 1, consumable: false, price: 0, displayName: '' }));
          const player = (id: number, k: number, side: string) => ({
            riotId: id === g.championId ? 'Moi#X' : `J${id}#X`, riotIdGameName: id === g.championId ? 'Moi' : `J${id}`, summonerName: id === g.championId ? 'Moi' : `J${id}`,
            championName: `C${id}`, rawChampionName: `game_character_displayname_C${id}`, team: side, level: 3 + i * 3, position: position === 'JUNGLE' ? (id === g.championId ? 'JUNGLE' : lanes[k]) : position,
            items: inv(id === g.championId ? all.slice(0, n) : []), summonerSpells: {}, scores: {}, isDead: false,
          });
          st.live = {
            gameTime: i * 240,
            me: { currentGold: i ? 1200 : 1400, level: 3 + i * 3, riotId: 'Moi#X', riotIdGameName: 'Moi', summonerName: 'Moi', championStats: { attackRange: 125 }, abilities: { Q: { abilityLevel: 1 }, W: { abilityLevel: 1 }, E: { abilityLevel: 1 }, R: { abilityLevel: 0 } } },
            players: [...team.map((id, k) => player(id, k, 'ORDER')), ...foes.map((id, k) => player(id, k, 'CHAOS'))],
          };
          await engine.tick();
          await flush();
          await engine.tick();
          const e = engine.state;
          expect(e.mode, tag).toBe('sr');
          expect(e.augments, tag).toBeNull();
          expect(e.counters?.jungle, tag).toBe(true);
          expect(e.counters?.damage ?? null, `${tag} dégâts`).not.toBeUndefined();
          if (i === 0) expect(e.nextBuy?.starter, `${tag} départ`).toBeTruthy();
          if (i > 0) expect(e.nextBuy?.starter ?? null, `${tag} départ effacé`).toBeNull();
          report.push(`${tag} t=${i * 240} objets=${n} départ=${e.nextBuy?.starter ? 'oui' : 'non'} achat=${e.nextBuy?.rows[0]?.item?.name ?? '-'} (${e.nextBuy?.rows[0]?.why ?? '-'}) sort=${JSON.stringify(e.skillNext ?? null).slice(0, 60)} écart=${e.goldGap?.gap ?? '-'} lane=${JSON.stringify(e.counters?.lane ?? null).slice(0, 90)}`);
        }

        // Fin : enregistrée en Faille, sans augment, sans faire tomber le panneau sur la partie suivante.
        const d = game(g.gameId, 480, g.championId, g.win);
        d.gameDuration = g.durationSec;
        mock.state.games[g.gameId] = d;
        mock.state.eogGameId = g.gameId;
        st.phase = 'EndOfGame';
        await engine.tick();
        await flush();
        await engine.tick();
        st.phase = 'None';
        mock.state.lobby = undefined;
        await engine.tick();
        expect(engine.state.nextBuy, tag).toBeNull();
        expect(engine.state.swiftplay ?? null, tag).toBeNull();
        played++;
      }
      report.push(`parties rejouées (position ${position || 'vide'}) : ${played}`);
      expect(played).toBeGreaterThan(0);
    }, 120000);
    if (position === 'JUNGLE') it('fin de partie : parties notées en Faille, une seule fois', () => {
      const h = (engine as unknown as { history: { games: { mode: string; gameId: number }[] } }).history.games;
      report.push(`historique Faille après la répétition : ${h.filter((g) => g.mode === 'sr').length}`);
      expect(h.filter((g) => g.mode === 'sr').length).toBeGreaterThan(0);
      expect(new Set(h.map((g) => g.gameId)).size).toBe(h.length);
    });
  }

  it('journal sans erreur interne', () => {
    const j = existsSync(join(probeDir, 'journal.txt')) ? readFileSync(join(probeDir, 'journal.txt'), 'utf8').split('\n') : [];
    report.push(...j.slice(0, 80));
    expect(j.filter((l) => /Erreur interne/.test(l))).toEqual([]);
  });
});
