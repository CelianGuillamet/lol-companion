// Répétition générale : le vrai moteur sur les vraies données de Celian (probe-output/), avec les vrais formats du jeu.
// Ne tourne que si ARAM_REHEARSAL_DIR pointe vers une copie de probe-output/, qui ne va jamais dans le dépôt.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../src/core/engine';
import { Arammeta } from '../src/core/arammeta';
import { Balance } from '../src/core/balance';
import { PUUID, startMockLcu } from './mock-lcu';
import { ddFetcher } from './ddragon-fixture';

const dir = process.env.ARAM_REHEARSAL_DIR ?? '';
const fixtures = join(__dirname, 'fixtures');
const real = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const report: string[] = [];

describe.skipIf(!dir)('répétition générale sur les vraies données', () => {
  let mock: Awaited<ReturnType<typeof startMockLcu>>;
  let engine: Engine;
  let probeDir: string;
  const flush = () => new Promise((r) => setTimeout(r, 30));

  const tier = JSON.parse(readFileSync(join(fixtures, 'tier-list.json'), 'utf8'));
  const ids = new Set<number>();
  const hist = (dir ? real('historique.json').games : []) as { gameId: number; championId: number; mode: string }[];
  for (const g of hist) ids.add(g.championId);
  const sessions = (dir ? readdirSync(dir) : []).filter((f) => /^gameflow-session-\d+\.json$/.test(f));
  for (const f of sessions) for (const p of real(f).gameData?.playerChampionSelections ?? []) ids.add(p.championId);

  beforeAll(async () => {
    mock = await startMockLcu();
    (mock.state as unknown as { champions: unknown[] }).champions = [...ids].map((id) => ({ id, name: `C${id}`, alias: `C${id}` }));
    const dataDir = mkdtempSync(join(tmpdir(), 'aram-rehearsal-'));
    probeDir = mkdtempSync(join(tmpdir(), 'aram-rehearsal-probe-'));
    cpSync(join(dir, 'usage.json'), join(probeDir, 'usage.json'));
    writeFileSync(join(dataDir, 'history.json'), JSON.stringify({ version: 1, games: real('historique.json').games }));
    const fetcher = async (url: string) => {
      const file = url.replace('https://arammeta.com/api/', '');
      if (file === 'tier-list.json' || file.endsWith('tier-list.json')) return JSON.stringify(tier);
      const m = file.match(/champions\/(\d+)\.json/);
      if (m && !existsSync(join(fixtures, file))) return readFileSync(join(fixtures, 'champions', '54.json'), 'utf8');
      return readFileSync(join(fixtures, file), 'utf8');
    };
    engine = new Engine({
      dataDir,
      probeDir,
      discover: async () => ({ port: mock.port, token: mock.token }),
      live: { port: mock.port },
      arammeta: new Arammeta(join(dataDir, 'cache'), fetcher),
      balance: new Balance(join(dataDir, 'balance'), async () => { throw new Error('hors ligne'); }),
      augInfoFetcher: async () => readFileSync(join(fixtures, 'mayhem-augments.lua'), 'utf8'),
      ddragonFetcher: ddFetcher(),
      pollMs: 3600_000,
    });
    await engine.start();
    await engine.refreshData(false);
    await new Promise((r) => setTimeout(r, 200));
  }, 60000);

  afterAll(async () => {
    const out = process.env.ARAM_REHEARSAL_OUT ?? join(tmpdir(), 'aram-rehearsal.txt');
    writeFileSync(out, report.join('\n'));
    engine?.stop();
    await mock?.close();
    writeFileSync(`${out}.history.json`, JSON.stringify({ version: 1, games: (engine as unknown as { history: { games: unknown[] } }).history.games }));
  });

  it('1er lancement : les revues des anciennes parties passent sans perte', async () => {
    const before = hist.length;
    const t0 = Date.now();
    const n = await engine.backfillReviews();
    const hg = (engine as unknown as { history: { games: { review?: { choices?: unknown[]; approx?: boolean }; buys?: unknown }[] } }).history.games;
    report.push(`revues faites: ${n} en ${Date.now() - t0} ms, parties ${hg.length}/${before}, avec review ${hg.filter((g) => g.review).length}, avec buys ${hg.filter((g) => g.buys).length}`);
    expect(hg.length).toBe(before);
    expect(await engine.backfillReviews()).toBe(0); // 2e passage : plus rien à faire
  }, 60000);

  it('rejoue chaque capture de partie sans erreur', async () => {
    const choix = readdirSync(dir)
      .filter((f) => /^liveclient-choix\d-\d+\.json$/.test(f))
      .map((f) => ({ at: Number(f.split('-')[2].slice(0, -5)), ...real(f) }))
      .sort((a, b) => a.at - b.at);
    const games = hist as unknown as { gameId: number; championId: number; createdAt: number; durationSec: number }[];
    // Catalogue du vrai client absent d'ici : les objets normaux lus ont un prix, les ids de mode (> 100000) non, comme en vrai.
    const seenIds = new Set<number>(choix.flatMap((c) => [...(c.me?.items ?? []).map((i: { itemID: number }) => i.itemID), ...(c.players ?? []).flatMap((p: { items: number[] }) => p.items)]));
    mock.state.itemData = [...seenIds].filter((id) => id < 100000).map((id) => ({ id, name: `Objet ${id}`, priceTotal: 1000 + (id % 2000) }));
    await engine.refreshData(true);
    let played = 0;
    let frames = 0;
    let withUnknown = 0;
    let realPlayers = 0;
    for (const f of sessions) {
      const s = real(f);
      const gameId = s.gameData?.gameId as number;
      const g = games.find((x) => x.gameId === gameId);
      if (!g || !s.gameData.teamOne) continue;
      const caps = choix.filter((c) => c.me && c.at >= g.createdAt - 60_000 && c.at <= g.createdAt + (g.durationSec + 300) * 1000);
      if (!caps.length) continue;
      const mine = g.championId;
      const inOne = new Set((s.gameData.teamOne as { championId: number }[]).map((p) => p.championId));
      const sel = (s.gameData.playerChampionSelections as { championId: number; puuid: string }[]).map((p) => (p.championId === mine ? { ...p, puuid: PUUID } : p));
      const st = mock.state as unknown as Record<string, unknown>;
      st.phase = 'InProgress';
      st.queue = { id: s.gameData.queue.id, gameMode: s.gameData.queue.gameMode };
      st.gameId = gameId;
      st.selections = sel;
      st.teams = { teamOne: s.gameData.teamOne, teamTwo: s.gameData.teamTwo };
      for (const [i, cap] of caps.entries()) {
        // Depuis la v1.78 la capture garde les 10 vrais joueurs, avant les 9 autres sont des copies de toi. Le nom réel ne donne pas
        // l'id ici : chaque joueur prend la place d'un champion de la bonne équipe, ce qui suffit pour les totaux (écart d'objets).
        type Real = { champion: string; team: string; items: number[]; level: number; position: string };
        const real10 = (cap.players ?? []) as Real[];
        const myTeam = real10.find((p) => p.champion === cap.me.championName)?.team;
        const pools = [real10.filter((p) => p.team === myTeam && p.champion !== cap.me.championName), real10.filter((p) => p.team !== myTeam)];
        const meOne = inOne.has(mine);
        const realOf = new Map<number, Real>();
        for (const p of sel) {
          const r = p.championId !== mine && pools[inOne.has(p.championId) === meOne ? 0 : 1].shift();
          if (r) realOf.set(p.championId, r);
        }
        if (realOf.size) realPlayers++;
        const players = sel.map((p) => ({
          ...cap.me,
          riotId: p.championId === mine ? 'Moi#X' : `J${p.championId}#X`,
          riotIdGameName: p.championId === mine ? 'Moi' : `J${p.championId}`,
          summonerName: p.championId === mine ? 'Moi' : `J${p.championId}`,
          championName: `C${p.championId}`,
          rawChampionName: `game_character_displayname_C${p.championId}`,
          team: inOne.has(p.championId) ? 'ORDER' : 'CHAOS',
          skinName: p.championId === mine ? cap.me.skinName : '',
          ...(realOf.has(p.championId) ? { level: realOf.get(p.championId)!.level, position: realOf.get(p.championId)!.position, items: realOf.get(p.championId)!.items.map((itemID, slot) => ({ itemID, slot, count: 1, consumable: false, price: 0, displayName: '' })) } : {}),
        }));
        st.live = { gameTime: 180 + i * 300, me: { ...cap.activeplayer, riotId: 'Moi#X', riotIdGameName: 'Moi', summonerName: 'Moi' }, players };
        await engine.tick();
        await flush();
        await engine.tick();
        frames++;
        const e = engine.state;
        expect('enemySpells' in e, `pas de timers de sorts ennemis ${gameId}`).toBe(false);
        if (cap.me.items.some((it: { consumable: boolean }) => !it.consumable)) {
          expect(e.goldGap, `écart ${gameId}`).toBeTruthy();
          if (e.goldGap!.unknown) withUnknown++;
        }
        report.push(`${gameId} choix${cap.round} next=${e.nextBuy?.rows[0]?.item?.name ?? '-'} gap=${e.goldGap?.gap ?? '-'} inconnus=${e.goldGap?.unknown ?? '-'}`);
      }
      played++;
      st.phase = 'None';
      await engine.tick();
    }
    report.push(`parties rejouées: ${played}, ${frames} lectures, dont ${withUnknown} avec objets sans prix`);
    expect(played).toBeGreaterThan(0);
  }, 240000);

  it('rejoue chaque champ select capturé', async () => {
    const files = readdirSync(dir).filter((f) => /^champselect-\d+\.json$/.test(f));
    const st = mock.state as unknown as Record<string, unknown>;
    let ok = 0;
    for (const f of files) {
      const session = real(f);
      const me = (session.myTeam as { cellId: number; puuid?: string }[]).find((p) => p.cellId === session.localPlayerCellId);
      if (me) me.puuid = PUUID;
      st.phase = 'ChampSelect';
      st.queue = { id: session.queueId, gameMode: session.queueId === 450 ? 'ARAM' : session.queueId === 480 ? 'SWIFTPLAY' : 'KIWI' };
      st.session = session;
      st.subset = [];
      await engine.tick();
      await flush();
      await engine.tick();
      const c = engine.state.champSelect;
      expect(c, f).toBeTruthy();
      if (c) ok++;
      st.phase = 'None';
      st.session = null;
      await engine.tick();
    }
    report.push(`champ select rejoués: ${ok}/${files.length}`);
  }, 120000);

  it('journal sans erreur interne', () => {
    const j = existsSync(join(probeDir, 'journal.txt')) ? readFileSync(join(probeDir, 'journal.txt'), 'utf8').split('\n') : [];
    report.push(...j.filter((l) => /\[(warning|error)\]|impossible/i.test(l)).slice(0, 30));
    report.push(`journal: ${j.length} lignes`, ...j.slice(0, 12));
    expect(j.filter((l) => /Erreur interne/.test(l))).toEqual([]);
  });
});
